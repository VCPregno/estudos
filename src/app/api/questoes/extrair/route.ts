import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { interpretarIntervalo, recortarPaginas, contarPaginas } from "@/lib/pdf/paginas";
import { type Classificacao, montarClassificacao, nomeDaProva, prepararQuestoes } from "@/lib/questoes";
import { usuarioAtual } from "@/lib/supabase/server";

// Uma prova de 60 questões escaneada leva de 1 a 4 minutos para ser transcrita.
export const maxDuration = 300;

const LIMITE_BYTES = 30 * 1024 * 1024;
// A IA recebe os PDFs embutidos na requisição; acima disso, só em partes.
const LIMITE_IA_BYTES = 14 * 1024 * 1024;

const Origem = z.union([z.object({ storagePath: z.string().min(1) }), z.object({ url: z.url().max(2000) })]);

const Corpo = z.object({
  editalId: z.uuid().nullable().optional(),
  caderno: Origem,
  gabarito: Origem.nullable().optional(),
  paginas: z.string().max(50).optional(),
});

class ErroEntrada extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function hostPermitido(url: URL) {
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // IP literal
  return h.includes(".");
}

async function baixarLink(endereco: string, rotulo: string): Promise<Buffer> {
  const url = new URL(endereco);
  if (!hostPermitido(url)) throw new ErroEntrada(`O link do ${rotulo} precisa ser um endereço https público.`);
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!r || !r.ok) throw new ErroEntrada(`Não consegui baixar o ${rotulo} pelo link (${r?.status ?? "sem resposta"}). Baixe o PDF e envie o arquivo.`, 422);
  const tamanho = Number(r.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_BYTES) throw new ErroEntrada(`O ${rotulo} passa de 30 MB.`, 413);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > LIMITE_BYTES) throw new ErroEntrada(`O ${rotulo} passa de 30 MB.`, 413);
  return buf;
}

export async function POST(request: Request) {
  let provedor;
  try {
    provedor = obterProvedor();
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
  if (!supabaseConfigurado()) return NextResponse.json({ erro: "A importação de provas precisa do Supabase configurado." }, { status: 400 });

  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  const { editalId, caderno, gabarito, paginas } = corpo.data;

  async function ler(o: z.infer<typeof Origem>, rotulo: string): Promise<Buffer> {
    if ("url" in o) return baixarLink(o.url, rotulo);
    if (!o.storagePath.startsWith(`${user!.id}/`)) throw new ErroEntrada("Arquivo não encontrado.", 404);
    const { data, error } = await supabase.storage.from("editais").download(o.storagePath);
    if (error || !data) throw new ErroEntrada(`Não deu para ler o ${rotulo} enviado. Envie de novo.`, 404);
    return Buffer.from(await data.arrayBuffer());
  }

  // ---- PDFs ----
  let pdfCaderno: Buffer;
  let pdfGabarito: Buffer | null = null;
  try {
    [pdfCaderno, pdfGabarito] = await Promise.all([ler(caderno, "caderno"), gabarito ? ler(gabarito, "gabarito") : Promise.resolve(null)]);
    for (const [buf, rotulo] of [
      [pdfCaderno, "caderno"],
      [pdfGabarito, "gabarito"],
    ] as const) {
      if (buf && buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErroEntrada(`O ${rotulo} não é um PDF.`, 415);
    }
    if (paginas?.trim()) {
      const bytes = new Uint8Array(pdfCaderno).buffer;
      const indices = interpretarIntervalo(paginas, await contarPaginas(bytes));
      pdfCaderno = Buffer.from(await recortarPaginas(bytes, indices));
    }
    if (pdfCaderno.length + (pdfGabarito?.length ?? 0) > LIMITE_IA_BYTES) {
      throw new ErroEntrada("A prova é grande demais para uma leitura só. Informe um intervalo de páginas e importe em partes.", 413);
    }
  } catch (e) {
    const status = e instanceof ErroEntrada ? e.status : 400;
    return NextResponse.json({ erro: (e as Error).message }, { status });
  }

  // ---- ementa para classificar ----
  let classificacao: Classificacao = { texto: "", disciplinas: new Map(), topicos: new Map() };
  if (editalId) {
    const [{ data: discs }, { data: tops }] = await Promise.all([
      supabase.from("edital_disciplinas").select("ordem, disciplinas(id, nome)").eq("edital_id", editalId).order("ordem"),
      supabase.from("topicos_ementa").select("id, disciplina_id, parent_id, titulo, ordem").eq("edital_id", editalId),
    ]);
    const disciplinas = (discs ?? [])
      .map((d) => d.disciplinas as unknown as { id: string; nome: string } | null)
      .filter((d): d is { id: string; nome: string } => !!d);
    classificacao = montarClassificacao(
      disciplinas,
      (tops ?? []).map((t) => ({ id: t.id, disciplinaId: t.disciplina_id, parentId: t.parent_id, titulo: t.titulo, ordem: t.ordem })),
    );
  }

  const { data: imp } = await supabase
    .from("prova_importacoes")
    .insert({
      edital_id: editalId ?? null,
      origem: { caderno, gabarito: gabarito ?? null },
      paginas: paginas || null,
      provider: provedor.nome,
      modelo: provedor.modeloEdital,
    })
    .select("id")
    .single();

  try {
    const { resultado, uso } = await provedor.extrairProva(
      [pdfCaderno.toString("base64"), ...(pdfGabarito ? [pdfGabarito.toString("base64")] : [])],
      { classificacao: classificacao.texto, temGabarito: !!pdfGabarito, paginas: paginas || undefined },
    );
    const questoes = prepararQuestoes(resultado, classificacao);
    if (imp) {
      await supabase
        .from("prova_importacoes")
        .update({ status: "concluida", resultado, tokens_entrada: uso.tokensEntrada, tokens_saida: uso.tokensSaida })
        .eq("id", imp.id);
    }
    return NextResponse.json({
      importacaoId: imp?.id ?? null,
      prova: { ...resultado.prova, nome: nomeDaProva(resultado.prova) },
      gabaritoOficial: !!pdfGabarito && resultado.gabarito_oficial,
      observacoes: resultado.observacoes,
      questoes,
      provider: provedor.nome,
      modelo: provedor.modeloEdital,
    });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    if (imp) await supabase.from("prova_importacoes").update({ status: "erro", erro: mensagem }).eq("id", imp.id);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
