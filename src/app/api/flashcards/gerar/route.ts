import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 60;

const Corpo = z.object({
  texto: z.string().min(20, "Cole um trecho maior.").max(40000, "Trecho grande demais: mande no máximo umas 10 páginas por vez."),
  quantidade: z.number().int().min(1).max(20),
  contexto: z.string().max(500).optional(),
});

/** POST /api/flashcards/gerar — a IA propõe cards; nada é gravado aqui. */
export async function POST(request: Request) {
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });

  if (supabaseConfigurado()) {
    const { user } = await usuarioAtual();
    if (!user) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  try {
    const { cards } = await obterProvedor().gerarFlashcards(corpo.data);
    return NextResponse.json({
      cards: cards
        .map((c) => ({ frente: c.frente.trim(), verso: c.verso.trim() }))
        .filter((c) => c.frente && c.verso)
        .slice(0, corpo.data.quantidade),
    });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
