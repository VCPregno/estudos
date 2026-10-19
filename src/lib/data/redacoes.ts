import "server-only";
import type { CorrecaoRedacao } from "@/lib/ai/esquema-redacao";
import { supabaseConfigurado } from "@/lib/env";
import type { TipoTexto } from "@/lib/redacao";
import { usuarioAtual } from "@/lib/supabase/server";

export interface RedacaoResumo {
  id: string;
  tipo: TipoTexto;
  banca: string;
  tema: string;
  nota: number | null;
  notaMaxima: number;
  notaMinima: number | null;
  criadaEm: string;
}

export interface RedacaoCompleta extends RedacaoResumo {
  texto: string | null;
  criterios: string | null;
  linhasMin: number | null;
  linhasMax: number | null;
  correcao: (CorrecaoRedacao & { nota_total: number }) | null;
  imagens: string[];
}

const resumo = (r: Record<string, unknown>): RedacaoResumo => ({
  id: r.id as string,
  tipo: r.tipo as TipoTexto,
  banca: r.banca as string,
  tema: r.tema as string,
  nota: r.nota === null ? null : Number(r.nota),
  notaMaxima: Number(r.nota_maxima),
  notaMinima: r.nota_minima === null ? null : Number(r.nota_minima),
  criadaEm: r.created_at as string,
});

export async function carregarRedacoes(): Promise<{ modo: "demo" | "real"; redacoes: RedacaoResumo[] }> {
  if (!supabaseConfigurado()) return { modo: "demo", redacoes: [] };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { modo: "demo", redacoes: [] };
  const { data } = await supabase
    .from("redacoes")
    .select("id, tipo, banca, tema, nota, nota_maxima, nota_minima, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return { modo: "real", redacoes: (data ?? []).map(resumo) };
}

export async function carregarRedacao(id: string): Promise<RedacaoCompleta | null> {
  if (!supabaseConfigurado()) return null;
  const { supabase, user } = await usuarioAtual();
  if (!user) return null;
  const { data: r } = await supabase.from("redacoes").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  let imagens: string[] = [];
  if (r.imagens?.length) {
    const { data: urls } = await supabase.storage.from("mapas").createSignedUrls(r.imagens, 60 * 60 * 6);
    imagens = (urls ?? []).map((u) => u.signedUrl).filter((u): u is string => !!u);
  }
  return {
    ...resumo(r),
    texto: r.texto,
    criterios: r.criterios,
    linhasMin: r.linhas_min,
    linhasMax: r.linhas_max,
    correcao: r.correcao,
    imagens,
  };
}
