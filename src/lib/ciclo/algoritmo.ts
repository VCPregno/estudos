/**
 * Ciclo de Estudos Dinâmico
 * =========================
 *
 * Ideia central: o cronograma não é a fonte da verdade, o PROGRESSO é.
 * A agenda é uma função pura de (configuração, ementa com minutos já
 * estudados, revisões pendentes, posição no ciclo, hoje). Se um dia passa sem
 * estudo, nada fica "atrasado": basta projetar de novo a partir de hoje e a
 * fila inteira é empurrada para frente, na mesma ordem.
 *
 * Etapas:
 *  1. sequenciaDoCiclo: uma "volta" do ciclo, intercalando disciplinas por peso
 *     (round-robin ponderado suave: peso 3/2/1 → A B A C B A, sem blocos
 *     repetidos colados quando dá para evitar).
 *  2. montarFilaTeoria: percorre a sequência a partir da posição salva; cada
 *     turno dá `duracaoBlocoMin` minutos à disciplina, gastos nos tópicos dela
 *     em ordem. Disciplinas já esgotadas saem do rodízio.
 *  3. projetarAgenda: distribui revisões vencidas (com teto diário) e depois a
 *     fila de teoria pelos dias, respeitando os minutos de cada dia da semana.
 *     Pedaços que não cabem no dia continuam no dia seguinte. Ao terminar um
 *     tópico, projeta as revisões espaçadas (1, 7, 14, 30, 90 dias...) nos
 *     dias da semana permitidos.
 *  4. calcularRitmo / estimarConclusao: compara o que foi estudado com o que
 *     estava disponível nos últimos dias e reprojeta com esse fator, dando a
 *     data de conclusão "no plano" e "no seu ritmo real".
 *
 * Modo fixo: gera o plano uma vez a partir da data de início (gerarPlanoFixo)
 * e o que vencer sem ser feito aparece como atrasado (itensAtrasados).
 */

import {
  type DataISO,
  type DiaSemana,
  diaDaSemana,
  maxData,
  proximoDiaPermitido,
  somarDias,
} from "./datas";
import type {
  ConfigCiclo,
  DiaAgenda,
  DisciplinaCiclo,
  EstadoCiclo,
  ItemAgenda,
  PedacoTeoria,
  Projecao,
  RevisaoPendente,
  TopicoCiclo,
} from "./tipos";

const ESTADO_INICIAL: EstadoCiclo = { posicao: 0, minutosNoTurno: 0 };

// -----------------------------------------------------------------------------
// 1. Sequência de uma volta do ciclo
// -----------------------------------------------------------------------------

export function sequenciaDoCiclo(disciplinas: readonly DisciplinaCiclo[]): string[] {
  const ativas = disciplinas
    .filter((d) => d.ativo !== false && d.peso > 0)
    .sort((a, b) => a.ordem - b.ordem);
  const total = ativas.reduce((s, d) => s + d.peso, 0);
  const acumulado = new Map(ativas.map((d) => [d.id, 0]));
  const sequencia: string[] = [];

  for (let i = 0; i < total; i++) {
    let escolhida: DisciplinaCiclo | null = null;
    for (const d of ativas) {
      acumulado.set(d.id, acumulado.get(d.id)! + d.peso);
      // ">" estrito: em empate vence a de maior prioridade (menor ordem)
      if (!escolhida || acumulado.get(d.id)! > acumulado.get(escolhida.id)!) escolhida = d;
    }
    acumulado.set(escolhida!.id, acumulado.get(escolhida!.id)! - total);
    sequencia.push(escolhida!.id);
  }
  return sequencia;
}

// -----------------------------------------------------------------------------
// 2. Fila de teoria
// -----------------------------------------------------------------------------

export function minutosRestantesDoTopico(t: TopicoCiclo, config: ConfigCiclo): number {
  if (t.teoriaConcluida) return 0;
  const estimado = t.minutosEstimados ?? config.duracaoBlocoMin;
  // Tópico não marcado como concluído nunca some da fila: se o tempo estimado
  // já foi gasto, sobra um fragmento mínimo para fechar o assunto.
  return Math.max(estimado - t.minutosEstudados, config.fragmentoMinimoMin);
}

export function montarFilaTeoria(
  disciplinas: readonly DisciplinaCiclo[],
  topicos: readonly TopicoCiclo[],
  config: ConfigCiclo,
  estado: EstadoCiclo = ESTADO_INICIAL,
): PedacoTeoria[] {
  const sequencia = sequenciaDoCiclo(disciplinas);
  if (sequencia.length === 0) return [];

  const naSequencia = new Set(sequencia);
  const pendentes = new Map<string, { id: string; restante: number }[]>();
  let totalRestante = 0;

  for (const t of [...topicos].sort((a, b) => a.ordem - b.ordem)) {
    if (!naSequencia.has(t.disciplinaId)) continue;
    const restante = minutosRestantesDoTopico(t, config);
    if (restante <= 0) continue;
    if (!pendentes.has(t.disciplinaId)) pendentes.set(t.disciplinaId, []);
    pendentes.get(t.disciplinaId)!.push({ id: t.id, restante });
    totalRestante += restante;
  }

  const fila: PedacoTeoria[] = [];
  const bloco = config.duracaoBlocoMin;
  const fragmento = Math.min(config.fragmentoMinimoMin, bloco);
  let turno = estado.posicao;
  let jaEstudadoNoTurno = Math.min(Math.max(estado.minutosNoTurno, 0), bloco);

  while (totalRestante > 0) {
    const disciplinaId = sequencia[((turno % sequencia.length) + sequencia.length) % sequencia.length];
    const lista = pendentes.get(disciplinaId);
    let verba = bloco - jaEstudadoNoTurno;
    jaEstudadoNoTurno = 0; // só o primeiro turno chega parcialmente consumido

    while (lista && lista.length > 0 && verba > 0 && (verba >= fragmento || verba >= lista[0].restante)) {
      const topico = lista[0];
      const minutos = Math.min(verba, topico.restante);
      topico.restante -= minutos;
      verba -= minutos;
      totalRestante -= minutos;
      fila.push({
        disciplinaId,
        topicoId: topico.id,
        minutos,
        turno,
        concluiTopico: topico.restante === 0,
      });
      if (topico.restante === 0) lista.shift();
    }
    turno++;
  }
  return fila;
}

// -----------------------------------------------------------------------------
// 3. Projeção da agenda
// -----------------------------------------------------------------------------

export interface EntradaProjecao {
  config: ConfigCiclo;
  disciplinas: readonly DisciplinaCiclo[];
  topicos: readonly TopicoCiclo[];
  revisoesPendentes: readonly RevisaoPendente[];
  estado?: EstadoCiclo;
  hoje: DataISO;
  /** Fator aplicado aos minutos de cada dia (1 = plano; 0.6 = estou rendendo 60%). */
  ritmo?: number;
  /** Limite de segurança da projeção, em dias. */
  horizonteDias?: number;
  /** Minutos já estudados hoje: saem da capacidade do primeiro dia. */
  minutosJaEstudadosHoje?: number;
}

interface RevisaoNaFila {
  revisaoId: string | null;
  topicoId: string;
  disciplinaId: string;
  numero: number;
  dataAlvo: DataISO;
}

function ordenarRevisoes(fila: RevisaoNaFila[]) {
  fila.sort((a, b) => (a.dataAlvo === b.dataAlvo ? a.numero - b.numero : a.dataAlvo < b.dataAlvo ? -1 : 1));
}

export function projetarAgenda(entrada: EntradaProjecao): Projecao {
  const { config, hoje } = entrada;
  const ritmo = entrada.ritmo ?? 1;
  const horizonte = entrada.horizonteDias ?? 1095;
  const rev = config.revisoes;
  const diasRevisao: readonly DiaSemana[] = rev.diasPermitidos.length > 0 ? rev.diasPermitidos : [0, 1, 2, 3, 4, 5, 6];

  const fila = montarFilaTeoria(entrada.disciplinas, entrada.topicos, config, entrada.estado).map((p) => ({
    ...p,
    restante: p.minutos,
    iniciado: false,
  }));
  const minutosTeoriaRestantes = fila.reduce((s, p) => s + p.minutos, 0);

  const revisoes: RevisaoNaFila[] = rev.habilitadas
    ? entrada.revisoesPendentes.map((r) => ({
        revisaoId: r.id,
        topicoId: r.topicoId,
        disciplinaId: r.disciplinaId,
        numero: r.numero,
        dataAlvo: r.dataAlvo,
      }))
    : [];
  ordenarRevisoes(revisoes);

  const capacidadeSemanal = (Object.values(config.minutosPorDia) as number[]).reduce((s, m) => s + m, 0);
  if (Math.floor(capacidadeSemanal * ritmo) <= 0) {
    return {
      dias: [],
      conclusaoTeoria: null,
      conclusaoRevisoes: null,
      minutosTeoriaRestantes,
      horizonteAtingido: fila.length > 0 || revisoes.length > 0,
      semCapacidade: true,
    };
  }

  const inicio = maxData(hoje, config.dataInicio);
  const dias: DiaAgenda[] = [];
  let conclusaoTeoria: DataISO | null = null;
  let conclusaoRevisoes: DataISO | null = null;

  for (let i = 0; i < horizonte; i++) {
    if (fila.length === 0 && revisoes.length === 0) break;

    const data = somarDias(inicio, i);
    const diaSemana = diaDaSemana(data);
    const usadosHoje = data === hoje ? (entrada.minutosJaEstudadosHoje ?? 0) : 0;
    const capacidadeMin = Math.max(0, Math.floor((config.minutosPorDia[diaSemana] ?? 0) * ritmo) - usadosHoje);
    const itens: ItemAgenda[] = [];
    let livre = capacidadeMin;

    // 3a. Revisões vencidas primeiro, com teto diário enquanto houver teoria
    if (livre > 0 && revisoes.length > 0 && diasRevisao.includes(diaSemana)) {
      const teto = fila.length > 0 ? Math.floor(capacidadeMin * rev.limiteDoDia) : capacidadeMin;
      let usado = 0;
      while (
        revisoes.length > 0 &&
        revisoes[0].dataAlvo <= data &&
        livre >= rev.minutosPorRevisao &&
        (usado === 0 || usado + rev.minutosPorRevisao <= teto)
      ) {
        const r = revisoes.shift()!;
        itens.push({
          tipo: "revisao",
          disciplinaId: r.disciplinaId,
          topicoId: r.topicoId,
          minutos: rev.minutosPorRevisao,
          numero: r.numero,
          revisaoId: r.revisaoId,
          dataAlvo: r.dataAlvo,
          atrasadaDesde: r.dataAlvo < data ? r.dataAlvo : null,
        });
        usado += rev.minutosPorRevisao;
        livre -= rev.minutosPorRevisao;
        conclusaoRevisoes = data;
      }
    }

    // 3b. Teoria, empurrando a fila
    while (fila.length > 0 && livre > 0) {
      const pedaco = fila[0];
      if (livre < pedaco.restante && livre < config.fragmentoMinimoMin) break;
      const minutos = Math.min(livre, pedaco.restante);
      itens.push({
        tipo: "teoria",
        disciplinaId: pedaco.disciplinaId,
        topicoId: pedaco.topicoId,
        minutos,
        turno: pedaco.turno,
        concluiTopico: pedaco.concluiTopico && minutos === pedaco.restante,
        continuacao: pedaco.iniciado,
      });
      pedaco.restante -= minutos;
      pedaco.iniciado = true;
      livre -= minutos;

      if (pedaco.restante === 0) {
        fila.shift();
        if (fila.length === 0) conclusaoTeoria = data;
        if (pedaco.concluiTopico && rev.habilitadas) {
          rev.intervalos.forEach((intervalo, idx) => {
            revisoes.push({
              revisaoId: null,
              topicoId: pedaco.topicoId,
              disciplinaId: pedaco.disciplinaId,
              numero: idx + 1,
              dataAlvo: proximoDiaPermitido(somarDias(data, intervalo), diasRevisao),
            });
          });
          ordenarRevisoes(revisoes);
        }
      }
    }

    dias.push({ data, diaSemana, capacidadeMin, itens, minutosLivres: livre });
  }

  return {
    dias,
    conclusaoTeoria,
    conclusaoRevisoes,
    minutosTeoriaRestantes,
    horizonteAtingido: fila.length > 0 || revisoes.length > 0,
    semCapacidade: false,
  };
}

/** Modo fixo: o plano é gerado uma vez, a partir da data de início. */
export function gerarPlanoFixo(entrada: Omit<EntradaProjecao, "hoje" | "ritmo">): Projecao {
  return projetarAgenda({ ...entrada, hoje: entrada.config.dataInicio, ritmo: 1 });
}

/** Modo fixo: itens pendentes cuja data já passou. */
export function itensAtrasados<T extends { data: DataISO; status: string }>(itens: readonly T[], hoje: DataISO): T[] {
  return itens.filter((i) => i.status === "pendente" && i.data < hoje);
}

// -----------------------------------------------------------------------------
// 4. Avanço do ciclo, ritmo e data de conclusão
// -----------------------------------------------------------------------------

/**
 * Atualiza a posição do ciclo depois de uma sessão de teoria.
 * `fila` é a fila atual (montarFilaTeoria) — usada para saber quantos minutos
 * ainda faltavam naquele turno.
 */
export function registrarEstudoNoCiclo(
  estado: EstadoCiclo,
  sessao: { turno: number; minutos: number },
  fila: readonly PedacoTeoria[],
): EstadoCiclo {
  // Estudou um turno anterior ao atual (ex.: completou algo de ontem): o
  // progresso já fica no tópico, a posição não muda.
  if (sessao.turno < estado.posicao) return estado;

  // Pulou para um turno à frente: a posição salta para ele.
  const base = sessao.turno > estado.posicao ? { posicao: sessao.turno, minutosNoTurno: 0 } : estado;

  const faltavam = fila.filter((p) => p.turno === sessao.turno).reduce((s, p) => s + p.minutos, 0);
  const tolerancia = Math.min(10, Math.round(faltavam * 0.2));

  if (faltavam === 0 || sessao.minutos + tolerancia >= faltavam) {
    return { posicao: base.posicao + 1, minutosNoTurno: 0 };
  }
  return { posicao: base.posicao, minutosNoTurno: base.minutosNoTurno + sessao.minutos };
}

/**
 * Ritmo real = minutos estudados ÷ minutos disponíveis no plano, numa janela
 * recente (por padrão 14 dias, sem contar hoje). null = histórico insuficiente.
 */
export function calcularRitmo(params: {
  config: ConfigCiclo;
  minutosPorData: Readonly<Record<DataISO, number>>;
  hoje: DataISO;
  janelaDias?: number;
  minimoDias?: number;
}): number | null {
  const { config, minutosPorData, hoje } = params;
  const janela = params.janelaDias ?? 14;
  const minimo = params.minimoDias ?? 5;

  let planejado = 0;
  let realizado = 0;
  let dias = 0;
  for (let d = maxData(config.dataInicio, somarDias(hoje, -janela)); d < hoje; d = somarDias(d, 1)) {
    planejado += config.minutosPorDia[diaDaSemana(d) as DiaSemana] ?? 0;
    realizado += minutosPorData[d] ?? 0;
    dias++;
  }
  if (dias < minimo || planejado === 0) return null;
  return Math.min(Math.max(realizado / planejado, 0.1), 1.5);
}

export interface EstimativaConclusao {
  noPlano: DataISO | null;
  noRitmoAtual: DataISO | null;
  ritmo: number | null;
  minutosTeoriaRestantes: number;
}

export function estimarConclusao(
  entrada: EntradaProjecao,
  minutosPorData: Readonly<Record<DataISO, number>>,
): EstimativaConclusao {
  const plano = projetarAgenda({ ...entrada, ritmo: 1 });
  const ritmo = calcularRitmo({ config: entrada.config, minutosPorData, hoje: entrada.hoje });
  const real = ritmo === null ? null : projetarAgenda({ ...entrada, ritmo });
  return {
    noPlano: plano.conclusaoTeoria,
    noRitmoAtual: real?.conclusaoTeoria ?? null,
    ritmo,
    minutosTeoriaRestantes: plano.minutosTeoriaRestantes,
  };
}
