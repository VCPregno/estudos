import type { DataISO, DiaSemana } from "./datas";

export type ModoCiclo = "dinamico" | "fixo";

export interface ConfigCiclo {
  modo: ModoCiclo;
  dataInicio: DataISO;
  /** Minutos disponíveis em cada dia da semana (0 = domingo). 0 = folga. */
  minutosPorDia: Record<DiaSemana, number>;
  /** Tamanho de um "turno" de disciplina no ciclo (ex.: 60 min). */
  duracaoBlocoMin: number;
  /** Menor pedaço que vale a pena agendar; sobras menores viram tempo livre. */
  fragmentoMinimoMin: number;
  revisoes: {
    habilitadas: boolean;
    /** Dias após a conclusão da teoria (ex.: [1, 7, 14, 30, 90]). */
    intervalos: number[];
    /** Dias da semana em que revisões podem cair. */
    diasPermitidos: DiaSemana[];
    minutosPorRevisao: number;
    /**
     * Fatia máxima do dia que as revisões podem ocupar enquanto ainda há teoria
     * (evita que um acúmulo de revisões trave o avanço do edital). 0–1.
     */
    limiteDoDia: number;
  };
}

export interface DisciplinaCiclo {
  id: string;
  nome: string;
  /** Turnos por volta do ciclo (peso 2 = aparece duas vezes por volta). */
  peso: number;
  /** Prioridade definida no drag and drop (menor = antes). */
  ordem: number;
  ativo?: boolean;
}

/** Unidade de estudo: tópico folha da ementa (sem subtópicos). */
export interface TopicoCiclo {
  id: string;
  disciplinaId: string;
  titulo: string;
  ordem: number;
  /** null = usa a duração de um bloco. */
  minutosEstimados: number | null;
  minutosEstudados: number;
  teoriaConcluida: boolean;
}

/** Revisão pendente vinda do banco (revisoes_programadas). */
export interface RevisaoPendente {
  id: string;
  topicoId: string;
  disciplinaId: string;
  numero: number;
  dataAlvo: DataISO;
}

/** Posição persistida do ciclo dinâmico (cronogramas.posicao_ciclo / minutos_no_turno). */
export interface EstadoCiclo {
  posicao: number;
  minutosNoTurno: number;
}

export interface PedacoTeoria {
  disciplinaId: string;
  topicoId: string;
  minutos: number;
  /** Índice absoluto do turno na sequência infinita do ciclo. */
  turno: number;
  /** true se este pedaço termina o tempo estimado do tópico. */
  concluiTopico: boolean;
}

export type ItemAgenda =
  | {
      tipo: "teoria";
      disciplinaId: string;
      topicoId: string;
      minutos: number;
      turno: number;
      concluiTopico: boolean;
      /** Continuação de um pedaço que começou em outro dia. */
      continuacao: boolean;
    }
  | {
      tipo: "revisao";
      disciplinaId: string;
      topicoId: string;
      minutos: number;
      numero: number;
      /** id em revisoes_programadas; null quando é uma revisão projetada (ainda não existe). */
      revisaoId: string | null;
      dataAlvo: DataISO;
      /** Preenchido quando a revisão está sendo feita depois da data-alvo. */
      atrasadaDesde: DataISO | null;
    };

export interface DiaAgenda {
  data: DataISO;
  diaSemana: DiaSemana;
  capacidadeMin: number;
  itens: ItemAgenda[];
  minutosLivres: number;
}

export interface Projecao {
  dias: DiaAgenda[];
  /** Dia em que o último tópico de teoria termina; null se não termina no horizonte. */
  conclusaoTeoria: DataISO | null;
  /** Dia em que a última revisão (inclusive projetada) acontece. */
  conclusaoRevisoes: DataISO | null;
  minutosTeoriaRestantes: number;
  /** A projeção parou no limite de dias sem terminar. */
  horizonteAtingido: boolean;
  /** Nenhum dia da semana tem minutos disponíveis. */
  semCapacidade: boolean;
}
