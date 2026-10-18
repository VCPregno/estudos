/**
 * Agendador de repetição espaçada no estilo do Anki (SM-2 com etapas de
 * aprendizado). Função pura: recebe o card e a nota, devolve o novo estado.
 *
 * Curto prazo: "novo", "aprendendo" e "reaprendendo" andam por etapas em minutos.
 * Longo prazo: "revisao" cresce o intervalo em dias pela facilidade do card.
 */

export type EstadoCard = "novo" | "aprendendo" | "revisao" | "reaprendendo";
export type Nota = 1 | 2 | 3 | 4; // Errei, Difícil, Bom, Fácil

export interface CardAgenda {
  estado: EstadoCard;
  etapa: number;
  intervaloDias: number;
  facilidade: number;
  repeticoes: number;
  lapsos: number;
}

export interface Resultado extends CardAgenda {
  vencimento: Date;
}

export const CONFIG = {
  etapasAprendizado: [1, 10], // minutos
  etapasReaprendizado: [10], // minutos
  intervaloGraduacao: 1, // dias
  intervaloFacil: 4, // dias
  facilidadeInicial: 2.5,
  facilidadeMinima: 1.3,
  bonusFacil: 1.3,
  fatorDificil: 1.2,
  fatorLapso: 0.25, // o intervalo depois de errar um card maduro
  intervaloMaximo: 365,
};

const MIN = 60_000;
const DIA = 86_400_000;

const emMinutos = (agora: Date, m: number) => new Date(agora.getTime() + m * MIN);
const emDias = (agora: Date, d: number) => new Date(agora.getTime() + d * DIA);
const limitar = (d: number) => Math.min(CONFIG.intervaloMaximo, Math.max(1, Math.round(d)));

export function avaliar(card: CardAgenda, nota: Nota, agora: Date = new Date()): Resultado {
  const c = { ...card, repeticoes: card.repeticoes + 1 };

  // ---- curto prazo ----
  if (c.estado !== "revisao") {
    const reaprendendo = c.estado === "reaprendendo";
    const etapas = reaprendendo ? CONFIG.etapasReaprendizado : CONFIG.etapasAprendizado;
    const etapa = Math.min(c.etapa, etapas.length - 1);
    const voltaPraRevisao = (intervalo: number): Resultado => ({
      ...c,
      estado: "revisao",
      etapa: 0,
      intervaloDias: intervalo,
      vencimento: emDias(agora, intervalo),
    });

    if (nota === 1) {
      return { ...c, estado: reaprendendo ? "reaprendendo" : "aprendendo", etapa: 0, vencimento: emMinutos(agora, etapas[0]) };
    }
    if (nota === 2) {
      const minutos = etapa === 0 && etapas.length > 1 ? (etapas[0] + etapas[1]) / 2 : etapas[etapa] * 1.5;
      return { ...c, estado: reaprendendo ? "reaprendendo" : "aprendendo", etapa, vencimento: emMinutos(agora, minutos) };
    }
    if (nota === 4) {
      return voltaPraRevisao(reaprendendo ? limitar(c.intervaloDias + 1) : CONFIG.intervaloFacil);
    }
    // Bom: próxima etapa ou gradua
    if (etapa + 1 < etapas.length) {
      return { ...c, estado: reaprendendo ? "reaprendendo" : "aprendendo", etapa: etapa + 1, vencimento: emMinutos(agora, etapas[etapa + 1]) };
    }
    return voltaPraRevisao(reaprendendo ? limitar(c.intervaloDias) : CONFIG.intervaloGraduacao);
  }

  // ---- longo prazo ----
  const ivl = Math.max(1, c.intervaloDias);
  if (nota === 1) {
    return {
      ...c,
      estado: "reaprendendo",
      etapa: 0,
      lapsos: c.lapsos + 1,
      facilidade: Math.max(CONFIG.facilidadeMinima, c.facilidade - 0.2),
      intervaloDias: limitar(ivl * CONFIG.fatorLapso),
      vencimento: emMinutos(agora, CONFIG.etapasReaprendizado[0]),
    };
  }
  let facilidade = c.facilidade;
  let novo: number;
  if (nota === 2) {
    facilidade = Math.max(CONFIG.facilidadeMinima, facilidade - 0.15);
    novo = Math.max(ivl + 1, ivl * CONFIG.fatorDificil);
  } else if (nota === 3) {
    novo = Math.max(ivl + 1, ivl * facilidade);
  } else {
    facilidade = facilidade + 0.15;
    novo = Math.max(ivl + 1, ivl * facilidade * CONFIG.bonusFacil);
  }
  const intervalo = limitar(novo);
  return { ...c, facilidade: Math.round(facilidade * 100) / 100, intervaloDias: intervalo, vencimento: emDias(agora, intervalo) };
}

/** Texto curto do próximo intervalo, para mostrar nos botões ("10 min", "4 d"). */
export function rotuloIntervalo(r: Resultado, agora: Date = new Date()): string {
  const ms = r.vencimento.getTime() - agora.getTime();
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DIA) return `${Math.round(ms / (60 * MIN))} h`;
  const dias = Math.round(ms / DIA);
  if (dias < 31) return `${dias} d`;
  if (dias < 365) return `${Math.round(dias / 30)} m`;
  return `${(dias / 365).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} a`;
}

/** Previsão dos quatro botões. */
export function previsoes(card: CardAgenda, agora: Date = new Date()): Record<Nota, string> {
  return {
    1: rotuloIntervalo(avaliar(card, 1, agora), agora),
    2: rotuloIntervalo(avaliar(card, 2, agora), agora),
    3: rotuloIntervalo(avaliar(card, 3, agora), agora),
    4: rotuloIntervalo(avaliar(card, 4, agora), agora),
  };
}

/** Card novo, com os valores padrão. */
export function cardNovo(): CardAgenda {
  return { estado: "novo", etapa: 0, intervaloDias: 0, facilidade: CONFIG.facilidadeInicial, repeticoes: 0, lapsos: 0 };
}
