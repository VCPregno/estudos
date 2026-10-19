"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

export async function apagarRedacao(id: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Redação inválida." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { data } = await supabase.from("redacoes").select("imagens").eq("id", id).single();
  const { error } = await supabase.from("redacoes").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };
  if (data?.imagens?.length) await supabase.storage.from("mapas").remove(data.imagens);
  refresh();
  return { ok: true };
}
