import type { TopicoCiclo } from "@/lib/ciclo";

export interface TopicoRow {
  id: string;
  disciplina_id: string;
  parent_id: string | null;
  titulo: string;
  ordem: number;
  minutos_estimados: number | null;
  minutos_estudados: number;
  teoria_concluida: boolean;
}

export const COLUNAS_TOPICO =
  "id, disciplina_id, parent_id, titulo, ordem, minutos_estimados, minutos_estudados, teoria_concluida";

/**
 * Unidades de estudo = tópicos folha (sem subtópicos). A ordem combina a do
 * pai com a do filho para manter a sequência do edital.
 */
export function topicosFolha(rows: readonly TopicoRow[]): TopicoCiclo[] {
  const comFilhos = new Set(rows.map((t) => t.parent_id).filter(Boolean));
  const ordemPai = new Map(rows.filter((t) => !t.parent_id).map((t) => [t.id, t.ordem]));
  return rows
    .filter((t) => !comFilhos.has(t.id))
    .map((t) => ({
      id: t.id,
      disciplinaId: t.disciplina_id,
      titulo: t.titulo,
      ordem: t.parent_id ? (ordemPai.get(t.parent_id) ?? 0) * 1000 + t.ordem : t.ordem * 1000,
      minutosEstimados: t.minutos_estimados,
      minutosEstudados: t.minutos_estudados,
      teoriaConcluida: t.teoria_concluida,
    }));
}
