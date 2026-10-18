import "server-only";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { type OpcaoDisciplina, carregarDisciplinasComTopicos } from "./flashcards";

export interface Mapa {
  id: string;
  titulo: string;
  assunto: string | null;
  disciplinaId: string | null;
  mimeType: string | null;
  arquivoPath: string | null;
  url: string | null;
  criadoEm: string;
}

export interface DadosMapas {
  modo: "demo" | "real";
  mapas: Mapa[];
  disciplinas: OpcaoDisciplina[];
}

export async function carregarMapas(): Promise<DadosMapas> {
  if (!supabaseConfigurado()) return { modo: "demo", mapas: [], disciplinas: [] };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { modo: "demo", mapas: [], disciplinas: [] };

  const [{ data }, disciplinas] = await Promise.all([
    supabase
      .from("mapas")
      .select("id, titulo, assunto, disciplina_id, mime_type, arquivo_path, created_at")
      .eq("tipo", "arquivo")
      .order("disciplina_id")
      .order("assunto")
      .order("ordem")
      .order("created_at"),
    carregarDisciplinasComTopicos(),
  ]);
  const linhas = data ?? [];
  const caminhos = linhas.map((m) => m.arquivo_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (caminhos.length) {
    const { data: assinadas } = await supabase.storage.from("mapas").createSignedUrls(caminhos, 60 * 60 * 6);
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }
  return {
    modo: "real",
    disciplinas,
    mapas: linhas.map((m) => ({
      id: m.id,
      titulo: m.titulo,
      assunto: m.assunto,
      disciplinaId: m.disciplina_id,
      mimeType: m.mime_type,
      arquivoPath: m.arquivo_path,
      url: m.arquivo_path ? (urls.get(m.arquivo_path) ?? null) : null,
      criadoEm: m.created_at,
    })),
  };
}
