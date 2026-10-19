"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

const NovoMapa = z.object({
  titulo: z.string().trim().min(1, "Dê um título.").max(200),
  assunto: z.string().trim().max(200).nullable().optional(),
  disciplinaId: z.uuid().nullable().optional(),
  arquivoPath: z.string().min(3).max(500),
  mimeType: z.enum(MIMES),
});

export async function registrarMapa(dados: z.infer<typeof NovoMapa>): Promise<Resultado> {
  const p = NovoMapa.safeParse(dados);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: false, erro: "Mapas precisam do Supabase configurado." };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  if (!p.data.arquivoPath.startsWith(`${user.id}/`)) return { ok: false, erro: "Arquivo inválido." };
  const { error } = await supabase.from("mapas").insert({
    titulo: p.data.titulo,
    assunto: p.data.assunto || null,
    disciplina_id: p.data.disciplinaId ?? null,
    tipo: "arquivo",
    arquivo_path: p.data.arquivoPath,
    mime_type: p.data.mimeType,
  });
  if (error) return { ok: false, erro: `Não deu para salvar: ${error.message}` };
  refresh();
  return { ok: true };
}

const Edicao = z.object({
  titulo: z.string().trim().min(1).max(200),
  assunto: z.string().trim().max(200).nullable(),
  disciplinaId: z.uuid().nullable(),
});

export async function editarMapa(id: string, dados: z.infer<typeof Edicao>): Promise<Resultado> {
  const p = Edicao.safeParse(dados);
  if (!z.uuid().safeParse(id).success || !p.success) return { ok: false, erro: "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase
    .from("mapas")
    .update({ titulo: p.data.titulo, assunto: p.data.assunto || null, disciplina_id: p.data.disciplinaId })
    .eq("id", id);
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true };
}

export async function apagarMapa(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Mapa inválido." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { data } = await supabase.from("mapas").select("arquivo_path").eq("id", id).single();
  const { error } = await supabase.from("mapas").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };
  if (data?.arquivo_path) await supabase.storage.from("mapas").remove([data.arquivo_path]);
  refresh();
  return { ok: true };
}

const Diagrama = z.object({
  titulo: z.string().trim().min(1).max(200),
  formato: z.enum(["mapa", "fluxo"]),
  conteudo: z.string().min(3).max(60000),
});

/** Salva o texto editado de um mapa desenhado. */
export async function salvarDiagrama(id: string, dados: z.infer<typeof Diagrama>): Promise<Resultado> {
  const p = Diagrama.safeParse(dados);
  if (!z.uuid().safeParse(id).success || !p.success) return { ok: false, erro: "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase
    .from("mapas")
    .update({ titulo: p.data.titulo, diagrama: { formato: p.data.formato, conteudo: p.data.conteudo } })
    .eq("id", id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
