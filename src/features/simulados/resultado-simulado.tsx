"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, GraduationCap, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apagarSimulado } from "@/app/actions/simulados";
import { Button } from "@/components/ui/button";
import { TextoQuestao, TextoSimples } from "@/features/questoes/texto-questao";
import type { ItemRevisao, SimuladoCompleto } from "@/lib/data/simulados";
import { cn } from "@/lib/utils";

export function duracao(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min ${String(s).padStart(2, "0")} s`;
  return `${s} s`;
}

const pct = (a: number, t: number) => (t ? Math.round((100 * a) / t) : 0);
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function ResultadoSimulado({ s, demo = false }: { s: SimuladoCompleto; demo?: boolean }) {
  const [filtro, setFiltro] = useState<"erradas" | "todas">("erradas");
  const naoCertas = s.itens.filter((i) => !i.acertou);
  const lista = filtro === "erradas" ? naoCertas : s.itens;
  const tempoPorQuestao = s.total ? Math.round(s.duracaoSeg / s.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Placar" className="grid gap-3 sm:grid-cols-4">
        <Placar rotulo={s.penalidade ? "Nota líquida" : "Nota"} valor={`${fmt(s.nota)}%`} destaque />
        <Placar rotulo="Acertos" valor={`${s.acertos} de ${s.total}`} classe={s.acertos > 0 ? "text-certo" : undefined} />
        <Placar
          rotulo="Erros · em branco"
          valor={
            <>
              <span className={cn(s.erros > 0 && "text-destructive")}>{s.erros}</span>
              <span className="text-muted-foreground"> · {s.emBranco}</span>
            </>
          }
        />
        <Placar
          rotulo="Tempo"
          valor={duracao(s.duracaoSeg)}
          sub={`${duracao(tempoPorQuestao)} por questão${s.limiteMin ? ` · limite ${s.limiteMin} min` : ""}`}
        />
      </section>

      {s.porDisciplina.length > 1 && (
        <section aria-labelledby="por-disc" className="flex flex-col gap-3">
          <h2 id="por-disc" className="font-semibold tracking-tight">
            Por disciplina
          </h2>
          <ul className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
            {s.porDisciplina.map((d) => {
              const p = pct(d.acertos, d.total);
              return (
                <li key={d.disciplina} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[14rem_minmax(0,1fr)_5.5rem]">
                  <span className="truncate text-sm">{d.disciplina}</span>
                  <span className="text-right text-sm text-muted-foreground sm:order-last">
                    {d.acertos}/{d.total} · <span className={cn("font-semibold", p >= 70 ? "text-certo" : p < 50 ? "text-destructive" : "text-foreground")}>{p}%</span>
                  </span>
                  <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:col-span-1">
                    <span
                      className={cn("block h-full rounded-full", p >= 70 ? "bg-certo" : p < 50 ? "bg-destructive" : "bg-highlight")}
                      style={{ width: `${p}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="revisao" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="revisao" className="font-semibold tracking-tight">
            Revisão
          </h2>
          <div className="flex rounded-lg border bg-card p-0.5 text-sm" role="group" aria-label="Quais questões mostrar">
            {(["erradas", "todas"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={cn("rounded-md px-3 py-1", filtro === f ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {f === "erradas" ? `Erradas e em branco (${naoCertas.length})` : `Todas (${s.total})`}
              </button>
            ))}
          </div>
        </div>
        {lista.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Gabaritou. Nada para revisar aqui.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {lista.map((i) => (
              <ItemRevisaoLinha key={i.questaoId} i={i} posicao={s.itens.indexOf(i) + 1} demo={demo} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Placar({ rotulo, valor, sub, classe, destaque }: { rotulo: string; valor: React.ReactNode; sub?: string; classe?: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card px-4 py-3", destaque && "border-foreground/30")}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tracking-tight", classe)}>{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ItemRevisaoLinha({ i, posicao, demo }: { i: ItemRevisao; posicao: number; demo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [explicacao, setExplicacao] = useState(i.explicacao);
  const [carregando, setCarregando] = useState(false);
  const estado = i.acertou ? "certo" : i.marcada ? "errado" : "branco";

  async function explicar() {
    if (!i.gabarito) return;
    setCarregando(true);
    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questaoId: demo ? undefined : i.questaoId,
          enunciado: i.enunciado,
          alternativas: i.alternativas,
          gabarito: i.gabarito,
          marcada: i.marcada ?? "",
          disciplina: i.disciplina ?? undefined,
          banca: i.banca ?? undefined,
          textoApoio: i.textoApoio ?? undefined,
          gabaritoNaoOficial: i.gabaritoNaoOficial,
        }),
      });
      const json = await r.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
      if (!r.ok) throw new Error(json.erro ?? "O Campos não conseguiu responder.");
      setExplicacao(json.texto);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <li className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-accent/40"
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
            estado === "certo" && "bg-certo text-white",
            estado === "errado" && "bg-destructive text-white",
            estado === "branco" && "border border-dashed text-muted-foreground",
          )}
        >
          {posicao}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-sm">{i.enunciado.replace(/\s+/g, " ")}</span>
          <span className="text-xs text-muted-foreground">
            {i.disciplina ?? "Sem disciplina"} · {i.marcada ? `marcou ${i.marcada}` : "em branco"} · gabarito {i.anulada ? "anulada" : (i.gabarito ?? "?")}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="flex flex-col gap-4 border-t px-4 py-4 text-[15px] leading-relaxed">
          {i.textoApoio && <TextoQuestao texto={i.textoApoio} className="rounded-lg bg-muted/50 px-4 py-3 text-sm" />}
          <TextoQuestao texto={i.enunciado} />
          <ol className="flex flex-col gap-1.5">
            {i.alternativas.map((a) => {
              const gab = a.letra === i.gabarito;
              const errou = a.letra === i.marcada && !gab;
              return (
                <li
                  key={a.letra}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2 leading-snug",
                    gab && "border-certo bg-certo/10",
                    errou && "border-destructive bg-destructive/10",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                      gab && "border-certo bg-certo text-white",
                      errou && "border-destructive bg-destructive text-white",
                    )}
                  >
                    {gab ? <Check className="size-3.5" /> : errou ? <X className="size-3.5" /> : a.letra}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5 whitespace-pre-line">{a.texto}</span>
                </li>
              );
            })}
          </ol>
          {explicacao ? (
            <div className="rounded-lg border-l-4 border-highlight bg-highlight/10 px-4 py-3 text-sm">
              <p className="mb-2 flex items-center gap-1.5 font-semibold">
                <GraduationCap className="size-4" /> Campos
              </p>
              <TextoSimples texto={explicacao} />
            </div>
          ) : (
            i.gabarito &&
            !i.anulada && (
              <div>
                <Button variant={i.acertou ? "outline" : "highlight"} onClick={explicar} disabled={carregando}>
                  {carregando ? <Loader2 className="animate-spin" /> : <GraduationCap />}
                  {i.acertou ? "Explicar com o Campos" : i.marcada ? "Por que errei?" : "Explicar a resposta"}
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </li>
  );
}

export function ApagarSimulado({ id }: { id: string }) {
  const router = useRouter();
  const [apagando, iniciar] = useTransition();
  function apagar() {
    if (!window.confirm("Apagar este simulado? As respostas continuam contando nas suas estatísticas.")) return;
    iniciar(async () => {
      const r = await apagarSimulado(id);
      if (!r.ok) toast.error(r.erro);
      else router.push("/simulados");
    });
  }
  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={apagando} onClick={apagar}>
      {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
      Apagar
    </Button>
  );
}
