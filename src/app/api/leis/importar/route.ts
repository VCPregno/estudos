import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { htmlParaTexto } from "@/lib/leis";
import { usuarioAtual } from "@/lib/supabase/server";

export const maxDuration = 60;

const Corpo = z.object({ url: z.url().max(2000) });

function hostPermitido(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false;
  return h.includes(".");
}

function charsetDe(tipo: string | null, inicio: string) {
  const doHeader = tipo?.match(/charset=([\w-]+)/i)?.[1];
  const doMeta = inicio.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const c = (doHeader ?? doMeta ?? "utf-8").toLowerCase();
  return c === "iso-8859-1" || c === "latin1" ? "windows-1252" : c;
}

/**
 * POST /api/leis/importar — baixa a página da lei (Planalto, Câmara, site do
 * tribunal) e devolve o texto limpo, sem os trechos riscados (revogados).
 */
export async function POST(request: Request) {
  if (supabaseConfigurado()) {
    const { user } = await usuarioAtual();
    if (!user) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Link inválido." }, { status: 400 });

  const url = new URL(corpo.data.url);
  if (!hostPermitido(url)) return NextResponse.json({ erro: "Use o link público da lei (Planalto, Câmara ou site do órgão)." }, { status: 400 });

  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": "Mozilla/5.0 (estudos)" } }).catch(() => null);
  if (!r || !r.ok) return NextResponse.json({ erro: `Não consegui abrir o link (${r?.status ?? "sem resposta"}). Copie o texto da página e cole.` }, { status: 422 });
  const tipo = r.headers.get("content-type");
  if (tipo?.includes("pdf")) return NextResponse.json({ erro: "O link é de um PDF. Abra o PDF, copie o texto e cole na opção “Colar texto”." }, { status: 415 });

  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) return NextResponse.json({ erro: "Página grande demais." }, { status: 413 });
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  let html: string;
  try {
    html = new TextDecoder(charsetDe(tipo, inicio)).decode(bytes);
  } catch {
    html = new TextDecoder("utf-8").decode(bytes);
  }
  const { titulo, texto } = htmlParaTexto(html);
  if (texto.length < 200) return NextResponse.json({ erro: "A página não parece ter o texto da lei. Copie o texto e cole." }, { status: 422 });
  return NextResponse.json({ titulo, texto });
}
