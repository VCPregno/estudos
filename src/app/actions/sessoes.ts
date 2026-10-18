"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { montarFilaTeoria, registrarEstudoNoCiclo } from "@/lib/ciclo";
import { carregarCicloAtivo } from "@/lib/data/dashboard";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

const SessaoSchema = z.object({
  inicio: z.iso.datetime(),
  fim: z.iso.datetime(),
  segundosLiquidos: z.number().int().min(0).max(24 * 3600),
  pausas: z.number().int().min(0),
  contexto: z.object({
    tipo: z.enum(["teoria", "questoes", "flashcards", "revisao", "lei_seca", "livre"]),
    rotulo: z.string(),
    disciplinaId: z.string().optional(),
    topicoId: z.string().optional(),
    revisaoId: z.string().nullable().optional(),
    turno: z.number().int().optional(),
    minutosPlanejados: z.number().optional(),
  }),
});

export type ResultadoSalvarSessao =
  | { ok: true; demo: boolean; conquistas: { titulo: string; descricao: string }[] }
  | { ok: false; erro: string };

/** Sessões com menos de 1 minuto líquido não são gravadas. */
const MINIMO_SEGUNDOS = 60;

export async function salvarSessao(dados: unknown): Promise<ResultadoSalvarSessao> {
  const parsed = SessaoSchema.safeParse(dados);
  if (!parsed.success) return { ok: false, erro: "Dados da sessão inválidos." };
  const s = parsed.data;

  if (s.segundosLiquidos < MINIMO_SEGUNDOS) return { ok: true, demo: false, conquistas: [] };
  if (!supabaseConfigurado()) return { ok: true, demo: true, conquistas: [] };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo para salvar." };

  const uuid = z.uuid();
  const disciplinaId = uuid.safeParse(s.contexto.disciplinaId).success ? s.contexto.disciplinaId : null;
  const topicoId = uuid.safeParse(s.contexto.topicoId).success ? s.contexto.topicoId : null;

  // O ciclo é lido ANTES de gravar a sessão: o trigger soma minutos ao tópico,
  // e o avanço precisa da fila como estava quando o bloco foi planejado.
  const ciclo = s.contexto.tipo === "teoria" && s.contexto.turno !== undefined ? await carregarCicloAtivo(supabase) : null;

  const { error } = await supabase.from("sessoes_estudo").insert({
    tipo: s.contexto.tipo,
    disciplina_id: disciplinaId,
    topico_id: topicoId,
    inicio: s.inicio,
    fim: s.fim,
    segundos_liquidos: s.segundosLiquidos,
    pausas: s.pausas,
    notas: s.contexto.rotulo,
  });
  if (error) return { ok: false, erro: `Não deu para salvar a sessão: ${error.message}` };

  if (ciclo && s.contexto.turno !== undefined) {
    const fila = montarFilaTeoria(ciclo.disciplinas, ciclo.topicos, ciclo.config, ciclo.estado);
    const novo = registrarEstudoNoCiclo(ciclo.estado, { turno: s.contexto.turno, minutos: Math.round(s.segundosLiquidos / 60) }, fila);
    if (novo !== ciclo.estado) {
      await supabase
        .from("cronogramas")
        .update({ posicao_ciclo: novo.posicao, minutos_no_turno: novo.minutosNoTurno })
        .eq("id", ciclo.cronogramaId);
    }
  }

  if (s.contexto.tipo === "revisao" && s.contexto.revisaoId && uuid.safeParse(s.contexto.revisaoId).success) {
    await supabase.from("revisoes_programadas").update({ status: "feita" }).eq("id", s.contexto.revisaoId);
  }

  const { data: novas } = await supabase.rpc("verificar_conquistas");
  refresh();
  return {
    ok: true,
    demo: false,
    conquistas: ((novas ?? []) as { titulo: string; descricao: string }[]).map(({ titulo, descricao }) => ({ titulo, descricao })),
  };
}

/** Marca a teoria de um tópico como concluída (o banco agenda as revisões). */
export async function concluirTeoria(topicoId: string): Promise<{ ok: boolean; erro?: string }> {
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada." };
  const { error } = await supabase.from("topicos_ementa").update({ teoria_concluida: true }).eq("id", topicoId);
  if (error) return { ok: false, erro: error.message };
  refresh();
  return { ok: true };
}
