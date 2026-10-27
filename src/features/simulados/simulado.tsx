"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, Clock, ImageOff, Loader2, Play, Scissors } from "lucide-react";
import { toast } from "sonner";
import { type ConfigSimulado, type QuestaoSimulado, entregarSimulado, montarSimulado } from "@/app/actions/simulados";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Label } from "@/components/ui/primitives";
import { TextoQuestao } from "@/features/questoes/texto-questao";
import type { OpcoesSimulado, SimuladoCompleto } from "@/lib/data/simulados";
import { corrigirSimulado, tempoSugeridoMin } from "@/lib/simulado";
import { QUESTOES_DEMO } from "@/lib/simulado/demo";
import { cn } from "@/lib/utils";
import { ResultadoSimulado } from "./resultado-simulado";

type ConfigCompleta = ConfigSimulado & { limiteMin: number; penalidade: boolean };

interface Andamento {
  versao: 1;
  demo: boolean;
  titulo: string;
  config: ConfigCompleta;
  questoes: QuestaoSimulado[];
  respostas: Record<string, string>;
  revisar: string[];
  riscadas: Record<string, string[]>;
  indice: number;
  /** epoch ms */
  inicio: number;
}

// -----------------------------------------------------------------------------
// Simulado em andamento guardado no aparelho, para sobreviver a um F5 ou a bateria acabando
// -----------------------------------------------------------------------------

const CHAVE = "estudos:simulado-em-andamento";
const ouvintes = new Set<() => void>();

function lerSalvo(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}
function gravar(a: Andamento | null) {
  try {
    if (a) window.localStorage.setItem(CHAVE, JSON.stringify(a));
    else window.localStorage.removeItem(CHAVE);
  } catch {
    /* modo privado ou armazenamento bloqueado: o simulado segue só na memória */
  }
  ouvintes.forEach((f) => f());
}
function assinar(f: () => void) {
  ouvintes.add(f);
  window.addEventListener("storage", f);
  return () => {
    ouvintes.delete(f);
    window.removeEventListener("storage", f);
  };
}
function interpretar(bruto: string | null): Andamento | null {
  if (!bruto) return null;
  try {
    const a = JSON.parse(bruto) as Andamento;
    return a?.versao === 1 && Array.isArray(a.questoes) && a.questoes.length ? a : null;
  } catch {
    return null;
  }
}

// =============================================================================

export function Simulados({ opcoes }: { opcoes: OpcoesSimulado }) {
  const router = useRouter();
  const demo = opcoes.modo === "demo";
  const bruto = useSyncExternalStore(assinar, lerSalvo, () => null);
  const salvo = useMemo(() => interpretar(bruto), [bruto]);
  const [emCurso, setEmCurso] = useState<Andamento | null>(null);
  const [resultadoDemo, setResultadoDemo] = useState<SimuladoCompleto | null>(null);

  const comecar = useCallback((a: Andamento) => {
    gravar(a);
    setResultadoDemo(null);
    setEmCurso(a);
    window.scrollTo({ top: 0 });
  }, []);

  const aoEntregar = useCallback(
    (r: { id: string } | { demo: SimuladoCompleto }) => {
      gravar(null);
      setEmCurso(null);
      if ("id" in r) router.push(`/simulados/${r.id}`);
      else {
        setResultadoDemo(r.demo);
        window.scrollTo({ top: 0 });
      }
    },
    [router],
  );

  if (emCurso) return <Caderno inicial={emCurso} onEntregue={aoEntregar} />;

  return (
    <div className="flex flex-col gap-6">
      {resultadoDemo && (
        <section aria-labelledby="res-demo" className="flex flex-col gap-3">
          <h2 id="res-demo" className="text-lg font-semibold tracking-tight">
            Resultado (demonstração, não fica salvo)
          </h2>
          <ResultadoSimulado s={resultadoDemo} demo />
        </section>
      )}
      {salvo && (
        <div className="flex flex-col gap-3 rounded-xl border border-highlight/60 bg-highlight/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Simulado em andamento:</span> {salvo.titulo}, {Object.keys(salvo.respostas).length} de{" "}
            {salvo.questoes.length} respondidas. O relógio continuou correndo.
          </p>
          <div className="flex gap-2 self-end sm:self-auto">
            <Button variant="outline" size="sm" onClick={() => gravar(null)}>
              Descartar
            </Button>
            <Button variant="highlight" size="sm" onClick={() => setEmCurso(salvo)}>
              <Play /> Continuar
            </Button>
          </div>
        </div>
      )}
      <Configurar opcoes={opcoes} demo={demo} onComecar={comecar} bloqueado={!!salvo} />
    </div>
  );
}

// =============================================================================
// Configuração
// =============================================================================

function Configurar({
  opcoes,
  demo,
  onComecar,
  bloqueado,
}: {
  opcoes: OpcoesSimulado;
  demo: boolean;
  onComecar: (a: Andamento) => void;
  bloqueado: boolean;
}) {
  const [origem, setOrigem] = useState<"prova" | "mix">(opcoes.provas.length ? "prova" : "mix");
  const [prova, setProva] = useState(opcoes.provas[0]?.nome ?? "");
  const [discs, setDiscs] = useState<Set<string>>(new Set());
  const [quantidade, setQuantidade] = useState(30);
  const [naoResolvidas, setNaoResolvidas] = useState(true);
  const [tempo, setTempo] = useState<number | null>(null);
  const [penalidade, setPenalidade] = useState(false);
  const [montando, setMontando] = useState(false);

  const disponiveis = useMemo(() => {
    const lista = discs.size ? opcoes.disciplinas.filter((d) => discs.has(d.id)) : opcoes.disciplinas;
    return lista.reduce((s, d) => s + (naoResolvidas ? d.naoResolvidas : d.total), 0);
  }, [discs, naoResolvidas, opcoes.disciplinas]);

  const qtd = origem === "prova" ? (opcoes.provas.find((p) => p.nome === prova)?.total ?? 0) : Math.min(quantidade, disponiveis);
  const limite = tempo ?? tempoSugeridoMin(qtd);

  if (!opcoes.provas.length && !opcoes.disciplinas.length) {
    return (
      <div className="rounded-xl border bg-card px-5 py-8 text-center">
        <p className="font-medium">Ainda não há questões no seu banco.</p>
        <p className="mt-1 text-sm text-muted-foreground">Importe uma prova anterior da banca e volte aqui para fazê-la no tempo.</p>
        <Button asChild variant="highlight" className="mt-4">
          <Link href="/questoes/importar">Importar prova</Link>
        </Button>
      </div>
    );
  }

  async function comecar() {
    const config: ConfigCompleta = {
      origem,
      ...(origem === "prova" ? { prova } : { disciplinaIds: [...discs], quantidade, apenasNaoResolvidas: naoResolvidas }),
      limiteMin: Math.max(1, Math.min(600, Math.round(limite))),
      penalidade,
    };
    const nomesDiscs = opcoes.disciplinas.filter((d) => discs.has(d.id)).map((d) => d.nome);
    let questoes: QuestaoSimulado[];
    setMontando(true);
    try {
      if (demo) {
        questoes = QUESTOES_DEMO.filter(
          (q) => origem === "prova" || !nomesDiscs.length || nomesDiscs.includes(q.disciplina),
        ).map((q) => ({
          id: q.id,
          numero: q.numero,
          prova: q.prova,
          disciplina: q.disciplina,
          textoApoio: q.textoApoio,
          enunciado: q.enunciado,
          alternativas: q.alternativas,
          dependeDeImagem: q.dependeDeImagem,
        }));
      } else {
        const r = await montarSimulado(config);
        if (!r.ok) {
          toast.error(r.erro);
          return;
        }
        questoes = r.questoes;
      }
    } finally {
      setMontando(false);
    }
    const titulo =
      origem === "prova"
        ? prova
        : `Mistura · ${questoes.length} questões${nomesDiscs.length && nomesDiscs.length <= 2 ? ` de ${nomesDiscs.join(" e ")}` : ""}`;
    onComecar({
      versao: 1,
      demo,
      titulo,
      config,
      questoes,
      respostas: {},
      revisar: [],
      riscadas: {},
      indice: 0,
      inicio: Date.now(),
    });
  }

  return (
    <section aria-labelledby="novo" className="flex flex-col gap-5 rounded-xl border bg-card p-5">
      <h2 id="novo" className="font-semibold tracking-tight">
        Novo simulado
      </h2>

      <div className="flex rounded-lg border p-0.5 text-sm sm:w-fit" role="radiogroup" aria-label="Origem das questões">
        {(
          [
            ["prova", "Prova inteira"],
            ["mix", "Mistura por disciplina"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={origem === id}
            disabled={id === "prova" && !opcoes.provas.length}
            onClick={() => setOrigem(id)}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 whitespace-nowrap disabled:opacity-40",
              origem === id ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {origem === "prova" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-prova">Prova</Label>
          <select
            id="sim-prova"
            value={prova}
            onChange={(e) => setProva(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {opcoes.provas.map((p) => (
              <option key={p.nome} value={p.nome}>
                {p.nome} ({p.total} questões)
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Na ordem da prova. Vale refazer uma prova que você já resolveu solta: no tempo, o resultado é outro.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Disciplinas {discs.size ? "" : <span className="font-normal text-muted-foreground">(nenhuma marcada = todas)</span>}</legend>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {opcoes.disciplinas.map((d) => (
                <label key={d.id} className="flex items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={discs.has(d.id)}
                    onCheckedChange={(v) =>
                      setDiscs((s) => {
                        const n = new Set(s);
                        if (v) n.add(d.id);
                        else n.delete(d.id);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                  <span className="text-xs text-muted-foreground">{naoResolvidas ? d.naoResolvidas : d.total}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sim-qtd">Quantidade</Label>
              <Input
                id="sim-qtd"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
                className="w-24"
              />
            </div>
            <label className="flex items-center gap-2.5 pb-2 text-sm">
              <Checkbox checked={naoResolvidas} onCheckedChange={(v) => setNaoResolvidas(!!v)} />
              Só as que eu nunca resolvi
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {disponiveis} disponíveis com esse filtro{disponiveis < quantidade ? `: o simulado terá ${disponiveis}` : ""}. Sorteadas.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t pt-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-tempo">Tempo (minutos)</Label>
          <Input
            id="sim-tempo"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            value={limite}
            onChange={(e) => setTempo(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
            className="w-24"
          />
        </div>
        <label className="flex items-center gap-2.5 pb-2 text-sm">
          <Checkbox checked={penalidade} onCheckedChange={(v) => setPenalidade(!!v)} />
          Um errado anula um certo <span className="text-muted-foreground">(estilo Cebraspe)</span>
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Sugestão: 3 minutos por questão, o ritmo de uma prova de 60 questões em 4 horas com a redação. Sem gabarito até entregar.
      </p>

      <div>
        <Button variant="highlight" size="lg" onClick={comecar} disabled={montando || bloqueado || qtd === 0}>
          {montando ? <Loader2 className="animate-spin" /> : <Clock />}
          Começar {qtd ? `(${qtd} questões, ${limite} min)` : ""}
        </Button>
        {bloqueado && <p className="mt-2 text-xs text-muted-foreground">Termine ou descarte o simulado em andamento primeiro.</p>}
      </div>
    </section>
  );
}

// =============================================================================
// Caderno cronometrado
// =============================================================================

function relogio(seg: number) {
  const s = Math.max(0, Math.ceil(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(ss).padStart(2, "0")}`;
}

function Caderno({ inicial, onEntregue }: { inicial: Andamento; onEntregue: (r: { id: string } | { demo: SimuladoCompleto }) => void }) {
  const [a, setA] = useState(inicial);
  const [agora, setAgora] = useState(inicial.inicio);
  const [confirmando, setConfirmando] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const tentouAuto = useRef(false);
  const entregarRef = useRef<() => void>(() => {});

  const fim = a.inicio + a.config.limiteMin * 60_000;
  const restante = (fim - agora) / 1000;
  const total = a.questoes.length;
  const q = a.questoes[a.indice];
  const respondidas = Object.keys(a.respostas).length;
  const revisar = useMemo(() => new Set(a.revisar), [a.revisar]);

  // salva a cada mudança
  useEffect(() => {
    gravar(a);
  }, [a]);

  const atualizar = useCallback((f: (x: Andamento) => Andamento) => setA((x) => f(x)), []);
  const irPara = useCallback((i: number) => atualizar((x) => ({ ...x, indice: Math.max(0, Math.min(i, x.questoes.length - 1)) })), [atualizar]);
  const marcar = useCallback(
    (letra: string) =>
      atualizar((x) => {
        const id = x.questoes[x.indice].id;
        const respostas = { ...x.respostas };
        if (respostas[id] === letra) delete respostas[id];
        else respostas[id] = letra;
        return { ...x, respostas };
      }),
    [atualizar],
  );
  const alternarRevisao = useCallback(
    () =>
      atualizar((x) => {
        const id = x.questoes[x.indice].id;
        return { ...x, revisar: x.revisar.includes(id) ? x.revisar.filter((r) => r !== id) : [...x.revisar, id] };
      }),
    [atualizar],
  );
  const riscar = useCallback(
    (letra: string) =>
      atualizar((x) => {
        const id = x.questoes[x.indice].id;
        const atual = x.riscadas[id] ?? [];
        return { ...x, riscadas: { ...x.riscadas, [id]: atual.includes(letra) ? atual.filter((l) => l !== letra) : [...atual, letra] } };
      }),
    [atualizar],
  );

  async function entregar() {
    if (entregando) return;
    setEntregando(true);
    setConfirmando(false);
    const duracaoSeg = Math.min(Math.round((Date.now() - a.inicio) / 1000), a.config.limiteMin * 60);
    try {
      if (a.demo) {
        const gab = new Map(QUESTOES_DEMO.map((x) => [x.id, x]));
        const r = corrigirSimulado(
          a.questoes.map((x) => ({
            questaoId: x.id,
            marcada: a.respostas[x.id] ?? null,
            gabarito: gab.get(x.id)?.gabarito ?? "",
            anulada: false,
            disciplina: x.disciplina,
          })),
          a.config.penalidade,
        );
        onEntregue({
          demo: {
            id: "demo",
            titulo: a.titulo,
            nota: r.nota,
            acertos: r.acertos,
            erros: r.erros,
            emBranco: r.emBranco,
            total: r.total,
            duracaoSeg,
            limiteMin: a.config.limiteMin,
            penalidade: a.config.penalidade,
            criadoEm: new Date().toISOString(),
            porDisciplina: r.porDisciplina,
            itens: r.itens.map((i) => {
              const x = a.questoes.find((y) => y.id === i.questao_id)!;
              return {
                questaoId: i.questao_id,
                marcada: i.marcada,
                acertou: i.acertou,
                disciplina: i.disciplina,
                gabarito: gab.get(i.questao_id)?.gabarito ?? null,
                anulada: false,
                gabaritoNaoOficial: false,
                numero: x.numero,
                prova: x.prova,
                banca: null,
                textoApoio: x.textoApoio,
                enunciado: x.enunciado,
                alternativas: x.alternativas,
                explicacao: null,
              };
            }),
          },
        });
        return;
      }
      const r = await entregarSimulado({
        titulo: a.titulo,
        config: a.config,
        respostas: a.questoes.map((x) => ({ questaoId: x.id, marcada: a.respostas[x.id] ?? null })),
        duracaoSeg,
      });
      if (!r.ok) {
        toast.error(r.erro, { description: "Suas marcações continuam salvas neste aparelho. Tente entregar de novo." });
        return;
      }
      for (const c of r.conquistas) toast.success(`Conquista desbloqueada: ${c.titulo}`, { description: c.descricao });
      onEntregue({ id: r.id });
    } finally {
      setEntregando(false);
    }
  }

  useEffect(() => {
    entregarRef.current = entregar;
  });

  // relógio; ao zerar, entrega sozinho (uma vez)
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if (n >= fim && !tentouAuto.current) {
        tentouAuto.current = true;
        toast.info("Tempo esgotado. Entregando o que você marcou.");
        entregarRef.current();
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [fim]);

  // atalhos: A–E marcam, setas navegam, R marca para revisão
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (confirmando || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const k = e.key.toUpperCase();
      if (q.alternativas.some((x) => x.letra === k)) {
        e.preventDefault();
        marcar(k);
      } else if (e.key === "ArrowRight") irPara(a.indice + 1);
      else if (e.key === "ArrowLeft") irPara(a.indice - 1);
      else if (k === "R") alternarRevisao();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a.indice, alternarRevisao, confirmando, irPara, marcar, q.alternativas]);

  const critico = restante <= Math.min(300, a.config.limiteMin * 6);
  const pctTempo = Math.max(0, Math.min(100, (100 * restante) / (a.config.limiteMin * 60)));
  const emBranco = total - respondidas;
  const marcadaAtual = a.respostas[q.id];
  const riscadasAtual = a.riscadas[q.id] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-16 z-20 flex flex-col gap-2 border-b bg-background/95 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{a.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {respondidas} de {total} respondidas{revisar.size ? ` · ${revisar.size} para revisar` : ""}
            </p>
          </div>
          <div
            role="timer"
            aria-label={`Tempo restante ${relogio(restante)}`}
            className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-lg font-semibold tabular-nums", critico && "bg-destructive/10 text-destructive")}
          >
            <Clock className="size-4" />
            {relogio(restante)}
          </div>
          <Button variant="highlight" onClick={() => setConfirmando(true)} disabled={entregando}>
            {entregando && <Loader2 className="animate-spin" />}
            Entregar
          </Button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full transition-[width] duration-500", critico ? "bg-destructive" : "bg-foreground/60")} style={{ width: `${pctTempo}%` }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="flex min-w-0 flex-col gap-4 text-[15px] leading-relaxed" aria-label={`Questão ${a.indice + 1} de ${total}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              Questão {a.indice + 1} de {total}
            </span>
            {q.disciplina && <span>{q.disciplina}</span>}
            {a.config.origem === "mix" && q.prova && <span className="truncate">{q.prova}</span>}
          </div>
          {q.dependeDeImagem && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <ImageOff className="size-4 shrink-0" /> Esta questão usa uma figura da prova que não veio na importação.
            </p>
          )}
          {q.textoApoio && <TextoQuestao texto={q.textoApoio} className="rounded-lg bg-muted/50 px-4 py-3 text-sm" />}
          <TextoQuestao texto={q.enunciado} />
          <ol className="flex flex-col gap-2">
            {q.alternativas.map((alt) => {
              const escolhida = marcadaAtual === alt.letra;
              const riscada = riscadasAtual.includes(alt.letra);
              return (
                <li key={alt.letra} className="group/alt flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => marcar(alt.letra)}
                    aria-pressed={escolhida}
                    className={cn(
                      "flex flex-1 items-start gap-3 rounded-lg border px-3 py-2.5 text-left leading-snug transition-colors outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      escolhida && "border-foreground bg-accent",
                      riscada && !escolhida && "text-muted-foreground line-through decoration-1",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                        escolhida && "border-foreground bg-foreground text-background",
                      )}
                    >
                      {alt.letra}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5 whitespace-pre-line">{alt.texto}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={riscada ? `Desfazer risco da alternativa ${alt.letra}` : `Riscar alternativa ${alt.letra}`}
                    title={riscada ? "Desfazer risco" : "Riscar"}
                    onClick={() => riscar(alt.letra)}
                    className={cn(
                      "grid w-9 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity outline-none group-hover/alt:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 max-md:opacity-60 pointer-coarse:opacity-60",
                      riscada && "opacity-100",
                    )}
                  >
                    <Scissors className="size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => irPara(a.indice - 1)} disabled={a.indice === 0}>
              <ArrowLeft /> Anterior
            </Button>
            <Button variant={revisar.has(q.id) ? "secondary" : "ghost"} onClick={alternarRevisao} aria-pressed={revisar.has(q.id)}>
              <Bookmark className={cn(revisar.has(q.id) && "fill-current")} />
              {revisar.has(q.id) ? "Marcada para revisar" : "Revisar depois"}
            </Button>
            {a.indice < total - 1 ? (
              <Button variant={marcadaAtual ? "highlight" : "outline"} onClick={() => irPara(a.indice + 1)} className="ml-auto">
                Próxima <ArrowRight />
              </Button>
            ) : (
              <Button variant="highlight" onClick={() => setConfirmando(true)} className="ml-auto">
                Entregar
              </Button>
            )}
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">Atalhos: A a E marcam (de novo desmarca), setas trocam de questão, R marca para revisar.</p>
        </article>

        <nav aria-label="Cartão-resposta" className="flex flex-col gap-3 lg:sticky lg:top-40 lg:self-start">
          <p className="text-sm font-medium">Cartão-resposta</p>
          <ol className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-5">
            {a.questoes.map((x, i) => {
              const r = a.respostas[x.id];
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => irPara(i)}
                    aria-current={i === a.indice ? "step" : undefined}
                    aria-label={`Questão ${i + 1}${r ? `, marcada ${r}` : ", em branco"}${revisar.has(x.id) ? ", para revisar" : ""}`}
                    className={cn(
                      "relative grid h-9 w-full place-items-center rounded-md border text-xs tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      r && "border-foreground/40 bg-foreground/10 font-semibold",
                      i === a.indice && "ring-2 ring-foreground",
                    )}
                  >
                    <span className="leading-none">{i + 1}</span>
                    {r && <span className="text-[10px] leading-none text-muted-foreground">{r}</span>}
                    {revisar.has(x.id) && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-highlight ring-2 ring-background" />}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{emBranco} em branco</span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-highlight" /> revisar
            </span>
          </p>
        </nav>
      </div>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent titulo="Entregar o simulado?" descricao={`Restam ${relogio(restante)}.`} className="max-w-md">
          <div className="flex flex-col gap-4 px-5 py-4 text-sm">
            <ul className="flex flex-col gap-1">
              <li>
                <span className="font-semibold">{respondidas}</span> respondidas
              </li>
              <li className={cn(emBranco && "text-destructive")}>
                <span className="font-semibold">{emBranco}</span> em branco
                {emBranco > 0 && !a.config.penalidade && " (sem penalidade, chutar não custa nada)"}
              </li>
              {revisar.size > 0 && (
                <li>
                  <span className="font-semibold">{revisar.size}</span> {revisar.size === 1 ? "marcada" : "marcadas"} para revisar
                </li>
              )}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmando(false)}>
                Voltar à prova
              </Button>
              <Button variant="highlight" onClick={entregar} disabled={entregando}>
                {entregando && <Loader2 className="animate-spin" />}
                Entregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
