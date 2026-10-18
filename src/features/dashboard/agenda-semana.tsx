import { RotateCcw } from "lucide-react";
import type { DiaSemanaPainel } from "@/lib/data/painel";
import { cn, formatarData, formatarDuracao } from "@/lib/utils";

/** Semana corrente (segunda a domingo): o que foi estudado nos dias passados e o plano daqui pra frente. */
export function AgendaSemana({ dias }: { dias: DiaSemanaPainel[] }) {
  return (
    <section aria-labelledby="agenda-semana" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="agenda-semana" className="font-semibold tracking-tight">
          Agenda da semana
        </h2>
        <span className="hidden text-xs text-muted-foreground sm:inline">O ciclo reprograma sozinho os dias sem estudo</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ol className="grid min-w-[760px] grid-cols-7 gap-2">
          {dias.map((dia) => {
            const teoria = dia.itens.filter((i) => i.tipo === "teoria");
            const revisoes = dia.itens.filter((i) => i.tipo === "revisao");
            return (
              <li
                key={dia.data}
                aria-current={dia.ehHoje ? "date" : undefined}
                className={cn(
                  "flex min-h-40 flex-col rounded-lg border bg-card p-2.5",
                  dia.passado && "bg-transparent",
                  dia.ehHoje && "border-highlight/70 shadow-[inset_0_3px_0_var(--highlight)]",
                )}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className={cn("text-sm font-medium capitalize", dia.passado && "text-muted-foreground")}>
                    {formatarData.semanaCurta(dia.data)}
                  </span>
                  <span className="tabular text-xs text-muted-foreground">{formatarData.curta(dia.data)}</span>
                </div>

                {dia.passado ? (
                  <p className="mt-auto text-xs text-muted-foreground">
                    {dia.estudadoSeg > 0 ? (
                      <>
                        Estudou <span className="tabular font-medium text-foreground">{formatarDuracao(dia.estudadoSeg)}</span>
                      </>
                    ) : (
                      "Sem estudo"
                    )}
                  </p>
                ) : dia.itens.length === 0 ? (
                  <p className="mt-auto text-xs text-muted-foreground">
                    {dia.ehHoje && dia.estudadoSeg > 0 ? "Plano cumprido" : "Folga"}
                  </p>
                ) : (
                  <div className="flex flex-1 flex-col gap-1">
                    {teoria.map((item) => (
                      <div key={item.chave} className="flex items-stretch gap-1.5 text-xs" title={`${item.disciplina}: ${item.topico}`}>
                        <span aria-hidden className="w-0.5 shrink-0 rounded-full" style={{ background: `var(--disc-${item.cor})` }} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 leading-snug">{item.topico}</span>
                          <span className="tabular text-muted-foreground">{item.minutos} min</span>
                        </span>
                      </div>
                    ))}
                    {revisoes.length > 0 && (
                      <p className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                        <RotateCcw className="size-3" />
                        {revisoes.length} {revisoes.length === 1 ? "revisão" : "revisões"}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
