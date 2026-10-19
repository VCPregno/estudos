import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { normalizarNotas } from "@/lib/redacao";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 120;

const Corpo = z
  .object({
    tipo: z.enum(["redacao", "discursiva"]),
    banca: z.string().trim().min(1).max(60),
    tema: z.string().trim().min(5, "Escreva o tema ou o enunciado.").max(8000),
    notaMaxima: z.number().positive().max(1000),
    notaMinima: z.number().min(0).max(1000).nullable(),
    linhasMin: z.number().int().min(0).max(200).nullable(),
    linhasMax: z.number().int().min(0).max(200).nullable(),
    criterios: z.string().trim().min(10).max(8000),
    texto: z.string().max(20000).optional(),
    imagens: z.array(z.string().min(3).max(500)).max(6).optional(),
  })
  .refine((c) => (c.texto?.trim().length ?? 0) >= 50 || (c.imagens?.length ?? 0) > 0, { message: "Mande a foto da redação ou digite o texto." });

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** POST /api/redacao/corrigir — corrige e grava; devolve o id da correção. */
export async function POST(request: Request) {
  if (!supabaseConfigurado()) return NextResponse.json({ erro: "A correção precisa do Supabase configurado." }, { status: 400 });
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  const d = corpo.data;

  let provedor;
  try {
    provedor = obterProvedor();
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }

  // ---- fotos ----
  const imagens: { mime: string; data: string }[] = [];
  for (const caminho of d.imagens ?? []) {
    if (!caminho.startsWith(`${user.id}/redacoes/`)) return NextResponse.json({ erro: "Imagem inválida." }, { status: 400 });
    const mime = MIME[caminho.split(".").pop()?.toLowerCase() ?? ""];
    if (!mime) return NextResponse.json({ erro: "Formato de imagem não aceito." }, { status: 415 });
    const { data, error } = await supabase.storage.from("mapas").download(caminho);
    if (error || !data) return NextResponse.json({ erro: "Não deu para ler a foto enviada. Envie de novo." }, { status: 404 });
    imagens.push({ mime, data: Buffer.from(await data.arrayBuffer()).toString("base64") });
  }

  try {
    const r = await provedor.corrigirRedacao({
      tipo: d.tipo,
      banca: d.banca,
      tema: d.tema,
      notaMaxima: d.notaMaxima,
      linhasMin: d.linhasMin,
      linhasMax: d.linhasMax,
      criterios: d.criterios,
      texto: d.texto?.trim() || undefined,
      imagens,
    });
    const { criterios, total } = normalizarNotas(r.criterios, d.notaMaxima);
    const nota = r.fuga_ao_tema ? 0 : total;
    const correcao = { ...r, criterios, nota_total: nota };

    const { data: linha, error } = await supabase
      .from("redacoes")
      .insert({
        tipo: d.tipo,
        banca: d.banca,
        tema: d.tema,
        nota_maxima: d.notaMaxima,
        nota_minima: d.notaMinima,
        linhas_min: d.linhasMin,
        linhas_max: d.linhasMax,
        criterios: d.criterios,
        imagens: d.imagens ?? [],
        texto: r.transcricao,
        correcao,
        nota,
        provider: provedor.nome,
        modelo: provedor.nome === "claude" ? provedor.modeloEdital : provedor.modeloTutor,
      })
      .select("id")
      .single();
    if (error || !linha) return NextResponse.json({ erro: `Corrigida, mas não deu para salvar: ${error?.message}` }, { status: 500 });
    return NextResponse.json({ id: linha.id });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
