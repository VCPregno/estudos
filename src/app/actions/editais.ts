"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { EditalExtraidoSchema } from "@/lib/ai/esquema-edital";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

const Payload = EditalExtraidoSchema.extend({
  importacaoId: z.uuid().nullable().optional(),
  storagePath: z.string().nullable().optional(),
});

export type ResultadoImportacao = { ok: true; editalId: string | null; demo: boolean } | { ok: false; erro: string };

/** Grava o edital revisado: edital + disciplinas + tópicos, numa transação só (RPC importar_edital). */
export async function confirmarImportacao(dados: unknown): Promise<ResultadoImportacao> {
  const parsed = Payload.safeParse(dados);
  if (!parsed.success) return { ok: false, erro: "Conteúdo do edital inválido. Revise os campos e tente de novo." };

  const { importacaoId, storagePath, ...conteudo } = parsed.data;
  const disciplinas = conteudo.disciplinas
    .map((d) => ({
      ...d,
      nome: d.nome.trim(),
      topicos: d.topicos
        .filter((t) => t.titulo.trim())
        .map((t) => ({ ...t, subtopicos: t.subtopicos.filter((s) => s.titulo.trim()) })),
    }))
    .filter((d) => d.nome && d.topicos.length > 0);

  if (disciplinas.length === 0) return { ok: false, erro: "Nenhuma disciplina com tópicos para importar." };
  if (!supabaseConfigurado()) return { ok: true, editalId: null, demo: true };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const { data, error } = await supabase.rpc("importar_edital", {
    p_payload: { edital: { ...conteudo.edital, arquivo_path: storagePath ?? null, observacoes: conteudo.observacoes }, disciplinas },
    p_importacao_id: importacaoId ?? null,
  });
  if (error) return { ok: false, erro: `Não deu para gravar o edital: ${error.message}` };

  await supabase.rpc("verificar_conquistas");
  refresh();
  return { ok: true, editalId: data as string, demo: false };
}
