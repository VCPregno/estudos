"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, GalleryVerticalEnd, GraduationCap, Loader2, MessageSquareText, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apagarLei, apagarMarcacao, editarMarcacao, marcar } from "@/app/actions/leis";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/primitives";
import { GerarCards } from "@/features/flashcards/editor-card";
import { TextoSimples } from "@/features/questoes/texto-questao";
import type { OpcaoDisciplina } from "@/lib/data/flashcards";
import type { LeiCompleta } from "@/lib/data/leis";
import { type Marcacao, type Paragrafo, buscar, paragrafos, trechos } from "@/lib/leis";
import { cn, formatarData } from "@/lib/utils";

const CORES = [
  { id: "amarelo", rotulo: "Amarelo", classe: "bg-yellow-200/80 dark:bg-yellow-400/30", bolinha: "bg-yellow-300" },
  { id: "verde", rotulo: "Verde", classe: "bg-green-200/80 dark:bg-green-400/25", bolinha: "bg-green-400" },
  { id: "azul", rotulo: "Azul", classe: "bg-sky-200/80 dark:bg-sky-400/25", bolinha: "bg-sky-400" },
  { id: "rosa", rotulo: "Rosa", classe: "bg-pink-200/80 dark:bg-pink-400/25", bolinha: "bg-pink-400" },
] as const;
type Cor = (typeof CORES)[number]["id"];
const classeCor = (c: string) => CORES.find((x) => x.id === c)?.classe ?? CORES[0].classe;

// -----------------------------------------------------------------------------
// Parágrafo (memo: a CF tem milhares)
// -----------------------------------------------------------------------------

const Linha = memo(function Linha({
  p,
  marcas,
  buscas,
  atual,
}: {
  p: Paragrafo;
  marcas: Marcacao[];
  buscas: [number, number][];
  atual: [number, number] | null;
}) {
  if (!p.texto) return <p data-ini={p.inicio} className="h-3" aria-hidden />;
  const ts = trechos(p, marcas, buscas);
  return (
    <p id={`p-${p.indice}`} data-ini={p.inicio} className={cn("scroll-mt-28", p.artigo && "mt-3")}>
      {ts.map((t) =>
        t.marcacao || t.busca ? (
          <mark
            key={t.inicio}
            data-marca={t.marcacao?.id}
            className={cn(
              "rounded-[2px] text-inherit",
              t.marcacao ? classeCor(t.marcacao.cor) : "bg-transparent",
              t.marcacao && "cursor-pointer",
              t.marcacao?.nota && "underline decoration-foreground/40 decoration-dotted underline-offset-4",
              t.busca && "outline outline-2 outline-highlight/70",
              t.busca && atual && t.inicio >= atual[0] && t.inicio < atual[1] && "bg-highlight/70 outline-highlight",
            )}
          >
            {t.texto}
          </mark>
        ) : (
          <span key={t.inicio}>{t.texto}</span>
        ),
      )}
    </p>
  );
});

function offsetGlobal(no: Node, offset: number): number | null {
  const el = (no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement)?.closest<HTMLElement>("[data-ini]");
  if (!el) return null;
  const r = document.createRange();
  r.setStart(el, 0);
  r.setEnd(no, offset);
  return Number(el.dataset.ini) + r.toString().length;
}

// -----------------------------------------------------------------------------

type Barra =
  | { tipo: "selecao"; inicio: number; fim: number; x: number; y: number; base: number }
  | { tipo: "marca"; marca: Marcacao; x: number; y: number; base: number };

/** No toque (iPad), o menu do sistema (Copiar, Pesquisar…) aparece acima da seleção; a nossa barra vai embaixo. */
const toque = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export function LeitorLei({ lei, disciplinas }: { lei: LeiCompleta; disciplinas: OpcaoDisciplina[] }) {
  const router = useRouter();
  const [marcas, setMarcas] = useState<Marcacao[]>(lei.marcacoesLista);
  const [barra, setBarra] = useState<Barra | null>(null);
  const [termo, setTermo] = useState("");
  const [termoBusca, setTermoBusca] = useState("");
  const [hit, setHit] = useState(0);
  const [nota, setNota] = useState<{ marca: Marcacao; texto: string } | null>(null);
  const [explicacao, setExplicacao] = useState<{ trecho: string; texto: string | null } | null>(null);
  const [cards, setCards] = useState<string | null>(null);
  const corpo = useRef<HTMLDivElement>(null);

  const ps = useMemo(() => paragrafos(lei.texto), [lei.texto]);
  const artigos = useMemo(() => ps.filter((p) => p.artigo).length, [ps]);

  // debounce da busca
  useEffect(() => {
    const id = setTimeout(() => {
      setTermoBusca(termo);
      setHit(0);
    }, 250);
    return () => clearTimeout(id);
  }, [termo]);
  const hits = useMemo(() => buscar(lei.texto, termoBusca), [lei.texto, termoBusca]);

  // índice: parágrafo → marcas / buscas
  const porParagrafo = useMemo(() => {
    const idx = (pos: number) => {
      let lo = 0;
      let hi = ps.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ps[mid].inicio <= pos) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const m = new Map<number, Marcacao[]>();
    for (const x of marcas) for (let i = idx(x.inicio); i <= idx(Math.max(x.inicio, x.fim - 1)); i++) m.set(i, [...(m.get(i) ?? []), x]);
    const b = new Map<number, [number, number][]>();
    for (const h of hits) {
      const i = idx(h[0]);
      b.set(i, [...(b.get(i) ?? []), h]);
    }
    return { m, b, idx };
  }, [marcas, hits, ps]);

  const atual = hits[hit] ?? null;
  useEffect(() => {
    if (!atual) return;
    document.getElementById(`p-${porParagrafo.idx(atual[0])}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [atual, porParagrafo]);

  // seleção → barra de ferramentas
  const lerSelecao = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !corpo.current) {
      // Tocou fora: a barra de uma seleção que já não existe some (a de um grifo clicado fica).
      setBarra((b) => (b?.tipo === "selecao" ? null : b));
      return;
    }
    const r = sel.getRangeAt(0);
    if (!corpo.current.contains(r.commonAncestorContainer)) return;
    const a = offsetGlobal(r.startContainer, r.startOffset);
    const b = offsetGlobal(r.endContainer, r.endOffset);
    if (a === null || b === null || b - a < 2) return;
    const rect = r.getBoundingClientRect();
    setBarra({ tipo: "selecao", inicio: a, fim: b, x: rect.left + rect.width / 2, y: rect.top, base: rect.bottom });
  }, []);
  const aoSoltar = useCallback(() => setTimeout(lerSelecao, 10), [lerSelecao]);

  // No iPad, arrastar as alças da seleção não gera eventos de toque na página: acompanha a seleção em si.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const aoMudar = () => {
      clearTimeout(t);
      t = setTimeout(lerSelecao, 350);
    };
    document.addEventListener("selectionchange", aoMudar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", aoMudar);
    };
  }, [lerSelecao]);

  function clicarCorpo(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-marca]");
    const sel = window.getSelection();
    if (el && (!sel || sel.isCollapsed)) {
      const m = marcas.find((x) => x.id === el.dataset.marca);
      if (m) {
        const rect = el.getBoundingClientRect();
        setBarra({ tipo: "marca", marca: m, x: rect.left + rect.width / 2, y: rect.top, base: rect.bottom });
      }
    }
  }

  useEffect(() => {
    if (!barra) return;
    const fechar = () => setBarra(null);
    window.addEventListener("scroll", fechar, { passive: true });
    return () => window.removeEventListener("scroll", fechar);
  }, [barra]);

  async function aplicarCor(cor: Cor) {
    if (!barra) return;
    if (barra.tipo === "marca") {
      const m = barra.marca;
      setMarcas((ms) => ms.map((x) => (x.id === m.id ? { ...x, cor } : x)));
      setBarra(null);
      const r = await editarMarcacao(m.id, { cor });
      if (!r.ok) toast.error(r.erro);
      return;
    }
    const { inicio, fim } = barra;
    const temp: Marcacao = { id: `tmp-${crypto.randomUUID()}`, inicio, fim, cor, nota: null };
    setMarcas((ms) => [...ms, temp]);
    setBarra(null);
    window.getSelection()?.removeAllRanges();
    const r = await marcar({ leiId: lei.id, inicio, fim, cor });
    if (!r.ok) {
      toast.error(r.erro);
      setMarcas((ms) => ms.filter((x) => x.id !== temp.id));
      return;
    }
    setMarcas((ms) => ms.map((x) => (x.id === temp.id ? { ...x, id: r.id } : x)));
    return { ...temp, id: r.id };
  }

  async function remover(m: Marcacao) {
    setMarcas((ms) => ms.filter((x) => x.id !== m.id));
    setBarra(null);
    const r = await apagarMarcacao(m.id);
    if (!r.ok) toast.error(r.erro);
  }

  async function abrirNota() {
    if (!barra) return;
    if (barra.tipo === "marca") {
      setNota({ marca: barra.marca, texto: barra.marca.nota ?? "" });
      setBarra(null);
      return;
    }
    const m = await aplicarCor("amarelo");
    if (m) setNota({ marca: m, texto: "" });
  }

  async function salvarNota() {
    if (!nota) return;
    const texto = nota.texto.trim() || null;
    setMarcas((ms) => ms.map((x) => (x.id === nota.marca.id ? { ...x, nota: texto } : x)));
    setNota(null);
    const r = await editarMarcacao(nota.marca.id, { nota: texto });
    if (!r.ok) toast.error(r.erro);
  }

  function trechoDaBarra() {
    if (!barra) return "";
    const [a, b] = barra.tipo === "marca" ? [barra.marca.inicio, barra.marca.fim] : [barra.inicio, barra.fim];
    return lei.texto.slice(a, b);
  }

  async function explicar() {
    if (!barra) return;
    const [a, b] = barra.tipo === "marca" ? [barra.marca.inicio, barra.marca.fim] : [barra.inicio, barra.fim];
    const trecho = lei.texto.slice(a, b);
    // contexto: o artigo inteiro em volta do trecho
    const i = porParagrafo.idx(a);
    let ini = i;
    while (ini > 0 && !ps[ini].artigo) ini--;
    let fim = porParagrafo.idx(b);
    while (fim + 1 < ps.length && !ps[fim + 1].artigo && fim - ini < 40) fim++;
    const contexto = lei.texto.slice(ps[ini].inicio, ps[fim].fim).slice(0, 6000);
    setBarra(null);
    setExplicacao({ trecho, texto: null });
    try {
      const r = await fetch("/api/tutor/trecho", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leiId: lei.id, lei: lei.sigla ? `${lei.titulo} (${lei.sigla})` : lei.titulo, trecho, contexto }),
      });
      const j = await r.json().catch(() => ({ erro: "Resposta inválida." }));
      if (!r.ok) throw new Error(j.erro);
      setExplicacao({ trecho, texto: j.texto });
    } catch (e) {
      toast.error((e as Error).message);
      setExplicacao(null);
    }
  }

  async function excluirLei() {
    if (!window.confirm(`Apagar “${lei.titulo}” e todas as marcações?`)) return;
    const r = await apagarLei(lei.id);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    router.push("/leis");
  }

  const embaixo = barra?.tipo === "selecao" && toque();
  const posBarra = barra && {
    left: Math.min(Math.max(barra.x, 170), (typeof window !== "undefined" ? window.innerWidth : 1000) - 170),
    top: embaixo ? Math.min(barra.base + 14, (typeof window !== "undefined" ? window.innerHeight : 800) - 60) : Math.max(barra.y - 56, 72),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Link href="/leis" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Leis secas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{lei.titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[lei.sigla, lei.disciplina, artigos ? `${artigos} artigos` : null, lei.versaoEm ? `texto de ${formatarData.curta(lei.versaoEm)}` : null]
                .filter(Boolean)
                .join(" · ")}
              {lei.fonteUrl && (
                <>
                  {" · "}
                  <a href={lei.fonteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                    fonte <ExternalLink className="size-3" />
                  </a>
                </>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={excluirLei}>
            <Trash2 />
            Apagar
          </Button>
        </div>
      </header>

      <div className="sticky top-16 z-20 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-0 md:rounded-lg md:border md:px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          aria-label="Buscar na lei"
          placeholder="Buscar (ex.: art. 37, prazo, licitação)"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits.length) setHit((h) => (e.shiftKey ? (h - 1 + hits.length) % hits.length : (h + 1) % hits.length));
          }}
          className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
        {termoBusca.trim().length >= 2 && (
          <>
            <span className="shrink-0 text-xs text-muted-foreground">{hits.length ? `${hit + 1} de ${hits.length}` : "nada"}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Anterior" disabled={!hits.length} onClick={() => setHit((h) => (h - 1 + hits.length) % hits.length)}>
              <ChevronUp />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Próximo" disabled={!hits.length} onClick={() => setHit((h) => (h + 1) % hits.length)}>
              <ChevronDown />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Limpar busca" onClick={() => setTermo("")}>
              <X />
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Selecione um trecho (no iPad, toque e segure, depois ajuste as alças) para grifar, anotar, pedir explicação ou criar flashcards. Toque num grifo para mudar a cor ou remover.</p>

      <div
        ref={corpo}
        onMouseUp={aoSoltar}
        onTouchEnd={aoSoltar}
        onClick={clicarCorpo}
        className="rounded-xl border bg-card px-5 py-6 text-[15.5px] leading-7 md:px-9 md:py-8"
      >
        {ps.map((p) => (
          <Linha
            key={p.indice}
            p={p}
            marcas={porParagrafo.m.get(p.indice) ?? SEM}
            buscas={porParagrafo.b.get(p.indice) ?? SEM_B}
            atual={atual && porParagrafo.idx(atual[0]) === p.indice ? atual : null}
          />
        ))}
      </div>

      {barra && posBarra && (
        <div
          role="toolbar"
          aria-label="Ações do trecho"
          style={{ left: posBarra.left, top: posBarra.top }}
          className="fixed z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover p-1.5 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {CORES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Grifar de ${c.rotulo.toLowerCase()}`}
              title={c.rotulo}
              onClick={() => aplicarCor(c.id)}
              className={cn(
                "size-7 rounded-full border-2 border-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                c.bolinha,
                barra.tipo === "marca" && barra.marca.cor === c.id && "border-foreground",
              )}
            />
          ))}
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
          <Button size="icon-sm" variant="ghost" aria-label="Nota" title="Nota" onClick={abrirNota}>
            <MessageSquareText />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Explicar com o Campos" title="Explicar com o Campos" onClick={explicar}>
            <GraduationCap />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Criar flashcards"
            title="Criar flashcards"
            onClick={() => {
              setCards(trechoDaBarra());
              setBarra(null);
            }}
          >
            <GalleryVerticalEnd />
          </Button>
          {barra.tipo === "marca" && (
            <Button size="icon-sm" variant="ghost" aria-label="Remover grifo" title="Remover grifo" className="text-destructive" onClick={() => remover(barra.marca)}>
              <Trash2 />
            </Button>
          )}
        </div>
      )}
      {barra?.tipo === "marca" && barra.marca.nota && posBarra && (
        <div style={{ left: posBarra.left, top: posBarra.top + 52 }} className="fixed z-40 max-w-xs -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg">
          {barra.marca.nota}
        </div>
      )}

      {nota && (
        <Dialog open onOpenChange={(v) => !v && setNota(null)}>
          <DialogContent titulo="Nota no trecho" descricao={lei.texto.slice(nota.marca.inicio, nota.marca.fim).slice(0, 200)}>
            <div className="flex flex-col gap-3">
              <Textarea rows={5} autoFocus value={nota.texto} onChange={(e) => setNota({ ...nota, texto: e.target.value })} placeholder="Ex.: cai junto com o art. 41; prazo é de 10 dias, não 15." />
              <div>
                <Button variant="highlight" onClick={salvarNota}>
                  Salvar nota
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {explicacao && (
        <Dialog open onOpenChange={(v) => !v && setExplicacao(null)}>
          <DialogContent titulo="Campos" descricao={explicacao.trecho.slice(0, 220) + (explicacao.trecho.length > 220 ? "…" : "")}>
            {explicacao.texto === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Lendo o trecho…
              </p>
            ) : (
              <div className="text-[15px] leading-relaxed">
                <TextoSimples texto={explicacao.texto} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {cards !== null && (
        <GerarCards
          aberto
          onAberto={(v) => !v && setCards(null)}
          disciplinas={disciplinas}
          demo={false}
          textoInicial={cards}
          quantidadeInicial={4}
          contexto={`Trecho de ${lei.sigla ?? lei.titulo}.`}
          classificacao={{ disciplinaId: lei.disciplinaId, topicoId: null }}
        />
      )}
    </div>
  );
}

const SEM: Marcacao[] = [];
const SEM_B: [number, number][] = [];
