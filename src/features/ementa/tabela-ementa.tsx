"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ListChecks, Loader2, Scale, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { definirTipoFonte, marcarTeoria } from "@/app/actions/ementa";
import { Button } from "@/components/ui/button";
import { Checkbox, Progress, Tooltip } from "@/components/ui/primitives";
import type { DadosEmenta, DisciplinaEmenta, LinhaEmenta, TipoFonte } from "@/lib/data/ementa";
import { cn, formatarData } from "@/lib/utils";

const MARCADORES = 6;

export const TIPOS: Record<TipoFonte, { rotulo: string; cor: number; como: string }> = {
  norma: { rotulo: "Norma", cor: 1, como: "Texto oficial, versão compilada. Leia a lei e vá para as questões; doutrina só se travar." },
  guia: { rotulo: "Guia", cor: 7, como: "O documento na versão do edital. Gratuito: leia o original. Pago: resumo da mesma versão e questões." },
  classica: { rotulo: "Clássica", cor: 4, como: "Um material-base por disciplina. Comece pelas questões e leia só o que errar." },
  orgao: { rotulo: "Do órgão", cor: 3, como: "Site do órgão: cartilhas, relatórios e atos. Costuma cair pouco; uma leitura e siga." },
};
const ORDEM_TIPOS: TipoFonte[] = ["norma", "guia", "classica", "orgao"];

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
  const [filtroTipo, setFiltroTipo] = useState<TipoFonte | null>(null);
  const [classificando, setClassificando] = useState(false);
  const [tipos, setTipos] = useState<Record<string, TipoFonte | null>>({});

  const tipoDe = (l: LinhaEmenta) => (l.id in tipos ? tipos[l.id] : l.tipoFonte);

  async function classificar() {
    if (!dados.edital) return;
    setClassificando(true);
    try {
      const r = await fetch("/api/ementa/fontes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editalId: dados.edital.id }),
      });
      const j = await r.json().catch(() => ({ erro: "A classificação demorou demais. Tente de novo." }));
      if (!r.ok) throw new Error(j.erro);
      toast.success(`${j.classificados} tópicos classificados.`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClassificando(false);
    }
  }

  function mudarTipo(id: string, tipo: TipoFonte) {
    setTipos((t) => ({ ...t, [id]: tipo }));
    startTransition(async () => {
      const r = await definirTipoFonte(id, tipo);
      if (!r.ok) toast.error(r.erro ?? "Não deu para salvar.");
    });
  }

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

      <OndeEstudar
        unidades={todas}
        tipoDe={tipoDe}
        filtro={filtroTipo}
        onFiltro={setFiltroTipo}
        classificando={classificando}
        onClassificar={classificar}
        demo={dados.modo === "demo"}
      />

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
          // com filtro de tipo, mostra só as disciplinas com tópicos daquele tipo, já abertas
          if (filtroTipo && !us.some((l) => tipoDe(l) === filtroTipo)) return null;
          const aberta = abertas.has(d.id) || !!filtroTipo;
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
                  {d.topicos.map((t) => {
                    const passa = (l: LinhaEmenta) => !filtroTipo || tipoDe(l) === filtroTipo;
                    const subs = t.subtopicos.filter(passa);
                    if (t.subtopicos.length ? !subs.length : !passa(t)) return null;
                    return t.subtopicos.length ? (
                      <li key={t.id}>
                        <p className="flex gap-2 px-4 pt-3 pb-1 text-sm font-medium">
                          {t.codigo && <span className="tabular text-muted-foreground">{t.codigo}</span>}
                          <span>{t.titulo}</span>
                        </p>
                        <ol>
                          {subs.map((s) => (
                            <Linha key={s.id} l={s} tipo={tipoDe(s)} feita={concluidos.has(s.id)} recuo onAlternar={alternarTeoria} onTipo={mudarTipo} />
                          ))}
                        </ol>
                      </li>
                    ) : (
                      <Linha key={t.id} l={t} tipo={tipoDe(t)} feita={concluidos.has(t.id)} onAlternar={alternarTeoria} onTipo={mudarTipo} />
                    );
                  })}
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
  tipo,
  feita,
  recuo,
  onAlternar,
  onTipo,
}: {
  l: LinhaEmenta;
  tipo: TipoFonte | null;
  feita: boolean;
  recuo?: boolean;
  onAlternar: (id: string, valor: boolean) => void;
  onTipo: (id: string, tipo: TipoFonte) => void;
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
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`t-${l.id}`} className="flex min-w-0 cursor-pointer gap-2 text-sm">
          {l.codigo && <span className="tabular shrink-0 text-muted-foreground">{l.codigo}</span>}
          <span className={cn("min-w-0", feita && "text-muted-foreground")}>{l.titulo}</span>
        </label>
        {(tipo || l.fonte || l.questoesBanco > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {tipo && (
              <span className="relative inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: `var(--disc-${TIPOS[tipo].cor})` }} />
                {TIPOS[tipo].rotulo}
                <select
                  aria-label={`Tipo de fonte de ${l.titulo}`}
                  value={tipo}
                  onChange={(e) => onTipo(l.id, e.target.value as TipoFonte)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {ORDEM_TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {TIPOS[t].rotulo}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {l.fonte && <span className="min-w-0">{l.fonte}</span>}
            {l.questoesBanco > 0 && (
              <Link
                href={`/questoes?disciplina=${l.disciplinaId}&topico=${l.id}&situacao=todas`}
                className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
              >
                <ListChecks className="size-3.5" />
                {l.questoesBanco} {l.questoesBanco === 1 ? "questão" : "questões"}
              </Link>
            )}
            {tipo === "norma" && (
              <Link
                href={`/leis?nova=${encodeURIComponent((l.fonte ?? l.titulo).split(" — ")[0])}`}
                className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
              >
                <Scale className="size-3.5" />
                Leis secas
              </Link>
            )}
          </div>
        )}
      </div>
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

function OndeEstudar({
  unidades,
  tipoDe,
  filtro,
  onFiltro,
  classificando,
  onClassificar,
  demo,
}: {
  unidades: LinhaEmenta[];
  tipoDe: (l: LinhaEmenta) => TipoFonte | null;
  filtro: TipoFonte | null;
  onFiltro: (t: TipoFonte | null) => void;
  classificando: boolean;
  onClassificar: () => void;
  demo: boolean;
}) {
  const faltam = unidades.filter((l) => !tipoDe(l)).length;
  const contagem = Object.fromEntries(ORDEM_TIPOS.map((t) => [t, unidades.filter((l) => tipoDe(l) === t).length])) as Record<TipoFonte, number>;

  return (
    <section aria-labelledby="onde-estudar" className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="onde-estudar" className="font-semibold tracking-tight">
            Onde estudar
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            O edital diz o que estudar, a banca diz até onde, e o tipo do tópico diz onde procurar. Antes de ler, faça as questões do tópico.
          </p>
        </div>
        {faltam > 0 && !demo && (
          <Button variant="highlight" disabled={classificando} onClick={onClassificar}>
            {classificando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {classificando ? "Classificando…" : faltam === unidades.length ? "Classificar com IA" : `Classificar ${faltam} restantes`}
          </Button>
        )}
      </div>
      {classificando && <p className="mt-3 text-sm text-muted-foreground">A IA está lendo os tópicos. Leva de 20 segundos a 1 minuto.</p>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {ORDEM_TIPOS.map((t) => (
          <li key={t}>
            <button
              type="button"
              aria-pressed={filtro === t}
              onClick={() => onFiltro(filtro === t ? null : t)}
              className={cn(
                "flex h-full w-full gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                filtro === t && "border-foreground bg-accent/60",
              )}
            >
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: `var(--disc-${TIPOS[t].cor})` }} />
              <span className="min-w-0">
                <span className="text-sm font-medium">
                  {TIPOS[t].rotulo}
                  <span className="ml-1.5 font-normal text-muted-foreground">{contagem[t]}</span>
                </span>
                <span className="block text-xs text-muted-foreground">{TIPOS[t].como}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {filtro && (
        <p className="mt-3 text-xs text-muted-foreground">
          Mostrando só os tópicos do tipo {TIPOS[filtro].rotulo.toLowerCase()}.{" "}
          <button type="button" className="text-foreground underline-offset-4 hover:underline" onClick={() => onFiltro(null)}>
            Mostrar todos
          </button>
        </p>
      )}
    </section>
  );
}
