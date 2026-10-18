/**
 * Monta os dados da Dashboard a partir das entradas de domínio. É usado tanto
 * pelo carregador real (Supabase) quanto pelo modo demonstração, então as duas
 * telas passam exatamente pelo mesmo algoritmo do ciclo.
 */

import {
  type ConfigCiclo,
  type DataISO,
  type DisciplinaCiclo,
  type EstadoCiclo,
  type ItemAgenda,
  type RevisaoPendente,
  type TopicoCiclo,
  diaDaSemana,
  estimarConclusao,
  montarFilaTeoria,
  projetarAgenda,
  sequenciaDoCiclo,
  somarDias,
} from "@/lib/ciclo";

export interface DisciplinaPainel extends DisciplinaCiclo {
  /** índice 1–8 da paleta de disciplinas */
  cor: number;
}

export interface ProgressoDia {
  dia: DataISO;
  segundos: number;
  questoes: number;
  certas: number;
  flashcards: number;
}

export interface EntradaPainel {
  modo: "demo" | "real";
  hoje: DataISO;
  ofensiva: { atual: number; recorde: number; ativoHoje: boolean };
  metaDiariaMin: number;
  progresso: ProgressoDia[];
  flashcardsDevidos: number;
  /** já existe edital importado (para orientar o próximo passo quando não há ciclo) */
  temEdital?: boolean;
  ciclo: null | {
    cronogramaId: string;
    config: ConfigCiclo;
    estado: EstadoCiclo;
    disciplinas: DisciplinaPainel[];
    /** só tópicos folha (unidades de estudo) */
    topicos: TopicoCiclo[];
    revisoes: RevisaoPendente[];
    edital: { id: string; nome: string; banca: string | null; dataProva: DataISO | null };
    /** Modo fixo: itens de teoria pendentes do plano gravado (inclui atrasados). null no dinâmico. */
    itensFixos?: { id: string; data: DataISO; disciplinaId: string; topicoId: string; minutos: number }[] | null;
    /** Modo fixo: data do último item do plano (conclusão "no plano"). */
    ultimaDataFixa?: DataISO | null;
  };
}

export interface ItemPainel {
  chave: string;
  tipo: "teoria" | "revisao";
  disciplinaId: string;
  disciplina: string;
  cor: number;
  topicoId: string;
  topico: string;
  minutos: number;
  turno?: number;
  continuacao?: boolean;
  concluiTopico?: boolean;
  revisaoId?: string | null;
  numeroRevisao?: number;
  /** Revisão vencida, ou (modo fixo) teoria planejada para um dia que já passou. */
  atrasadaDesde?: DataISO | null;
  /** Modo fixo: item do plano gravado (cronograma_itens). */
  cronogramaItemId?: string;
}

export interface DiaSemanaPainel {
  data: DataISO;
  ehHoje: boolean;
  passado: boolean;
  capacidadeMin: number;
  estudadoSeg: number;
  itens: ItemPainel[];
}

export interface FatiaCiclo {
  turno: number;
  disciplinaId: string;
  disciplina: string;
  cor: number;
  atual: boolean;
  /** 0–1 do turno atual já estudado */
  progresso: number;
}

export interface DashboardData {
  modo: "demo" | "real";
  temEdital: boolean;
  hoje: DataISO;
  ofensiva: EntradaPainel["ofensiva"];
  metaDiariaMin: number;
  estudadoHojeSeg: number;
  semana: { segundos: number; questoes: number; certas: number };
  serie14: { dia: DataISO; certas: number; erradas: number }[];
  flashcardsDevidos: number;
  sessaoHoje: { itens: ItemPainel[]; capacidadeMin: number } | null;
  agendaSemana: DiaSemanaPainel[];
  ciclo: { fatias: FatiaCiclo[]; volta: number; blocoMin: number; modo: ConfigCiclo["modo"] } | null;
  edital: {
    nome: string;
    banca: string | null;
    dataProva: DataISO | null;
    topicosTotal: number;
    topicosConcluidos: number;
    horasRestantes: number;
    conclusaoPlano: DataISO | null;
    conclusaoRitmo: DataISO | null;
    ritmo: number | null;
  } | null;
}

function inicioDaSemana(data: DataISO): DataISO {
  const dow = diaDaSemana(data); // semana começa na segunda
  return somarDias(data, dow === 0 ? -6 : 1 - dow);
}

export function montarPainel(e: EntradaPainel): DashboardData {
  const porDia = new Map(e.progresso.map((p) => [p.dia, p]));
  const hojeProg = porDia.get(e.hoje);
  const estudadoHojeSeg = hojeProg?.segundos ?? 0;

  const inicioSemana = inicioDaSemana(e.hoje);
  const semana = { segundos: 0, questoes: 0, certas: 0 };
  for (let i = 0; i < 7; i++) {
    const p = porDia.get(somarDias(inicioSemana, i));
    if (!p) continue;
    semana.segundos += p.segundos;
    semana.questoes += p.questoes;
    semana.certas += p.certas;
  }

  const serie14 = Array.from({ length: 14 }, (_, i) => {
    const dia = somarDias(e.hoje, i - 13);
    const p = porDia.get(dia);
    return { dia, certas: p?.certas ?? 0, erradas: (p?.questoes ?? 0) - (p?.certas ?? 0) };
  });

  let sessaoHoje: DashboardData["sessaoHoje"] = null;
  let ciclo: DashboardData["ciclo"] = null;
  let edital: DashboardData["edital"] = null;
  const projetadoPorDia = new Map<DataISO, { capacidadeMin: number; itens: ItemPainel[] }>();

  if (e.ciclo) {
    const c = e.ciclo;
    const disc = new Map(c.disciplinas.map((d) => [d.id, d]));
    const top = new Map(c.topicos.map((t) => [t.id, t]));
    const entrada = {
      config: c.config,
      disciplinas: c.disciplinas,
      topicos: c.topicos,
      revisoesPendentes: c.revisoes,
      estado: c.estado,
      hoje: e.hoje,
      minutosJaEstudadosHoje: Math.round(estudadoHojeSeg / 60),
    };
    const projecao = projetarAgenda(entrada);

    const paraPainel = (item: ItemAgenda, idx: number, data: DataISO): ItemPainel => {
      const d = disc.get(item.disciplinaId);
      const base = {
        chave: `${data}-${idx}`,
        tipo: item.tipo,
        disciplinaId: item.disciplinaId,
        disciplina: d?.nome ?? "Disciplina",
        cor: d?.cor ?? 1,
        topicoId: item.topicoId,
        topico: top.get(item.topicoId)?.titulo ?? "Tópico revisado",
        minutos: item.minutos,
      };
      return item.tipo === "teoria"
        ? { ...base, turno: item.turno, continuacao: item.continuacao, concluiTopico: item.concluiTopico }
        : { ...base, revisaoId: item.revisaoId, numeroRevisao: item.numero, atrasadaDesde: item.atrasadaDesde };
    };

    const fixo = c.config.modo === "fixo" && c.itensFixos;
    if (fixo) {
      // Modo fixo: o plano gravado não se move. O que ficou para trás aparece hoje como atrasado.
      const itens = c.itensFixos!;
      const paraItemFixo = (i: (typeof itens)[number]): ItemPainel => {
        const d = disc.get(i.disciplinaId);
        return {
          chave: `f-${i.id}`,
          tipo: "teoria",
          disciplinaId: i.disciplinaId,
          disciplina: d?.nome ?? "Disciplina",
          cor: d?.cor ?? 1,
          topicoId: i.topicoId,
          topico: top.get(i.topicoId)?.titulo ?? "Tópico",
          minutos: i.minutos,
          cronogramaItemId: i.id,
          atrasadaDesde: i.data < e.hoje ? i.data : null,
        };
      };
      const paraRevisao = (r: RevisaoPendente, data: DataISO): ItemPainel => {
        const d = disc.get(r.disciplinaId);
        return {
          chave: `r-${r.id}`,
          tipo: "revisao",
          disciplinaId: r.disciplinaId,
          disciplina: d?.nome ?? "Disciplina",
          cor: d?.cor ?? 1,
          topicoId: r.topicoId,
          topico: top.get(r.topicoId)?.titulo ?? "Tópico revisado",
          minutos: c.config.revisoes.minutosPorRevisao,
          revisaoId: r.id,
          numeroRevisao: r.numero,
          atrasadaDesde: r.dataAlvo < data ? r.dataAlvo : null,
        };
      };
      for (let i = 0; i < 14; i++) {
        const data = somarDias(e.hoje, i);
        const ehHoje = i === 0;
        const revs = c.config.revisoes.habilitadas
          ? c.revisoes.filter((r) => (ehHoje ? r.dataAlvo <= data : r.dataAlvo === data))
          : [];
        const teoria = itens.filter((it) => (ehHoje ? it.data <= data : it.data === data));
        projetadoPorDia.set(data, {
          capacidadeMin: c.config.minutosPorDia[diaDaSemana(data)] ?? 0,
          itens: [...revs.map((r) => paraRevisao(r, data)), ...teoria.map(paraItemFixo)],
        });
      }
    } else {
      for (const dia of projecao.dias) {
        projetadoPorDia.set(dia.data, {
          capacidadeMin: dia.capacidadeMin,
          itens: dia.itens.map((it, i) => paraPainel(it, i, dia.data)),
        });
      }
    }
    const doDia = projetadoPorDia.get(e.hoje);
    sessaoHoje = doDia ?? { itens: [], capacidadeMin: 0 };

    // Anel do ciclo: a volta atual, com o turno em andamento destacado
    const seq = sequenciaDoCiclo(c.disciplinas);
    if (seq.length > 0) {
      const volta = Math.floor(c.estado.posicao / seq.length);
      ciclo = {
        volta: volta + 1,
        blocoMin: c.config.duracaoBlocoMin,
        modo: c.config.modo,
        fatias: seq.map((disciplinaId, i) => {
          const turno = volta * seq.length + i;
          const d = disc.get(disciplinaId)!;
          return {
            turno,
            disciplinaId,
            disciplina: d.nome,
            cor: d.cor,
            atual: !fixo && turno === c.estado.posicao,
            progresso: fixo
              ? 0
              : turno < c.estado.posicao
                ? 1
                : turno === c.estado.posicao
                  ? Math.min(c.estado.minutosNoTurno / c.config.duracaoBlocoMin, 1)
                  : 0,
          };
        }),
      };
    }

    const minutosPorData = Object.fromEntries(e.progresso.map((p) => [p.dia, Math.round(p.segundos / 60)]));
    const est = estimarConclusao(entrada, minutosPorData);
    const fila = montarFilaTeoria(c.disciplinas, c.topicos, c.config, c.estado);
    edital = {
      nome: c.edital.nome,
      banca: c.edital.banca,
      dataProva: c.edital.dataProva,
      topicosTotal: c.topicos.length,
      topicosConcluidos: c.topicos.filter((t) => t.teoriaConcluida).length,
      horasRestantes: Math.round(fila.reduce((s, p) => s + p.minutos, 0) / 60),
      conclusaoPlano: fixo ? (c.ultimaDataFixa ?? null) : est.noPlano,
      conclusaoRitmo: est.noRitmoAtual,
      ritmo: est.ritmo,
    };
  }

  // Meta do dia: o tempo que o cronograma reserva para hoje (0 = folga); sem cronograma, a meta configurada
  const metaDoDia = e.ciclo
    ? e.hoje < e.ciclo.config.dataInicio
      ? 0
      : (e.ciclo.config.minutosPorDia[diaDaSemana(e.hoje)] ?? 0)
    : e.metaDiariaMin;

  // Próximos 7 dias a partir de hoje (o que já passou aparece no gráfico e em "Esta semana")
  const agendaSemana: DiaSemanaPainel[] = Array.from({ length: 7 }, (_, i) => {
    const data = somarDias(e.hoje, i);
    const proj = projetadoPorDia.get(data);
    return {
      data,
      ehHoje: data === e.hoje,
      passado: data < e.hoje,
      capacidadeMin: proj?.capacidadeMin ?? 0,
      estudadoSeg: porDia.get(data)?.segundos ?? 0,
      itens: data < e.hoje ? [] : (proj?.itens ?? []),
    };
  });

  return {
    modo: e.modo,
    temEdital: e.temEdital ?? e.ciclo !== null,
    hoje: e.hoje,
    ofensiva: e.ofensiva,
    metaDiariaMin: metaDoDia,
    estudadoHojeSeg,
    semana,
    serie14,
    flashcardsDevidos: e.flashcardsDevidos,
    sessaoHoje,
    agendaSemana,
    ciclo,
    edital,
  };
}

/** "3" → 3; nomes/valores inválidos caem na posição da disciplina. */
export function indiceDeCor(cor: string | null | undefined, posicao: number): number {
  const n = Number(cor);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : (posicao % 8) + 1;
}
