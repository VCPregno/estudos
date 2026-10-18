import Link from "next/link";
import { Progress } from "@/components/ui/primitives";
import { diferencaEmDias } from "@/lib/ciclo";
import type { DashboardData } from "@/lib/data/painel";
import { cn, formatarData, formatarDuracao } from "@/lib/utils";
import { AgendaSemana } from "./agenda-semana";
import { GraficoQuestoes } from "./grafico-questoes";
import { SessaoDeHoje } from "./sessao-de-hoje";

function Edital({ edital, hoje }: { edital: NonNullable<DashboardData["edital"]>; hoje: string }) {
  const pct = edital.topicosTotal ? Math.round((100 * edital.topicosConcluidos) / edital.topicosTotal) : 0;
  const diasProva = edital.dataProva ? diferencaEmDias(edital.dataProva, hoje) : null;
  const ritmoPct = edital.ritmo !== null ? Math.round(edital.ritmo * 100) : null;
  const passaDaProva =
    edital.dataProva && (edital.conclusaoRitmo ?? edital.conclusaoPlano) && (edital.conclusaoRitmo ?? edital.conclusaoPlano)! > edital.dataProva;

  return (
    <section aria-labelledby="edital" className="flex flex-col rounded-xl border bg-card p-5 md:p-6">
      <p className="text-sm text-muted-foreground">{edital.banca ? `Edital, banca ${edital.banca}` : "Edital"}</p>
      <h2 id="edital" className="mt-1 text-lg leading-snug font-semibold tracking-tight text-balance">
        {edital.nome}
      </h2>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span>Teoria</span>
          <span className="text-muted-foreground">
            {edital.topicosConcluidos} de {edital.topicosTotal} tópicos
          </span>
        </div>
        <Progress value={pct} indicatorClassName="bg-foreground" aria-label={`${pct}% dos tópicos com teoria concluída`} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Termina no plano</dt>
          <dd className="mt-0.5 text-base font-semibold">{edital.conclusaoPlano ? formatarData.longa(edital.conclusaoPlano) : "Sem previsão"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">No seu ritmo{ritmoPct !== null ? ` (${ritmoPct}%)` : ""}</dt>
          <dd className={cn("mt-0.5 text-base font-semibold", passaDaProva && "text-destructive")}>
            {edital.conclusaoRitmo ? formatarData.longa(edital.conclusaoRitmo) : ritmoPct === null ? "Poucos dias de histórico" : "Sem previsão"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Faltam de teoria</dt>
          <dd className="tabular mt-0.5 text-base font-semibold">{edital.horasRestantes}h</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Prova</dt>
          <dd className="mt-0.5 text-base font-semibold">
            {edital.dataProva ? `${formatarData.longa(edital.dataProva)}` : "Sem data"}
            {diasProva !== null && diasProva >= 0 && (
              <span className="tabular block text-xs font-normal text-muted-foreground">em {diasProva} dias</span>
            )}
          </dd>
        </div>
      </dl>

      {passaDaProva && (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Nesse ritmo a teoria termina depois da prova. Aumente as horas no cronograma ou reduza o escopo.
        </p>
      )}

      <Link href="/ementa" className="mt-auto pt-5 text-sm font-medium underline-offset-4 hover:underline">
        Abrir ementa
      </Link>
    </section>
  );
}

function Numeros({ data }: { data: DashboardData }) {
  const acerto = data.semana.questoes ? Math.round((100 * data.semana.certas) / data.semana.questoes) : null;
  const linhas = [
    { rotulo: "Estudado na semana", valor: formatarDuracao(data.semana.segundos) },
    { rotulo: "Questões na semana", valor: String(data.semana.questoes), extra: acerto !== null ? `${acerto}% de acerto` : undefined },
    { rotulo: "Flashcards para revisar", valor: String(data.flashcardsDevidos), href: "/flashcards" },
    { rotulo: "Recorde de ofensiva", valor: `${data.ofensiva.recorde} dias`, href: "/conquistas" },
  ];
  return (
    <section aria-labelledby="numeros" className="rounded-lg border bg-card p-5">
      <h2 id="numeros" className="font-semibold tracking-tight">
        Esta semana
      </h2>
      <dl className="mt-3 divide-y">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between gap-3 py-3">
            <dt className="text-sm text-muted-foreground">
              {l.href ? (
                <Link href={l.href} className="underline-offset-4 hover:text-foreground hover:underline">
                  {l.rotulo}
                </Link>
              ) : (
                l.rotulo
              )}
            </dt>
            <dd className="text-right">
              <span className="tabular text-lg font-semibold">{l.valor}</span>
              {l.extra && <span className="block text-xs text-muted-foreground">{l.extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PainelDashboard({ data }: { data: DashboardData }) {
  const metaSeg = data.metaDiariaMin * 60;
  const pctMeta = metaSeg ? Math.min(100, Math.round((100 * data.estudadoHojeSeg) / metaSeg)) : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] min-w-0 flex-col gap-8">
      {data.modo === "demo" && (
        <p className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
          Modo demonstração: os dados são de exemplo e nada é gravado. Configure o Supabase no <code className="text-foreground">.env.local</code>{" "}
          para usar com os seus dados.
        </p>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight capitalize md:text-4xl">{formatarData.semana(data.hoje)}</h1>
          <p className="mt-1 text-muted-foreground">{formatarData.longa(data.hoje)}</p>
        </div>
        <div className="w-full sm:w-64">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Meta do dia</span>
            <span className="tabular">
              <span className="font-semibold">{formatarDuracao(data.estudadoHojeSeg)}</span>
              <span className="text-muted-foreground"> de {formatarDuracao(metaSeg)}</span>
            </span>
          </div>
          <Progress value={pctMeta} indicatorClassName="bg-highlight" aria-label={`${pctMeta}% da meta do dia`} />
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SessaoDeHoje data={data} />
        {data.edital ? (
          <Edital edital={data.edital} hoje={data.hoje} />
        ) : (
          <section className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {data.temEdital
              ? "A data estimada de conclusão aparece aqui assim que você montar o cronograma."
              : "Sem edital ativo. A data estimada de conclusão aparece aqui depois que você importar um edital e criar o cronograma."}
          </section>
        )}
      </div>

      <AgendaSemana dias={data.agendaSemana} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <GraficoQuestoes serie={data.serie14} />
        <Numeros data={data} />
      </div>
    </div>
  );
}
