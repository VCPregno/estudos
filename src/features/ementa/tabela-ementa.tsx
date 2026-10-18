"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { marcarTeoria } from "@/app/actions/ementa";
import { Button } from "@/components/ui/button";
import { Checkbox, Progress, Tooltip } from "@/components/ui/primitives";
import type { DadosEmenta, DisciplinaEmenta, LinhaEmenta } from "@/lib/data/ementa";
import { cn, formatarData } from "@/lib/utils";

const MARCADORES = 6;

/** Unidades de estudo = tópicos sem subtópicos + subtópicos. */
function unidades(d: DisciplinaEmenta): LinhaEmenta[] {
  return d.topicos.flatMap((t) => (t.subtopicos.length ? t.subtopicos : [t]));
}

function aproveitamentoMedio(linhas: LinhaEmenta[]): number | null {
  const comQuestoes = linhas.filter((l) => l.questoes > 0 && l.aproveitamento !== null);
  const total = comQuestoes.reduce((s, l) => s + l.questoes, 0);
  if (!total) return null;
  return Math.round(comQuestoes.reduce((s, l) => s + l.aproveitamento! * l.questoes, 0) / total);
}

export function TabelaEmenta({ dados }: { dados: DadosEmenta }) {
  const router = useRouter();
  const [concluidos, setConcluidos] = useState<Set<string>>(
    () => new Set(dados.disciplinas.flatMap(unidades).filter((l) => l.teoria).map((l) => l.id)),
  );
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(dados.disciplinas.slice(0, 1).map((d) => d.id)));
  const [, startTransition] = useTransition();

  function alternarTeoria(id: string, valor: boolean) {
    setConcluidos((s) => {
      const n = new Set(s);
      if (valor) n.add(id);
      else n.delete(id);
      return n;
    });
    startTransition(async () => {
      const r = await marcarTeoria(id, valor);
      if (!r.ok) {
        toast.error(r.erro ?? "Não deu para salvar.");
        setConcluidos((s) => {
          const n = new Set(s);
          if (valor) n.delete(id);
          else n.add(id);
          return n;
        });
        return;
      }
      if (valor && dados.modo === "real") toast.success("Teoria concluída. As revisões foram agendadas.");
    });
  }

  if (!dados.edital) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Ementa</h1>
        <p className="mt-3 text-muted-foreground">Importe um edital para ver as matérias e os tópicos aqui.</p>
        <Button asChild variant="highlight" className="mt-6">
          <Link href="/editais/importar">Importar edital</Link>
        </Button>
      </div>
    );
  }

  const todas = dados.disciplinas.flatMap(unidades);
  const feitas = todas.filter((l) => concluidos.has(l.id)).length;
  const pct = todas.length ? Math.round((100 * feitas) / todas.length) : 0;
  const aprov = aproveitamentoMedio(todas);
  const c = dados.conclusao;
  const ritmoPct = c?.ritmo != null ? Math.round(c.ritmo * 100) : null;

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0">
      {dados.modo === "demo" && (
        <p className="mb-6 rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
          Modo demonstração: dados de exemplo, as marcações não são gravadas.
        </p>
      )}

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Ementa</h1>
          {dados.editais.length > 1 ? (
            <select
              aria-label="Edital"
              value={dados.edital.id}
              onChange={(e) => router.push(`/ementa?edital=${e.target.value}`)}
              className="mt-2 h-9 max-w-full rounded-md border border-input bg-card px-2 text-sm"
            >
              {dados.editais.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-muted-foreground">{dados.edital.nome}</p>
          )}
        </div>
      </header>

      <dl className="mt-6 grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Teoria</dt>
          <dd className="mt-1">
            <span className="tabular text-lg font-semibold">{pct}%</span>
            <span className="tabular ml-2 text-sm text-muted-foreground">
              {feitas} de {todas.length}
            </span>
            <Progress value={pct} className="mt-2" indicatorClassName="bg-foreground" aria-label={`${pct}% da teoria concluída`} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Aproveitamento nas questões</dt>
          <dd className="tabular mt-1 text-lg font-semibold">{aprov === null ? "Sem questões ainda" : `${aprov}%`}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Termina no plano</dt>
          <dd className="mt-1 text-lg font-semibold">
            {c?.noPlano ? formatarData.longa(c.noPlano) : c ? "Sem previsão" : "Crie um cronograma"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">No seu ritmo{ritmoPct !== null ? ` (${ritmoPct}%)` : ""}</dt>
          <dd className="mt-1 text-lg font-semibold">
            {c?.noRitmo ? formatarData.longa(c.noRitmo) : c ? "Poucos dias de histórico" : "–"}
          </dd>
        </div>
      </dl>
      {!c && (
        <p className="mt-3 text-sm text-muted-foreground">
          A data estimada aparece quando este edital tiver um cronograma ativo.{" "}
          <Link href="/cronograma" className="text-foreground underline-offset-4 hover:underline">
            Criar cronograma
          </Link>
        </p>
      )}

      <div className="mt-8 hidden grid-cols-[minmax(0,1fr)_72px_132px_104px] gap-3 px-4 text-xs text-muted-foreground md:grid" aria-hidden>
        <span>Tópico</span>
        <span className="text-center">Teoria</span>
        <span>Revisões</span>
        <span className="text-right">Aproveitamento</span>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        {dados.disciplinas.map((d) => {
          const us = unidades(d);
          const feitasD = us.filter((l) => concluidos.has(l.id)).length;
          const aberta = abertas.has(d.id);
          const aprovD = aproveitamentoMedio(us);
          return (
            <section key={d.id} className="rounded-xl border bg-card" aria-labelledby={`disc-${d.id}`}>
              <button
                type="button"
                aria-expanded={aberta}
                onClick={() =>
                  setAbertas((s) => {
                    const n = new Set(s);
                    if (n.has(d.id)) n.delete(d.id);
                    else n.add(d.id);
                    return n;
                  })
                }
                className="flex w-full items-center gap-3 rounded-xl p-4 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !aberta && "-rotate-90")} />
                <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: `var(--disc-${d.cor})` }} />
                <span className="min-w-0 flex-1">
                  <span id={`disc-${d.id}`} className="block truncate font-semibold">
                    {d.nome}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {feitasD} de {us.length} com teoria
                    {aprovD !== null ? `, ${aprovD}% de acerto` : ""}
                  </span>
                </span>
                <Progress
                  value={us.length ? (100 * feitasD) / us.length : 0}
                  className="hidden w-32 sm:block"
                  indicatorClassName="bg-foreground"
                  aria-label={`${feitasD} de ${us.length} tópicos com teoria concluída`}
                />
              </button>

              {aberta && (
                <ol className="border-t">
                  {d.topicos.map((t) =>
                    t.subtopicos.length ? (
                      <li key={t.id}>
                        <p className="flex gap-2 px-4 pt-3 pb-1 text-sm font-medium">
                          {t.codigo && <span className="tabular text-muted-foreground">{t.codigo}</span>}
                          <span>{t.titulo}</span>
                        </p>
                        <ol>
                          {t.subtopicos.map((s) => (
                            <Linha key={s.id} l={s} feita={concluidos.has(s.id)} recuo onAlternar={alternarTeoria} />
                          ))}
                        </ol>
                      </li>
                    ) : (
                      <Linha key={t.id} l={t} feita={concluidos.has(t.id)} onAlternar={alternarTeoria} />
                    ),
                  )}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Linha({
  l,
  feita,
  recuo,
  onAlternar,
}: {
  l: LinhaEmenta;
  feita: boolean;
  recuo?: boolean;
  onAlternar: (id: string, valor: boolean) => void;
}) {
  const textoRevisoes =
    l.revisoesTotal === 0
      ? feita
        ? "Revisões agendadas ao salvar"
        : "As revisões são agendadas quando a teoria for concluída"
      : `${l.revisoesFeitas} de ${l.revisoesTotal} revisões feitas${l.proximaRevisao ? `, próxima em ${formatarData.curta(l.proximaRevisao)}` : ""}`;

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-4 py-2.5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_72px_132px_104px]",
        recuo && "pl-8",
      )}
    >
      <label htmlFor={`t-${l.id}`} className="flex min-w-0 cursor-pointer gap-2 text-sm">
        {l.codigo && <span className="tabular shrink-0 text-muted-foreground">{l.codigo}</span>}
        <span className={cn("min-w-0", feita && "text-muted-foreground")}>{l.titulo}</span>
      </label>
      <span className="flex justify-center">
        <Checkbox id={`t-${l.id}`} checked={feita} onCheckedChange={(v) => onAlternar(l.id, v === true)} aria-label={`Teoria de ${l.titulo}`} />
      </span>
      <Tooltip content={textoRevisoes}>
        <span className="col-span-2 flex items-center gap-1 md:col-span-1" role="img" aria-label={textoRevisoes}>
          {Array.from({ length: MARCADORES }, (_, i) => (
            <span
              key={i}
              className={cn(
                "flex size-4.5 items-center justify-center rounded-full border text-[9px] font-semibold tabular",
                i < l.revisoesFeitas
                  ? "border-foreground bg-foreground text-background"
                  : i < l.revisoesTotal
                    ? "border-highlight-ink/60 text-highlight-ink"
                    : "border-border text-transparent",
              )}
            >
              {i + 1}
            </span>
          ))}
        </span>
      </Tooltip>
      <span className="tabular hidden text-right text-sm md:block">
        {l.aproveitamento === null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <>
            <span className="font-semibold">{Math.round(l.aproveitamento)}%</span>
            <span className="ml-1 text-xs text-muted-foreground">({l.questoes})</span>
          </>
        )}
      </span>
    </li>
  );
}
