import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 60;

/** POST /api/redacao/tema — a IA propõe um tema no estilo da banca. */
export async function POST(request: Request) {
  if (supabaseConfigurado()) {
    const { user } = await usuarioAtual();
    if (!user) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const corpo = z.object({ banca: z.string().min(1).max(60) }).safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json(await obterProvedor().sugerirTema(corpo.data));
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
