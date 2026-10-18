import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 60;

const Corpo = z.object({
  leiId: z.uuid().optional(),
  lei: z.string().min(1).max(300),
  trecho: z.string().min(3).max(8000),
  contexto: z.string().max(8000).optional(),
});

/** POST /api/tutor/trecho — o Pontes explica um trecho grifado de lei. */
export async function POST(request: Request) {
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });

  const ctx = supabaseConfigurado() ? await usuarioAtual() : null;
  if (ctx && !ctx.user) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  try {
    const provedor = obterProvedor();
    const { leiId, ...o } = corpo.data;
    const { texto } = await provedor.explicarTrecho(o);
    if (ctx && leiId) {
      await ctx.supabase.from("tutor_mensagens").insert([
        { contexto_tipo: "lei", contexto_id: leiId, papel: "user", conteudo: o.trecho },
        { contexto_tipo: "lei", contexto_id: leiId, papel: "assistant", conteudo: texto, provider: provedor.nome, modelo: provedor.modeloTutor },
      ]);
    }
    return NextResponse.json({ texto });
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
