import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 60;

const Corpo = z.object({
  questaoId: z.uuid().optional(),
  enunciado: z.string().min(1).max(20000),
  alternativas: z.array(z.object({ letra: z.string().max(3), texto: z.string().max(5000) })).max(10),
  gabarito: z.string().max(3),
  marcada: z.string().max(3),
  disciplina: z.string().max(200).optional(),
  banca: z.string().max(100).optional(),
  comentario: z.string().max(20000).optional(),
});

/**
 * POST /api/tutor — Tutor "Pontes": explica por que a alternativa marcada está
 * errada e por que o gabarito está certo. Base para o botão flutuante do
 * Banco de Questões (próximo passo).
 */
export async function POST(request: Request) {
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });

  const ctx = supabaseConfigurado() ? await usuarioAtual() : null;
  if (ctx && !ctx.user) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  try {
    const provedor = obterProvedor();
    const { questaoId, ...q } = corpo.data;
    const { texto } = await provedor.explicarQuestao(q);

    if (ctx && questaoId) {
      await ctx.supabase.from("tutor_mensagens").insert([
        { contexto_tipo: "questao", contexto_id: questaoId, papel: "user", conteudo: `Marquei ${q.marcada}, gabarito ${q.gabarito}.` },
        { contexto_tipo: "questao", contexto_id: questaoId, papel: "assistant", conteudo: texto, provider: provedor.nome, modelo: provedor.modeloTutor },
      ]);
    }
    return NextResponse.json({ texto, provider: provedor.nome });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
