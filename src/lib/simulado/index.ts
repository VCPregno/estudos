/** Correção de simulado: função pura, usada no servidor com os gabaritos do banco. */

export interface ItemCorrecao {
  questaoId: string;
  marcada: string | null;
  gabarito: string;
  anulada: boolean;
  disciplina: string | null;
}

export interface ResultadoSimulado {
  total: number;
  acertos: number;
  erros: number;
  emBranco: number;
  /** 0 a 100. Com penalidade (estilo Cebraspe), cada erro anula um acerto e o mínimo é 0. */
  nota: number;
  porDisciplina: { disciplina: string; total: number; acertos: number }[];
  itens: { questao_id: string; marcada: string | null; acertou: boolean; disciplina: string | null }[];
}

export function corrigirSimulado(itens: readonly ItemCorrecao[], penalidade = false): ResultadoSimulado {
  let acertos = 0;
  let erros = 0;
  let emBranco = 0;
  const disc = new Map<string, { total: number; acertos: number }>();
  const saida = itens.map((i) => {
    const respondida = i.marcada !== null && i.marcada !== "";
    // questão anulada conta como acerto para todos, como na prova
    const acertou = i.anulada || (respondida && i.marcada === i.gabarito);
    if (acertou) acertos++;
    else if (respondida) erros++;
    else emBranco++;
    const nome = i.disciplina ?? "Sem disciplina";
    const d = disc.get(nome) ?? { total: 0, acertos: 0 };
    d.total++;
    if (acertou) d.acertos++;
    disc.set(nome, d);
    return { questao_id: i.questaoId, marcada: respondida ? i.marcada : null, acertou, disciplina: i.disciplina };
  });
  const total = itens.length;
  const liquido = penalidade ? Math.max(0, acertos - erros) : acertos;
  return {
    total,
    acertos,
    erros,
    emBranco,
    nota: total ? Math.round((10000 * liquido) / total) / 100 : 0,
    porDisciplina: [...disc].map(([disciplina, v]) => ({ disciplina, ...v })).sort((a, b) => b.total - a.total),
    itens: saida,
  };
}

/** Tempo sugerido: 3 minutos por questão (o padrão das provas de 60 questões em 4 h, descontada a redação). */
export function tempoSugeridoMin(qtd: number) {
  return Math.max(10, Math.round(qtd * 3));
}
