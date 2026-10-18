import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

// Leitura de edital pode levar alguns minutos em PDFs grandes.
export const maxDuration = 300;

const LIMITE_BYTES = 30 * 1024 * 1024;

const CorpoJson = z.object({
  storagePath: z.string().min(1),
  cargo: z.string().max(200).optional(),
  paginas: z.string().max(50).optional(),
});

/**
 * POST /api/editais/extrair
 *
 * Duas formas de enviar o PDF:
 *  - JSON { storagePath } — o navegador já subiu o arquivo para o bucket "editais"
 *    (caminho recomendado: não esbarra no limite de corpo de requisição da Vercel).
 *  - multipart/form-data com o campo "arquivo" — para rodar localmente sem Supabase.
 *
 * Devolve o conteúdo extraído para revisão; nada é gravado na ementa até a
 * confirmação na tela (função SQL importar_edital).
 */
export async function POST(request: Request) {
  let provedor;
  try {
    provedor = obterProvedor();
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }

  const comBanco = supabaseConfigurado();
  const ctx = comBanco ? await usuarioAtual() : null;
  if (comBanco && !ctx?.user) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  // ---- lê o PDF ----
  let pdf: Buffer;
  let cargo: string | undefined;
  let paginas: string | undefined;
  let storagePath: string | null = null;

  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    if (!ctx) return NextResponse.json({ erro: "Envio por storage exige o Supabase configurado." }, { status: 400 });
    const corpo = CorpoJson.safeParse(await request.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
    ({ cargo, paginas, storagePath } = corpo.data);
    if (!storagePath!.startsWith(`${ctx.user!.id}/`)) return NextResponse.json({ erro: "Arquivo não encontrado." }, { status: 404 });
    const { data, error } = await ctx.supabase.storage.from("editais").download(storagePath!);
    if (error || !data) return NextResponse.json({ erro: "Não deu para baixar o PDF enviado. Tente enviar de novo." }, { status: 404 });
    pdf = Buffer.from(await data.arrayBuffer());
  } else {
    const form = await request.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Envie o PDF no campo 'arquivo'." }, { status: 400 });
    if (arquivo.size > LIMITE_BYTES) return NextResponse.json({ erro: "PDF maior que 30 MB. Envie só as páginas do conteúdo programático." }, { status: 413 });
    pdf = Buffer.from(await arquivo.arrayBuffer());
    cargo = (form?.get("cargo") as string | null) || undefined;
    paginas = (form?.get("paginas") as string | null) || undefined;
  }

  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ erro: "O arquivo enviado não é um PDF." }, { status: 415 });
  }

  // ---- registra a importação ----
  let importacaoId: string | null = null;
  if (ctx) {
    const { data } = await ctx.supabase
      .from("edital_importacoes")
      .insert({ arquivo_path: storagePath, paginas, provider: provedor.nome, modelo: provedor.modeloEdital })
      .select("id")
      .single();
    importacaoId = data?.id ?? null;
  }

  // ---- extrai ----
  try {
    const { resultado, uso } = await provedor.extrairEdital(pdf.toString("base64"), { cargo, paginas });
    if (ctx && importacaoId) {
      await ctx.supabase
        .from("edital_importacoes")
        .update({ status: "concluida", resultado, tokens_entrada: uso.tokensEntrada, tokens_saida: uso.tokensSaida })
        .eq("id", importacaoId);
    }
    return NextResponse.json({
      importacaoId,
      storagePath,
      provider: provedor.nome,
      modelo: provedor.modeloEdital,
      uso,
      resultado,
    });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    if (ctx && importacaoId) {
      await ctx.supabase.from("edital_importacoes").update({ status: "erro", erro: mensagem }).eq("id", importacaoId);
    }
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
