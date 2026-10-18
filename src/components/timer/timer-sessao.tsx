"use client";

import { useEffect } from "react";
import { Coffee, Pause, Play, Square, Timer, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { cn, formatarRelogio } from "@/lib/utils";
import { tempoLiquidoMs, useSessaoTimer } from "@/stores/sessao-timer";
import { useAgora, useEncerrarSessao, useHidratado } from "./use-encerrar-sessao";

/** Timer global do cabeçalho: tempo líquido da sessão, cronômetro ou pomodoro. */
export function TimerSessao() {
  const hidratado = useHidratado();
  const s = useSessaoTimer();
  const agora = useAgora(s.status !== "parado");
  const { encerrarESalvar, salvando } = useEncerrarSessao();

  useEffect(() => {
    if (agora === 0 || s.status === "parado" || s.modo !== "pomodoro") return;
    const evento = s.verificarPomodoro(agora);
    if (evento === "iniciou_pausa") toast(`Pausa de ${s.pomodoro.pausaMin} min. O tempo líquido está congelado.`);
    if (evento === "fim_da_pausa") toast("Pausa encerrada. Retome o foco quando quiser.");
  }, [agora, s]);

  if (!hidratado) return <div className="h-10 w-48 rounded-full bg-muted/60" aria-hidden />;

  if (s.status === "parado") {
    return (
      <div className="flex items-center gap-1 rounded-full border bg-card p-1">
        <Tooltip content={s.modo === "pomodoro" ? "Pomodoro: 25 min de foco, 5 de pausa" : "Cronômetro livre"}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label={s.modo === "pomodoro" ? "Mudar para cronômetro" : "Mudar para pomodoro"}
            onClick={() => s.definirModo(s.modo === "pomodoro" ? "cronometro" : "pomodoro")}
          >
            {s.modo === "pomodoro" ? <TimerReset /> : <Timer />}
          </Button>
        </Tooltip>
        <Button size="sm" variant="ghost" className="rounded-full pr-3.5" onClick={() => s.iniciar()}>
          <Play className="fill-current" />
          Sessão livre
        </Button>
      </div>
    );
  }

  const liquidoSeg = tempoLiquidoMs(s, agora) / 1000;
  const emPausaPomodoro = s.modo === "pomodoro" && s.pomodoro.fase === "pausa";
  const restanteFoco = s.pomodoro.focoMin * 60 - (liquidoSeg - s.pomodoro.focoInicioMs / 1000);
  const restantePausa = s.pomodoro.pausaDesde ? s.pomodoro.pausaMin * 60 - (agora - s.pomodoro.pausaDesde) / 1000 : 0;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-full border bg-card py-1 pl-3.5 pr-1",
        s.status === "rodando" && "border-highlight/60",
      )}
      role="timer"
      aria-live="off"
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", s.status === "rodando" ? "animate-pulse bg-highlight" : "bg-muted-foreground")}
      />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="tabular text-[15px] font-semibold">{formatarRelogio(liquidoSeg)}</span>
        <span className="hidden max-w-44 truncate text-[11px] text-muted-foreground sm:block">
          {s.modo === "pomodoro"
            ? emPausaPomodoro
              ? restantePausa > 0
                ? `Pausa: ${formatarRelogio(restantePausa).slice(3)}`
                : "Pausa encerrada"
              : `Foco: ${formatarRelogio(Math.max(restanteFoco, 0)).slice(3)}`
            : (s.contexto?.rotulo ?? "Sessão livre")}
        </span>
      </div>
      <div className="ml-1 flex items-center">
        {s.status === "rodando" ? (
          <Button size="icon-sm" variant="ghost" className="rounded-full" aria-label="Pausar" onClick={s.pausar}>
            <Pause className="fill-current" />
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" className="rounded-full" aria-label="Retomar" onClick={s.retomar}>
            {emPausaPomodoro ? <Coffee /> : <Play className="fill-current" />}
          </Button>
        )}
        <Tooltip content="Encerrar e registrar a sessão">
          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full"
            aria-label="Encerrar sessão"
            disabled={salvando}
            onClick={encerrarESalvar}
          >
            <Square className="fill-current" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
