"use client";

import Link from "next/link";
import { BookOpen, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgora, useHidratado } from "@/components/timer/use-encerrar-sessao";
import type { DashboardData, FatiaCiclo, ItemPainel } from "@/lib/data/painel";
import { cn, formatarData, formatarDuracao, formatarRelogio } from "@/lib/utils";
import { type ContextoSessao, tempoLiquidoMs, useSessaoTimer } from "@/stores/sessao-timer";

function contextoDoItem(item: ItemPainel): ContextoSessao {
  return {
    tipo: item.tipo === "revisao" ? "revisao" : "teoria",
    rotulo: `${item.disciplina}: ${item.topico}`,
    disciplinaId: item.disciplinaId,
    topicoId: item.topicoId,
    revisaoId: item.revisaoId ?? null,
    turno: item.turno,
    minutosPlanejados: item.minutos,
  };
}

function mesmoItem(c: ContextoSessao | null, item: ItemPainel) {
  return (
    !!c &&
    c.topicoId === item.topicoId &&
    c.tipo === (item.tipo === "revisao" ? "revisao" : "teoria") &&
    (c.revisaoId ?? null) === (item.revisaoId ?? null)
  );
}

// ---------------------------------------------------------------------------
// Anel do ciclo
// ---------------------------------------------------------------------------

const TAM = 248;
const C = TAM / 2;
const R = 104;

function polar(graus: number, raio = R) {
  const rad = ((graus - 90) * Math.PI) / 180;
  return { x: C + raio * Math.cos(rad), y: C + raio * Math.sin(rad) };
}

function arco(de: number, ate: number) {
  const a = polar(de);
  const b = polar(ate);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 ${ate - de > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function AnelCiclo({ fatias, children }: { fatias: FatiaCiclo[]; children: React.ReactNode }) {
  const n = fatias.length;
  const fatia = 360 / n;
  const folga = n > 1 ? Math.min(4, fatia * 0.2) : 0;

  return (
    <div className="relative mx-auto size-[248px] shrink-0">
      <svg viewBox={`0 0 ${TAM} ${TAM}`} className="size-full" role="img" aria-label="Volta atual do ciclo de estudos">
        {fatias.map((f, i) => {
          const de = i * fatia + folga / 2;
          const ate = (i + 1) * fatia - folga / 2;
          const cor = `var(--disc-${f.cor})`;
          return (
            <g key={f.turno}>
              <title>{`${f.disciplina}${f.atual ? " (turno atual)" : f.progresso === 1 ? " (feito)" : ""}`}</title>
              <path
                d={arco(de, ate)}
                fill="none"
                stroke={cor}
                strokeWidth={f.atual ? 18 : 12}
                strokeLinecap="butt"
                opacity={f.progresso === 1 ? 1 : f.atual ? 0.35 : 0.3}
              />
              {f.atual && f.progresso > 0 && (
                <path d={arco(de, de + (ate - de) * f.progresso)} fill="none" stroke={cor} strokeWidth={18} />
              )}
              {f.atual && (
                <circle cx={polar(de + (ate - de) / 2, R + 20).x} cy={polar(de + (ate - de) / 2, R + 20).y} r={3.5} className="fill-foreground" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export function SessaoDeHoje({ data }: { data: DashboardData }) {
  const hidratado = useHidratado();
  const timer = useSessaoTimer();
  const agora = useAgora(timer.status !== "parado");

  if (!data.ciclo || !data.sessaoHoje) {
    return (
      <section className="rounded-xl border bg-card p-6 md:p-8">
        <h2 className="text-lg font-semibold">Sessão de hoje</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Ainda não há um ciclo de estudos ativo. Importe o PDF de um edital: a ementa vira a sua fila de tópicos e o
          cronograma passa a montar o seu dia.
        </p>
        <Button asChild variant="highlight" className="mt-5">
          <Link href="/editais/importar">Importar edital</Link>
        </Button>
      </section>
    );
  }

  const { itens } = data.sessaoHoje;
  const totalMin = itens.reduce((s, i) => s + i.minutos, 0);
  const proximo = itens[0];
  const atual = data.ciclo.fatias.find((f) => f.atual);
  const posicaoNaVolta = data.ciclo.fatias.findIndex((f) => f.atual) + 1;

  const rodando = hidratado && timer.status !== "parado";
  const proximoEmAndamento = rodando && proximo && mesmoItem(timer.contexto, proximo);

  function iniciar(item?: ItemPainel) {
    timer.iniciar(item ? contextoDoItem(item) : undefined);
  }

  let centro: React.ReactNode;
  if (rodando) {
    centro = (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="tabular text-3xl font-semibold tracking-tight">{formatarRelogio(tempoLiquidoMs(timer, agora) / 1000)}</span>
        <span className="max-w-36 truncate text-xs text-muted-foreground">
          {proximoEmAndamento ? proximo.disciplina : (timer.contexto?.rotulo ?? "Sessão livre")}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={timer.status === "rodando" ? timer.pausar : timer.retomar}
        >
          {timer.status === "rodando" ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          {timer.status === "rodando" ? "Pausar" : "Retomar"}
        </Button>
      </div>
    );
  } else {
    centro = (
      <button
        type="button"
        onClick={() => iniciar(proximo)}
        className="group flex size-36 flex-col items-center justify-center gap-1 rounded-full bg-highlight text-highlight-foreground shadow-[0_0_0_6px_color-mix(in_oklab,var(--highlight)_18%,transparent)] transition-transform outline-none hover:scale-[1.03] focus-visible:ring-[4px] focus-visible:ring-ring/50 active:scale-[0.98]"
      >
        <Play className="size-7 fill-current" />
        <span className="text-lg font-bold tracking-wide">INICIAR</span>
        <span className="text-[11px] font-medium opacity-75">{proximo ? formatarDuracao(proximo.minutos * 60) : "sessão livre"}</span>
      </button>
    );
  }

  return (
    <section aria-labelledby="sessao-hoje" className="rounded-xl border bg-card p-5 md:p-7">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-10">
        <div className="flex flex-col items-center gap-3">
          <AnelCiclo fatias={data.ciclo.fatias}>{centro}</AnelCiclo>
          <p className="text-center text-xs text-muted-foreground">
            Volta {data.ciclo.volta}, turno {posicaoNaVolta} de {data.ciclo.fatias.length}
            {atual ? ` em ${atual.disciplina}` : ""}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="sessao-hoje" className="text-lg font-semibold tracking-tight">
              Sessão de hoje
            </h2>
            {totalMin > 0 && <span className="tabular text-sm text-muted-foreground">{formatarDuracao(totalMin * 60)} restantes</span>}
          </div>

          {itens.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              {data.estudadoHojeSeg > 0
                ? "Plano de hoje cumprido. O que vier agora adianta o ciclo de amanhã."
                : "Hoje é folga no seu cronograma. Se quiser estudar mesmo assim, comece uma sessão livre."}
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => iniciar()}>
                  <Play className="fill-current" />
                  Sessão livre
                </Button>
              </div>
            </div>
          ) : (
            <ol className="mt-4 flex flex-col gap-1.5">
              {itens.map((item, i) => {
                const emAndamento = rodando && mesmoItem(timer.contexto, item);
                return (
                  <li
                    key={item.chave}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60",
                      i === 0 && "bg-muted/50",
                      emAndamento && "ring-1 ring-highlight/60",
                    )}
                  >
                    <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: `var(--disc-${item.cor})` }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.topico}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {item.tipo === "revisao" ? <RotateCcw className="size-3 shrink-0" /> : <BookOpen className="size-3 shrink-0" />}
                        <span className="truncate">
                          {item.disciplina}
                          {item.tipo === "revisao"
                            ? `, ${item.numeroRevisao}ª revisão${item.atrasadaDesde ? `, era para ${formatarData.curta(item.atrasadaDesde)}` : ""}`
                            : item.continuacao
                              ? ", continuação"
                              : ""}
                        </span>
                      </p>
                    </div>
                    <span className="tabular text-sm text-muted-foreground">{item.minutos} min</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Iniciar ${item.topico}`}
                      disabled={emAndamento}
                      onClick={() => iniciar(item)}
                      className="rounded-full opacity-70 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Play className="fill-current" />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
