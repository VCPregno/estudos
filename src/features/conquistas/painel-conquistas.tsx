import {
  BookOpenCheck,
  Brain,
  CircleCheck,
  Clock,
  Crown,
  FileText,
  Flame,
  FlameKindling,
  Hourglass,
  Layers,
  ListChecks,
  type LucideIcon,
  Mountain,
  Target,
  Trophy,
} from "lucide-react";
import { Progress } from "@/components/ui/primitives";
import type { DadosConquistas, DiaAtividade } from "@/lib/data/conquistas";
import { cn, formatarData, formatarDuracao } from "@/lib/utils";

const ICONES: Record<string, LucideIcon> = {
  flame: Flame,
  "flame-kindling": FlameKindling,
  crown: Crown,
  "circle-check": CircleCheck,
  "list-checks": ListChecks,
  trophy: Trophy,
  target: Target,
  clock: Clock,
  hourglass: Hourglass,
  mountain: Mountain,
  layers: Layers,
  brain: Brain,
  "file-text": FileText,
  "book-open-check": BookOpenCheck,
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function nivel(d: DiaAtividade) {
  const min = d.segundos / 60;
  if (min <= 0 && !d.ativo) return 0;
  if (min < 30) return 1;
  if (min < 90) return 2;
  if (min < 180) return 3;
  return 4;
}

const FUNDO = ["bg-muted", "bg-highlight/30", "bg-highlight/55", "bg-highlight/80", "bg-highlight"];

function Calendario({ dias, hoje }: { dias: DiaAtividade[]; hoje: string }) {
  const semanas = Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));
  return (
    <section aria-labelledby="calendario" className="rounded-xl border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="calendario" className="font-semibold tracking-tight">
          Últimas {semanas.length} semanas
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden>
          menos
          {FUNDO.map((f) => (
            <span key={f} className={cn("size-3 rounded-[3px]", f)} />
          ))}
          mais
        </div>
      </div>
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1 pl-7 text-[10px] text-muted-foreground" aria-hidden>
            {semanas.map((s, i) => {
              const mes = Number(s[0].data.slice(5, 7)) - 1;
              const novo = i === 0 || Number(semanas[i - 1][0].data.slice(5, 7)) - 1 !== mes;
              return (
                <span key={s[0].data} className="w-3.5 shrink-0 overflow-visible whitespace-nowrap">
                  {novo ? MESES[mes] : ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-1">
            <div className="flex w-6 flex-col gap-1 text-[10px] text-muted-foreground" aria-hidden>
              {["", "seg", "", "qua", "", "sex", ""].map((d, i) => (
                <span key={i} className="h-3.5 leading-3.5">
                  {d}
                </span>
              ))}
            </div>
            {semanas.map((s) => (
              <div key={s[0].data} className="flex flex-col gap-1">
                {s.map((d) => {
                  const futuro = d.data > hoje;
                  const titulo = futuro
                    ? ""
                    : `${formatarData.curta(d.data)}: ${d.segundos ? formatarDuracao(d.segundos) : "sem estudo"}${
                        d.questoes ? `, ${d.questoes} questões` : ""
                      }${d.flashcards ? `, ${d.flashcards} flashcards` : ""}`;
                  return (
                    <span
                      key={d.data}
                      title={titulo}
                      className={cn(
                        "size-3.5 rounded-[3px]",
                        futuro ? "bg-transparent" : FUNDO[nivel(d)],
                        d.data === hoje && "ring-1 ring-foreground ring-offset-1 ring-offset-card",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">A cor mostra o tempo de estudo no dia. A ofensiva conta os dias com questões ou flashcards.</p>
    </section>
  );
}

export function PainelConquistas({ dados }: { dados: DadosConquistas }) {
  const { ofensiva, totais } = dados;
  const desbloqueadas = dados.conquistas.filter((c) => c.desbloqueadaEm);
  const acerto = totais.questoes ? Math.round((100 * totais.acertos) / totais.questoes) : null;

  const numeros = [
    { rotulo: "horas de estudo", valor: totais.horas.toLocaleString("pt-BR") },
    { rotulo: "questões", valor: totais.questoes.toLocaleString("pt-BR"), extra: acerto !== null ? `${acerto}% de acerto` : undefined },
    { rotulo: "flashcards revisados", valor: totais.flashcards.toLocaleString("pt-BR") },
    { rotulo: "tópicos concluídos", valor: totais.topicos.toLocaleString("pt-BR") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      {dados.modo === "demo" && (
        <p className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">Modo demonstração: números de exemplo.</p>
      )}
      <h1 className="text-3xl font-semibold tracking-tight">Conquistas</h1>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section aria-label="Ofensiva" className="flex items-center gap-4 rounded-xl border bg-card p-5 md:p-6">
          <span
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl",
              ofensiva.ativoHoje ? "bg-highlight text-highlight-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Flame className={cn("size-7", ofensiva.ativoHoje && "fill-current")} />
          </span>
          <div className="min-w-0">
            <p className="text-3xl font-semibold tracking-tight">
              {ofensiva.atual} {ofensiva.atual === 1 ? "dia" : "dias"}
            </p>
            <p className="text-sm text-muted-foreground">
              {ofensiva.ativoHoje
                ? `Hoje já conta. Recorde: ${ofensiva.recorde}.`
                : ofensiva.atual > 0
                  ? `Faça uma questão ou revise um flashcard hoje para não perder. Recorde: ${ofensiva.recorde}.`
                  : `Uma questão ou um flashcard hoje começa a ofensiva. Recorde: ${ofensiva.recorde}.`}
            </p>
          </div>
        </section>
        <section aria-label="Totais" className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-5 md:grid-cols-4 md:p-6">
          {numeros.map((n) => (
            <div key={n.rotulo}>
              <p className="text-2xl font-semibold tracking-tight">{n.valor}</p>
              <p className="text-sm text-muted-foreground">{n.rotulo}</p>
              {n.extra && <p className="text-xs text-muted-foreground">{n.extra}</p>}
            </div>
          ))}
        </section>
      </div>

      <Calendario dias={dados.dias} hoje={dados.hoje} />

      <section aria-labelledby="lista-conquistas" className="flex flex-col gap-3">
        <h2 id="lista-conquistas" className="font-semibold tracking-tight">
          {desbloqueadas.length} de {dados.conquistas.length} desbloqueadas
        </h2>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dados.conquistas.map((c) => {
            const Icone = ICONES[c.icone] ?? Trophy;
            const feita = !!c.desbloqueadaEm;
            const pct = Math.min(100, Math.round((100 * c.valor) / c.meta));
            return (
              <li key={c.codigo} className={cn("flex gap-3 rounded-xl border bg-card p-4", !feita && "bg-card/60")}>
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl",
                    feita ? "bg-highlight text-highlight-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", !feita && "text-muted-foreground")}>{c.titulo}</p>
                  <p className="text-sm text-muted-foreground">{c.descricao}</p>
                  {feita ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">Desbloqueada em {formatarData.curta(c.desbloqueadaEm!.slice(0, 10))}</p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={pct} className="h-1.5" indicatorClassName="bg-foreground/60" aria-label={`${pct}% de ${c.titulo}`} />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {Math.min(c.valor, c.meta).toLocaleString("pt-BR")}/{c.meta.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
