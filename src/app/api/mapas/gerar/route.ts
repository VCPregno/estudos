import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { limparConteudo } from "@/lib/mapas";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 60;

const Corpo = z
  .object({
    formato: z.enum(["mapa", "fluxo"]),
    tema: z.string().trim().max(500).optional(),
    texto: z.string().max(30000).optional(),
    disciplinaId: z.uuid().nullable().optional(),
    assunto: z.string().trim().max(200).nullable().optional(),
    contexto: z.string().max(500).optional(),
  })
  .refine((c) => (c.tema?.length ?? 0) >= 3 || (c.texto?.trim().length ?? 0) >= 30, { message: "Escolha um tópico ou cole um texto." });

/** POST /api/mapas/gerar — a IA desenha um mapa mental ou fluxograma e o app grava. */
export async function POST(request: Request) {
  if (!supabaseConfigurado()) return NextResponse.json({ erro: "Precisa do Supabase configurado." }, { status: 400 });
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  const d = corpo.data;

  try {
    const r = await obterProvedor().gerarMapa({
      formato: d.formato,
      tema: d.tema || "o material enviado",
      contexto: d.contexto,
      texto: d.texto?.trim() || undefined,
    });
    const titulo = r.titulo.trim().slice(0, 200) || d.tema || "Mapa";
    const { data, error } = await supabase
      .from("mapas")
      .insert({
        titulo,
        assunto: d.assunto || null,
        disciplina_id: d.disciplinaId ?? null,
        tipo: "diagrama",
        diagrama: { formato: d.formato, conteudo: limparConteudo(d.formato, r.conteudo, titulo) },
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ erro: `Não deu para salvar: ${error?.message}` }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
