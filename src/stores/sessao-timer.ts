"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Timer global de sessão. Mede tempo LÍQUIDO (pausas não contam) e sobrevive a
 * recarregar a página (persistido no localStorage), porque o estado é guardado
 * como marcos de tempo, não como um contador incrementado a cada segundo.
 */

export type TipoSessao = "teoria" | "questoes" | "flashcards" | "revisao" | "lei_seca" | "livre";
export type ModoTimer = "cronometro" | "pomodoro";

export interface ContextoSessao {
  tipo: TipoSessao;
  rotulo: string;
  disciplinaId?: string;
  topicoId?: string;
  revisaoId?: string | null;
  /** turno do ciclo (para avançar a posição do ciclo dinâmico ao encerrar) */
  turno?: number;
  minutosPlanejados?: number;
  /** modo fixo: item do plano gravado, marcado como concluído ao encerrar */
  cronogramaItemId?: string;
}

export interface SessaoEncerrada {
  inicio: string;
  fim: string;
  segundosLiquidos: number;
  pausas: number;
  contexto: ContextoSessao;
}

interface EstadoTimer {
  status: "parado" | "rodando" | "pausado";
  modo: ModoTimer;
  iniciadoEm: number | null;
  rodandoDesde: number | null;
  acumuladoMs: number;
  pausas: number;
  contexto: ContextoSessao | null;
  pomodoro: {
    focoMin: number;
    pausaMin: number;
    fase: "foco" | "pausa";
    /** tempo líquido no início da fase de foco atual */
    focoInicioMs: number;
    /** quando a pausa do pomodoro começou (relógio de parede) */
    pausaDesde: number | null;
    ciclos: number;
  };

  iniciar: (contexto?: ContextoSessao, modo?: ModoTimer) => void;
  pausar: () => void;
  retomar: () => void;
  encerrar: () => SessaoEncerrada | null;
  descartar: () => void;
  definirModo: (modo: ModoTimer) => void;
  /** chamado a cada segundo pelo componente do timer para trocar fases do pomodoro */
  verificarPomodoro: (agora: number) => "iniciou_pausa" | "fim_da_pausa" | null;
}

const CONTEXTO_LIVRE: ContextoSessao = { tipo: "livre", rotulo: "Estudo livre" };

export function tempoLiquidoMs(s: Pick<EstadoTimer, "acumuladoMs" | "rodandoDesde" | "status">, agora = Date.now()) {
  return s.acumuladoMs + (s.status === "rodando" && s.rodandoDesde ? agora - s.rodandoDesde : 0);
}

const pomodoroInicial = (focoMin = 25, pausaMin = 5) => ({
  focoMin,
  pausaMin,
  fase: "foco" as const,
  focoInicioMs: 0,
  pausaDesde: null,
  ciclos: 0,
});

export const useSessaoTimer = create<EstadoTimer>()(
  persist(
    (set, get) => ({
      status: "parado",
      modo: "cronometro",
      iniciadoEm: null,
      rodandoDesde: null,
      acumuladoMs: 0,
      pausas: 0,
      contexto: null,
      pomodoro: pomodoroInicial(),

      iniciar: (contexto = CONTEXTO_LIVRE, modo) => {
        const agora = Date.now();
        set((s) => ({
          status: "rodando",
          modo: modo ?? s.modo,
          iniciadoEm: agora,
          rodandoDesde: agora,
          acumuladoMs: 0,
          pausas: 0,
          contexto,
          pomodoro: pomodoroInicial(s.pomodoro.focoMin, s.pomodoro.pausaMin),
        }));
      },

      pausar: () => {
        const s = get();
        if (s.status !== "rodando") return;
        set({ status: "pausado", acumuladoMs: tempoLiquidoMs(s), rodandoDesde: null, pausas: s.pausas + 1 });
      },

      retomar: () => {
        const s = get();
        if (s.status !== "pausado") return;
        const voltandoDoPomodoro = s.modo === "pomodoro" && s.pomodoro.fase === "pausa";
        set({
          status: "rodando",
          rodandoDesde: Date.now(),
          pomodoro: voltandoDoPomodoro
            ? { ...s.pomodoro, fase: "foco", focoInicioMs: s.acumuladoMs, pausaDesde: null }
            : s.pomodoro,
        });
      },

      encerrar: () => {
        const s = get();
        if (s.status === "parado" || !s.iniciadoEm) return null;
        const agora = Date.now();
        const sessao: SessaoEncerrada = {
          inicio: new Date(s.iniciadoEm).toISOString(),
          fim: new Date(agora).toISOString(),
          segundosLiquidos: Math.round(tempoLiquidoMs(s, agora) / 1000),
          pausas: s.pausas,
          contexto: s.contexto ?? CONTEXTO_LIVRE,
        };
        get().descartar();
        return sessao;
      },

      descartar: () =>
        set((s) => ({
          status: "parado",
          iniciadoEm: null,
          rodandoDesde: null,
          acumuladoMs: 0,
          pausas: 0,
          contexto: null,
          pomodoro: pomodoroInicial(s.pomodoro.focoMin, s.pomodoro.pausaMin),
        })),

      definirModo: (modo) => set({ modo }),

      verificarPomodoro: (agora) => {
        const s = get();
        if (s.modo !== "pomodoro") return null;
        const p = s.pomodoro;
        if (s.status === "rodando" && p.fase === "foco") {
          const liquido = tempoLiquidoMs(s, agora);
          if (liquido - p.focoInicioMs >= p.focoMin * 60_000) {
            set({
              status: "pausado",
              acumuladoMs: liquido,
              rodandoDesde: null,
              pomodoro: { ...p, fase: "pausa", pausaDesde: agora, ciclos: p.ciclos + 1 },
            });
            return "iniciou_pausa";
          }
        }
        if (p.fase === "pausa" && p.pausaDesde && agora - p.pausaDesde >= p.pausaMin * 60_000) {
          set({ pomodoro: { ...p, pausaDesde: null } });
          return "fim_da_pausa";
        }
        return null;
      },
    }),
    {
      name: "sessao-timer",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ status, modo, iniciadoEm, rodandoDesde, acumuladoMs, pausas, contexto, pomodoro }) => ({
        status,
        modo,
        iniciadoEm,
        rodandoDesde,
        acumuladoMs,
        pausas,
        contexto,
        pomodoro,
      }),
    },
  ),
);
