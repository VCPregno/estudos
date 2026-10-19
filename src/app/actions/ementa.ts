"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

/**
 * Marca ou desmarca a teoria de um tópico. O banco cuida do resto: ao marcar,
 * agenda as revisões espaçadas; ao desmarcar, remove as que ainda estão pendentes.
 */
export async function marcarTeoria(topicoId: string, concluida: boolean): Promise<{ ok: boolean; erro?: string }> {
  if (!z.string().min(1).safeParse(topicoId).success) return { ok: false, erro: "Tópico inválido." };
  if (!supabaseConfigurado()) return { ok: true };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const { error } = await supabase.from("topicos_ementa").update({ teoria_concluida: concluida }).eq("id", topicoId);
  if (error) return { ok: false, erro: `Não deu para salvar: ${error.message}` };

  if (concluida) await supabase.rpc("verificar_conquistas");
  refresh();
  return { ok: true };
}

/** Correção manual do tipo de fonte de um tópico. */
export async function definirTipoFonte(topicoId: string, tipo: "norma" | "guia" | "classica" | "orgao"): Promise<{ ok: boolean; erro?: string }> {
  if (!z.uuid().safeParse(topicoId).success || !["norma", "guia", "classica", "orgao"].includes(tipo)) return { ok: false, erro: "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase.from("topicos_ementa").update({ tipo_fonte: tipo }).eq("id", topicoId);
  if (error) return { ok: false, erro: `Não deu para salvar: ${error.message}` };
  return { ok: true };
}
