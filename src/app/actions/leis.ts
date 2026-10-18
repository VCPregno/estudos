"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { normalizarTexto } from "@/lib/leis";
import { usuarioAtual } from "@/lib/supabase/server";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const CORES = ["amarelo", "verde", "azul", "rosa"] as const;

const Lei = z.object({
  titulo: z.string().trim().min(1, "Dê um nome à lei.").max(300),
  sigla: z.string().trim().max(60).nullable().optional(),
  texto: z.string().min(50, "O texto está curto demais.").max(3_000_000),
  fonteUrl: z.url().max(2000).nullable().optional(),
  disciplinaId: z.uuid().nullable().optional(),
});

export async function criarLei(dados: z.infer<typeof Lei>): Promise<Resultado<{ id: string }>> {
  const p = Lei.safeParse(dados);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: false, erro: "Leis secas precisam do Supabase configurado." };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { data, error } = await supabase
    .from("leis")
    .insert({
      titulo: p.data.titulo,
      sigla: p.data.sigla || null,
      texto: normalizarTexto(p.data.texto),
      fonte_url: p.data.fonteUrl ?? null,
      disciplina_id: p.data.disciplinaId ?? null,
      versao_em: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: `Não deu para salvar: ${error?.message}` };
  refresh();
  return { ok: true, id: data.id };
}

export async function renomearLei(id: string, titulo: string, sigla: string | null): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success || !titulo.trim()) return { ok: false, erro: "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase.from("leis").update({ titulo: titulo.trim().slice(0, 300), sigla: sigla?.trim() || null }).eq("id", id);
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true };
}

export async function apagarLei(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Lei inválida." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase.from("leis").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true };
}

const NovaMarcacao = z.object({
  leiId: z.uuid(),
  inicio: z.number().int().min(0),
  fim: z.number().int().min(1),
  cor: z.enum(CORES),
  nota: z.string().max(5000).nullable().optional(),
});

export async function marcar(dados: z.infer<typeof NovaMarcacao>): Promise<Resultado<{ id: string }>> {
  const p = NovaMarcacao.safeParse(dados);
  if (!p.success || p.data.fim <= p.data.inicio) return { ok: false, erro: "Seleção inválida." };
  if (!supabaseConfigurado()) return { ok: true, id: crypto.randomUUID() };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { data, error } = await supabase
    .from("lei_marcacoes")
    .insert({ lei_id: p.data.leiId, inicio: p.data.inicio, fim: p.data.fim, cor: p.data.cor, nota: p.data.nota || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: `Não deu para salvar: ${error?.message}` };
  return { ok: true, id: data.id };
}

export async function editarMarcacao(id: string, mudancas: { cor?: (typeof CORES)[number]; nota?: string | null }): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Marcação inválida." };
  if (mudancas.cor && !CORES.includes(mudancas.cor)) return { ok: false, erro: "Cor inválida." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const update: Record<string, unknown> = {};
  if (mudancas.cor) update.cor = mudancas.cor;
  if (mudancas.nota !== undefined) update.nota = mudancas.nota?.trim().slice(0, 5000) || null;
  const { error } = await supabase.from("lei_marcacoes").update(update).eq("id", id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function apagarMarcacao(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Marcação inválida." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase.from("lei_marcacoes").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
