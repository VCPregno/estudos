import "server-only";
import { supabaseConfigurado } from "@/lib/env";
import type { Marcacao } from "@/lib/leis";
import { usuarioAtual } from "@/lib/supabase/server";
import { type OpcaoDisciplina, carregarDisciplinasComTopicos } from "./flashcards";

export interface LeiResumo {
  id: string;
  titulo: string;
  sigla: string | null;
  disciplina: string | null;
  disciplinaId: string | null;
  fonteUrl: string | null;
  versaoEm: string | null;
  marcacoes: number;
}

export interface LeiCompleta extends LeiResumo {
  texto: string;
  marcacoesLista: Marcacao[];
}

export async function carregarLeis(): Promise<{ modo: "demo" | "real"; leis: LeiResumo[]; disciplinas: OpcaoDisciplina[] }> {
  if (!supabaseConfigurado()) return { modo: "demo", leis: [], disciplinas: [] };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { modo: "demo", leis: [], disciplinas: [] };
  const [{ data }, { data: marcas }, disciplinas] = await Promise.all([
    supabase.from("leis").select("id, titulo, sigla, disciplina_id, fonte_url, versao_em").order("titulo"),
    supabase.from("lei_marcacoes").select("lei_id"),
    carregarDisciplinasComTopicos(),
  ]);
  const nomes = new Map(disciplinas.map((d) => [d.id, d.nome]));
  const qtd = new Map<string, number>();
  for (const m of marcas ?? []) qtd.set(m.lei_id, (qtd.get(m.lei_id) ?? 0) + 1);
  return {
    modo: "real",
    disciplinas,
    leis: (data ?? []).map((l) => ({
      id: l.id,
      titulo: l.titulo,
      sigla: l.sigla,
      disciplinaId: l.disciplina_id,
      disciplina: l.disciplina_id ? (nomes.get(l.disciplina_id) ?? null) : null,
      fonteUrl: l.fonte_url,
      versaoEm: l.versao_em,
      marcacoes: qtd.get(l.id) ?? 0,
    })),
  };
}

export async function carregarLei(id: string): Promise<{ lei: LeiCompleta | null; disciplinas: OpcaoDisciplina[] }> {
  if (!supabaseConfigurado()) return { lei: null, disciplinas: [] };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { lei: null, disciplinas: [] };
  const [{ data: l }, { data: marcas }, disciplinas] = await Promise.all([
    supabase.from("leis").select("id, titulo, sigla, disciplina_id, fonte_url, versao_em, texto").eq("id", id).maybeSingle(),
    supabase.from("lei_marcacoes").select("id, inicio, fim, cor, nota").eq("lei_id", id).order("created_at"),
    carregarDisciplinasComTopicos(),
  ]);
  if (!l) return { lei: null, disciplinas };
  return {
    disciplinas,
    lei: {
      id: l.id,
      titulo: l.titulo,
      sigla: l.sigla,
      disciplinaId: l.disciplina_id,
      disciplina: disciplinas.find((d) => d.id === l.disciplina_id)?.nome ?? null,
      fonteUrl: l.fonte_url,
      versaoEm: l.versao_em,
      texto: l.texto,
      marcacoes: marcas?.length ?? 0,
      marcacoesLista: (marcas ?? []) as Marcacao[],
    },
  };
}
