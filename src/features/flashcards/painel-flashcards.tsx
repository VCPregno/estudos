"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { avaliarFlashcard } from "@/app/actions/flashcards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { TextoQuestao } from "@/features/questoes/texto-questao";
import type { DadosFlashcards, Flashcard } from "@/lib/data/flashcards";
import { type Nota, avaliar, previsoes } from "@/lib/flashcards/agendador";
import { cn } from "@/lib/utils";
import { type CardEditavel, EditorCard, GerarCards } from "./editor-card";

const dataSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const JANELA_APRENDIZADO = 20 * 60_000;

type Situacao = "novo" | "aprender" | "revisar" | "depois";

function situacao(c: Flashcard, agora: Date): Situacao {
  if (c.estado === "novo") return "novo";
  const venc = new Date(c.vencimento);
  if (c.estado === "revisao") return dataSP(venc) <= dataSP(agora) ? "revisar" : "depois";
  return venc.getTime() <= agora.getTime() + JANELA_APRENDIZADO ? "aprender" : "depois";
}

function montarFila(cards: Flashcard[], agora: Date, limiteNovos: number): string[] {
  const s = (c: Flashcard) => situacao(c, agora);
  const porVenc = (a: Flashcard, b: Flashcard) => a.vencimento.localeCompare(b.vencimento);
  const aprender = cards.filter((c) => s(c) === "aprender").sort(porVenc);
  const revisar = cards.filter((c) => s(c) === "revisar").sort(porVenc);
  const novos = cards.filter((c) => s(c) === "novo").slice(0, limiteNovos);
  // intercala novos no meio das revisões, para não deixar todos para o fim
  const mistura: Flashcard[] = [];
  const passo = novos.length ? Math.max(1, Math.floor(revisar.length / novos.length)) : 0;
  let n = 0;
  revisar.forEach((c, i) => {
    mistura.push(c);
    if (passo && (i + 1) % passo === 0 && n < novos.length) mistura.push(novos[n++]);
  });
  while (n < novos.length) mistura.push(novos[n++]);
  return [...aprender, ...mistura].map((c) => c.id);
}

function contar(cards: Flashcard[], agora: Date, limiteNovos: number) {
  let novos = 0;
  let aprender = 0;
  let revisar = 0;
  for (const c of cards) {
    const s = situacao(c, agora);
    if (s === "novo") novos++;
    else if (s === "aprender") aprender++;
    else if (s === "revisar") revisar++;
  }
  return { novos: Math.min(novos, limiteNovos), novosTotal: novos, aprender, revisar, total: Math.min(novos, limiteNovos) + aprender + revisar };
}

function rotuloEstado(c: Flashcard, agora: Date) {
  if (c.estado === "novo") return "novo";
  if (c.estado !== "revisao") return "aprendendo";
  const dias = Math.round((new Date(c.vencimento).getTime() - agora.getTime()) / 86_400_000);
  return dias <= 0 ? "para hoje" : `em ${dias} d`;
}

// =============================================================================

export function PainelFlashcards({ dados }: { dados: DadosFlashcards }) {
  const [cards, setCards] = useState(dados.cards);
  const [estudo, setEstudo] = useState<{ fila: string[]; total: number; feitos: number; titulo: string } | null>(null);
  const [agora, setAgora] = useState(() => new Date(dados.agora));
  const [editor, setEditor] = useState<CardEditavel | null>(null);
  const [gerar, setGerar] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroDisc, setFiltroDisc] = useState("");
  const demo = dados.modo === "demo";

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nomeDisc = useMemo(() => new Map(dados.disciplinas.map((d) => [d.id, d])), [dados.disciplinas]);

  const baralhos = useMemo(() => {
    const grupos = new Map<string, Flashcard[]>();
    for (const c of cards) {
      const k = c.disciplinaId ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    return [...grupos]
      .map(([id, cs]) => ({ id, nome: nomeDisc.get(id)?.nome ?? "Sem disciplina", cor: nomeDisc.get(id)?.cor ?? 8, cards: cs, ...contar(cs, agora, dados.novosPorDia) }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [cards, agora, nomeDisc, dados.novosPorDia]);

  const geral = contar(cards, agora, dados.novosPorDia);

  function estudar(lista: Flashcard[], titulo: string) {
    const fila = montarFila(lista, new Date(), dados.novosPorDia);
    if (!fila.length) {
      toast("Nada para revisar agora.");
      return;
    }
    setEstudo({ fila, total: fila.length, feitos: 0, titulo });
  }

  const visiveis = cards.filter(
    (c) =>
      (!filtroDisc || (c.disciplinaId ?? "") === filtroDisc) &&
      (!busca.trim() || `${c.frente} ${c.verso}`.toLowerCase().includes(busca.trim().toLowerCase())),
  );

  if (estudo) {
    return (
      <Estudo
        estudo={estudo}
        cards={cards}
        demo={demo}
        nomeDisc={(id) => (id ? nomeDisc.get(id)?.nome : undefined)}
        onAtualizar={(c) => setCards((cs) => cs.map((x) => (x.id === c.id ? c : x)))}
        onFila={(fila, feitos) => setEstudo((e) => (e ? { ...e, fila, feitos } : e))}
        onEditar={(c) => setEditor({ id: c.id, frente: c.frente, verso: c.verso, disciplinaId: c.disciplinaId, topicoId: c.topicoId })}
        onSair={() => {
          setEstudo(null);
          setAgora(new Date());
        }}
        editor={
          editor && (
            <EditorCard
              key={editor.id ?? "novo"}
              aberto
              onAberto={(v) => !v && setEditor(null)}
              inicial={editor}
              disciplinas={dados.disciplinas}
              demo={demo}
              onSalvo={(c) => {
                if (!editor.id) return;
                if (c) setCards((cs) => cs.map((x) => (x.id === editor.id ? { ...x, ...c } : x)));
                else {
                  setCards((cs) => cs.filter((x) => x.id !== editor.id));
                  setEstudo((e) => (e ? { ...e, fila: e.fila.filter((id) => id !== editor.id) } : e));
                }
              }}
            />
          )
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      {demo && (
        <p className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">Modo demonstração: cards de exemplo, nada é gravado.</p>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Flashcards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length} {cards.length === 1 ? "card" : "cards"} · {geral.revisar + geral.aprender} para revisar hoje
            {geral.novosTotal > 0 && ` · ${geral.novosTotal} novos`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setGerar(true)}>
            <Sparkles />
            Gerar com IA
          </Button>
          <Button variant="outline" onClick={() => setEditor({ frente: "", verso: "", disciplinaId: null, topicoId: null })}>
            <Plus />
            Novo card
          </Button>
        </div>
      </header>

      {cards.length === 0 ? (
        <section className="rounded-xl border bg-card p-6 md:p-8">
          <h2 className="text-lg font-semibold">Nenhum card ainda</h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Três jeitos de começar: cole um trecho de lei ou um resumo em “Gerar com IA”; crie um card à mão; ou, em Questões, use “Criar card”
            depois de errar uma questão, para fixar o ponto exato do erro.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="hoje" className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between md:p-6">
            <div>
              <h2 id="hoje" className="text-lg font-semibold tracking-tight">
                {geral.total > 0 ? `${geral.total} ${geral.total === 1 ? "card" : "cards"} para hoje` : "Tudo em dia"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {geral.total > 0
                  ? [
                      geral.revisar && `${geral.revisar} de revisão`,
                      geral.aprender && `${geral.aprender} aprendendo`,
                      geral.novos && `${geral.novos} novos`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Os próximos cards aparecem no dia em que vencerem."}
              </p>
            </div>
            <Button variant="highlight" size="lg" disabled={geral.total === 0} onClick={() => estudar(cards, "Todos os baralhos")}>
              Estudar agora
            </Button>
          </section>

          <section aria-labelledby="baralhos" className="flex flex-col gap-2">
            <h2 id="baralhos" className="font-semibold tracking-tight">
              Por disciplina
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {baralhos.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--disc-${b.cor})` }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.cards.length} {b.cards.length === 1 ? "card" : "cards"}
                      {b.revisar + b.aprender > 0 && ` · ${b.revisar + b.aprender} para revisar`}
                      {b.novos > 0 && ` · ${b.novos} novos`}
                    </p>
                  </div>
                  <Button size="sm" variant={b.total ? "secondary" : "ghost"} disabled={!b.total} onClick={() => estudar(b.cards, b.nome)}>
                    Estudar
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="todos" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="todos" className="font-semibold tracking-tight">
                Todos os cards
              </h2>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Buscar cards" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8 sm:w-56" />
                </div>
                <select
                  aria-label="Filtrar por disciplina"
                  value={filtroDisc}
                  onChange={(e) => setFiltroDisc(e.target.value)}
                  className="h-9 rounded-md border bg-card px-2.5 text-sm"
                >
                  <option value="">Todas as disciplinas</option>
                  {baralhos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {visiveis.slice(0, 200).map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{c.frente}</p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">{c.verso}</p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{rotuloEstado(c, agora)}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Editar card"
                    onClick={() => setEditor({ id: c.id, frente: c.frente, verso: c.verso, disciplinaId: c.disciplinaId, topicoId: c.topicoId })}
                  >
                    <Pencil />
                  </Button>
                </li>
              ))}
              {visiveis.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Nenhum card encontrado.</li>}
            </ul>
            {visiveis.length > 200 && <p className="text-xs text-muted-foreground">Mostrando 200 de {visiveis.length}. Use a busca para achar os outros.</p>}
          </section>
        </>
      )}

      {editor && (
        <EditorCard
          key={editor.id ?? "novo"}
          aberto
          onAberto={(v) => !v && setEditor(null)}
          inicial={editor}
          disciplinas={dados.disciplinas}
          demo={demo}
          onSalvo={(c) => {
            if (editor.id) {
              if (c) setCards((cs) => cs.map((x) => (x.id === editor.id ? { ...x, ...c } : x)));
              else setCards((cs) => cs.filter((x) => x.id !== editor.id));
            }
          }}
        />
      )}
      <GerarCards aberto={gerar} onAberto={setGerar} disciplinas={dados.disciplinas} demo={demo} />
    </div>
  );
}

// =============================================================================
// Sessão de estudo
// =============================================================================

const BOTOES: { nota: Nota; rotulo: string; classe: string }[] = [
  { nota: 1, rotulo: "Errei", classe: "border-destructive/40 text-destructive hover:bg-destructive/10" },
  { nota: 2, rotulo: "Difícil", classe: "hover:bg-accent" },
  { nota: 3, rotulo: "Bom", classe: "border-certo/40 text-certo hover:bg-certo/10" },
  { nota: 4, rotulo: "Fácil", classe: "hover:bg-accent" },
];

function Estudo({
  estudo,
  cards,
  demo,
  nomeDisc,
  onAtualizar,
  onFila,
  onEditar,
  onSair,
  editor,
}: {
  estudo: { fila: string[]; total: number; feitos: number; titulo: string };
  cards: Flashcard[];
  demo: boolean;
  nomeDisc: (id: string | null) => string | undefined;
  onAtualizar: (c: Flashcard) => void;
  onFila: (fila: string[], feitos: number) => void;
  onEditar: (c: Flashcard) => void;
  onSair: () => void;
  editor: React.ReactNode;
}) {
  const [virado, setVirado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const card = cards.find((c) => c.id === estudo.fila[0]);
  const prev = useMemo(() => (card ? previsoes(card) : null), [card]);

  const responder = useCallback(
    async (nota: Nota) => {
      if (!card || enviando) return;
      setEnviando(true);
      let atualizado: Flashcard;
      if (demo) {
        const r = avaliar(card, nota);
        atualizado = { ...card, ...r, vencimento: r.vencimento.toISOString() };
      } else {
        const r = await avaliarFlashcard(card.id, nota);
        if (!r.ok) {
          setEnviando(false);
          toast.error(r.erro);
          return;
        }
        atualizado = { ...card, ...r.card };
        for (const c of r.conquistas) toast.success(`Conquista desbloqueada: ${c.titulo}`, { description: c.descricao });
      }
      onAtualizar(atualizado);
      const resto = estudo.fila.slice(1);
      const voltaLogo = atualizado.estado !== "revisao" && new Date(atualizado.vencimento).getTime() - Date.now() <= JANELA_APRENDIZADO;
      const fila = voltaLogo ? [...resto.slice(0, 3), card.id, ...resto.slice(3)] : resto;
      onFila(fila, estudo.feitos + (voltaLogo ? 0 : 1));
      setVirado(false);
      setEnviando(false);
    },
    [card, enviando, demo, estudo, onAtualizar, onFila],
  );

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, select, [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!virado && (e.key === " " || e.key === "Enter")) {
        setVirado(true);
        e.preventDefault();
      } else if (virado && ["1", "2", "3", "4"].includes(e.key)) {
        responder(Number(e.key) as Nota);
        e.preventDefault();
      } else if (virado && (e.key === " " || e.key === "Enter")) {
        responder(3);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [virado, responder]);

  const pct = Math.round((100 * estudo.feitos) / Math.max(1, estudo.total));

  return (
    <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onSair}>
          <ArrowLeft />
          Sair
        </Button>
        <span className="truncate text-sm text-muted-foreground">
          {estudo.titulo} · {estudo.fila.length} {estudo.fila.length === 1 ? "restante" : "restantes"}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-highlight transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      {!card ? (
        <section className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">Sessão concluída</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {estudo.feitos} {estudo.feitos === 1 ? "card revisado" : "cards revisados"}. Os próximos voltam no dia certo.
          </p>
          <Button variant="highlight" onClick={onSair}>
            Voltar aos baralhos
          </Button>
        </section>
      ) : (
        <article className="flex min-h-[340px] flex-col rounded-xl border bg-card">
          <header className="flex items-center justify-between gap-3 border-b px-5 py-2.5 text-xs text-muted-foreground">
            <span className="truncate">{nomeDisc(card.disciplinaId) ?? "Sem disciplina"}</span>
            <span className="flex items-center gap-2">
              {card.estado === "novo" ? "novo" : card.estado === "revisao" ? "revisão" : "aprendendo"}
              <button type="button" onClick={() => onEditar(card)} className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Editar este card">
                <Pencil className="size-3.5" />
              </button>
            </span>
          </header>
          <div className="flex flex-1 flex-col gap-5 px-5 py-6 md:px-8">
            <TextoQuestao texto={card.frente} className="text-lg leading-relaxed font-medium" />
            {virado && (
              <>
                <hr />
                <TextoQuestao texto={card.verso} className="text-[15px] leading-relaxed" />
              </>
            )}
          </div>
          <footer className="border-t p-3">
            {!virado ? (
              <Button className="w-full" size="lg" variant="secondary" onClick={() => setVirado(true)}>
                Mostrar resposta
              </Button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {BOTOES.map((b) => (
                  <button
                    key={b.nota}
                    type="button"
                    disabled={enviando}
                    onClick={() => responder(b.nota)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-lg border py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
                      b.classe,
                    )}
                  >
                    {b.rotulo}
                    <span className="text-xs font-normal text-muted-foreground">{prev?.[b.nota]}</span>
                  </button>
                ))}
              </div>
            )}
          </footer>
        </article>
      )}
      <p className="hidden text-center text-xs text-muted-foreground md:block">Espaço mostra a resposta. Depois, 1 a 4 avaliam.</p>
      {editor}
    </div>
  );
}
