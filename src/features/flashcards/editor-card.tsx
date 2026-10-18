"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { type DadosCardNovo, apagarFlashcard, criarFlashcards, editarFlashcard } from "@/app/actions/flashcards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import type { OpcaoDisciplina } from "@/lib/data/flashcards";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Disciplina + tópico num select só
// -----------------------------------------------------------------------------

export function SeletorClassificacao({
  id,
  disciplinas,
  disciplinaId,
  topicoId,
  onChange,
  className,
}: {
  id?: string;
  disciplinas: OpcaoDisciplina[];
  disciplinaId: string | null;
  topicoId: string | null;
  onChange: (v: { disciplinaId: string | null; topicoId: string | null }) => void;
  className?: string;
}) {
  const valor = topicoId ? `t:${topicoId}` : disciplinaId ? `d:${disciplinaId}` : "";
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => {
        const [tipo, x] = e.target.value.split(":");
        if (tipo === "t") {
          const d = disciplinas.find((d) => d.topicos.some((t) => t.id === x));
          onChange({ disciplinaId: d?.id ?? null, topicoId: x });
        } else onChange({ disciplinaId: tipo === "d" ? x : null, topicoId: null });
      }}
      className={cn("h-9 w-full min-w-0 rounded-md border bg-card px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", className)}
    >
      <option value="">Sem disciplina</option>
      {disciplinas.map((d) => (
        <optgroup key={d.id} label={d.nome}>
          <option value={`d:${d.id}`}>{d.nome} (sem tópico)</option>
          {d.topicos.map((t) => (
            <option key={t.id} value={`t:${t.id}`}>
              {" "}
              {t.titulo}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// -----------------------------------------------------------------------------
// Criar / editar um card
// -----------------------------------------------------------------------------

export interface CardEditavel {
  id?: string;
  frente: string;
  verso: string;
  disciplinaId: string | null;
  topicoId: string | null;
}

export function EditorCard({
  aberto,
  onAberto,
  inicial,
  disciplinas,
  demo,
  onSalvo,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  inicial: CardEditavel;
  disciplinas: OpcaoDisciplina[];
  demo: boolean;
  onSalvo: (c: CardEditavel | null) => void;
}) {
  const [card, setCard] = useState(inicial);
  const [salvando, iniciar] = useTransition();
  const editando = !!inicial.id;

  function salvar() {
    iniciar(async () => {
      const dados: DadosCardNovo = { frente: card.frente, verso: card.verso, disciplinaId: card.disciplinaId, topicoId: card.topicoId };
      const r = editando ? await editarFlashcard(inicial.id!, dados) : await criarFlashcards([dados]);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(editando ? "Card atualizado." : demo ? "Card criado (demonstração: não é gravado)." : "Card criado.");
      onSalvo(card);
      if (!editando) setCard({ ...inicial, frente: "", verso: "" });
      else onAberto(false);
    });
  }

  function apagar() {
    if (!inicial.id) return;
    iniciar(async () => {
      const r = await apagarFlashcard(inicial.id!);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success("Card apagado.");
      onSalvo(null);
      onAberto(false);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent titulo={editando ? "Editar card" : "Novo card"} descricao={editando ? undefined : "Uma pergunta objetiva na frente, a resposta curta no verso."}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="frente">Frente</Label>
            <Textarea id="frente" rows={3} value={card.frente} onChange={(e) => setCard({ ...card, frente: e.target.value })} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verso">Verso</Label>
            <Textarea id="verso" rows={4} value={card.verso} onChange={(e) => setCard({ ...card, verso: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="classif">Disciplina e tópico</Label>
            <SeletorClassificacao
              id="classif"
              disciplinas={disciplinas}
              disciplinaId={card.disciplinaId}
              topicoId={card.topicoId}
              onChange={(v) => setCard({ ...card, ...v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="highlight" disabled={salvando || !card.frente.trim() || !card.verso.trim()} onClick={salvar}>
              {salvando && <Loader2 className="animate-spin" />}
              {editando ? "Salvar" : "Criar card"}
            </Button>
            {editando && (
              <Button variant="ghost" className="text-destructive" disabled={salvando} onClick={apagar}>
                <Trash2 />
                Apagar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Gerar cards com IA a partir de um texto
// -----------------------------------------------------------------------------

interface Proposto {
  frente: string;
  verso: string;
  marcado: boolean;
}

export function GerarCards({
  aberto,
  onAberto,
  disciplinas,
  demo,
  textoInicial = "",
  contexto,
  classificacao,
  questaoId,
  daQuestao,
  quantidadeInicial = 8,
  onCriados,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  disciplinas: OpcaoDisciplina[];
  demo: boolean;
  textoInicial?: string;
  contexto?: string;
  classificacao?: { disciplinaId: string | null; topicoId: string | null };
  questaoId?: string;
  /** Card a partir de uma questão: esconde o campo de material */
  daQuestao?: boolean;
  quantidadeInicial?: number;
  onCriados?: (n: number) => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [quantidade, setQuantidade] = useState(quantidadeInicial);
  const [classif, setClassif] = useState(classificacao ?? { disciplinaId: null, topicoId: null });
  const [propostos, setPropostos] = useState<Proposto[] | null>(null);
  const [gerando, setGerando] = useState(false);
  const [salvando, iniciar] = useTransition();
  const doQuestao = daQuestao ?? !!questaoId;

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch("/api/flashcards/gerar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto, quantidade, contexto }),
      });
      const j = await r.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
      if (!r.ok) throw new Error(j.erro ?? "Não deu para gerar os cards.");
      if (!j.cards.length) throw new Error("A IA não encontrou nada bom para virar card nesse trecho.");
      setPropostos(j.cards.map((c: { frente: string; verso: string }) => ({ ...c, marcado: true })));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  function salvar() {
    const escolhidos = (propostos ?? []).filter((p) => p.marcado && p.frente.trim() && p.verso.trim());
    if (!escolhidos.length) return;
    iniciar(async () => {
      const r = await criarFlashcards(
        escolhidos.map((p) => ({ frente: p.frente, verso: p.verso, ...classif, questaoId: questaoId ?? null })),
      );
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(`${r.criados} ${r.criados === 1 ? "card criado" : "cards criados"}${demo ? " (demonstração)" : ""}.`);
      onCriados?.(r.criados);
      setPropostos(null);
      if (!doQuestao) setTexto("");
      onAberto(false);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent
        titulo={doQuestao ? "Card da questão" : "Gerar cards com IA"}
        descricao={doQuestao ? "A IA propõe um card com o ponto que causou o erro. Ajuste antes de salvar." : "Cole um trecho de lei, resumo ou anotação. A IA propõe os cards e você escolhe quais salvar."}
      >
        {!propostos ? (
          <div className="flex flex-col gap-4">
            {!doQuestao && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="texto-ia">Material</Label>
                <Textarea
                  id="texto-ia"
                  rows={9}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: Art. 59. Salvo disposição legal específica, é de dez dias o prazo para interposição de recurso administrativo…"
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="classif-ia">Disciplina e tópico</Label>
                <SeletorClassificacao id="classif-ia" disciplinas={disciplinas} {...classif} onChange={setClassif} />
              </div>
              {!doQuestao && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qtd-ia">Até quantos</Label>
                  <Input id="qtd-ia" type="number" min={1} max={20} value={quantidade} onChange={(e) => setQuantidade(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
                </div>
              )}
            </div>
            <div>
              <Button variant="highlight" disabled={gerando || (!doQuestao && texto.trim().length < 20)} onClick={gerar}>
                {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {gerando ? "Gerando…" : doQuestao ? "Propor card" : "Gerar cards"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {propostos.map((p, i) => (
                <li key={i} className={cn("flex gap-3 rounded-lg border p-3", !p.marcado && "opacity-50")}>
                  <input
                    type="checkbox"
                    aria-label={`Salvar card ${i + 1}`}
                    checked={p.marcado}
                    onChange={() => setPropostos((ps) => ps!.map((x, j) => (j === i ? { ...x, marcado: !x.marcado } : x)))}
                    className="mt-1 size-4 shrink-0 accent-[var(--foreground)]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Textarea
                      aria-label={`Frente do card ${i + 1}`}
                      rows={2}
                      value={p.frente}
                      onChange={(e) => setPropostos((ps) => ps!.map((x, j) => (j === i ? { ...x, frente: e.target.value } : x)))}
                      className="font-medium"
                    />
                    <Textarea
                      aria-label={`Verso do card ${i + 1}`}
                      rows={2}
                      value={p.verso}
                      onChange={(e) => setPropostos((ps) => ps!.map((x, j) => (j === i ? { ...x, verso: e.target.value } : x)))}
                      className="text-muted-foreground"
                    />
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="highlight" disabled={salvando || !propostos.some((p) => p.marcado)} onClick={salvar}>
                {salvando && <Loader2 className="animate-spin" />}
                Salvar {propostos.filter((p) => p.marcado).length}
              </Button>
              <Button variant="ghost" disabled={salvando} onClick={() => setPropostos(null)}>
                Voltar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
