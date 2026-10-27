"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileUp, GalleryVerticalEnd, GraduationCap, ImageOff, Loader2, Scissors, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { editarQuestao, responderQuestao } from "@/app/actions/questoes";
import { Button } from "@/components/ui/button";
import { GerarCards } from "@/features/flashcards/editor-card";
import type { OpcaoDisciplina } from "@/lib/data/flashcards";
import type { DadosQuestoes, QuestaoTela, Situacao } from "@/lib/data/questoes";
import { cn } from "@/lib/utils";
import { type Rascunho, type Resposta, guardarEstado, guardarUrlQuestoes, lerEstado, lerEstadoGuardado } from "./estado-sessao";
import { TextoQuestao, TextoSimples } from "./texto-questao";

const SITUACOES: { id: Situacao; rotulo: string }[] = [
  { id: "nao_resolvidas", rotulo: "Não resolvidas" },
  { id: "erradas", rotulo: "Erradas" },
  { id: "todas", rotulo: "Todas" },
];

const RASCUNHO_VAZIO: Rascunho = { marcada: null, riscadas: [] };

// =============================================================================

export function ResolverQuestoes({ dados, opcoesCard, chave }: { dados: DadosQuestoes; opcoesCard: OpcaoDisciplina[]; chave: string }) {
  // Volta de outra página do menu: retoma de onde parou (a lista também, senão as já respondidas sumiriam).
  const [inicial] = useState(() => lerEstado(chave));
  const [questoes, setQuestoes] = useState(inicial?.questoes ?? dados.questoes);
  const [indice, setIndice] = useState(inicial?.indice ?? 0);
  const [respostas, setRespostas] = useState<Record<string, Resposta>>(inicial?.respostas ?? {});
  const [sessao, setSessao] = useState(inicial?.sessao ?? { feitas: 0, certas: 0 });
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>(inicial?.rascunhos ?? {});
  const scrollY = useRef(inicial?.scrollY ?? 0);
  const busca = useSearchParams().toString();

  // App recarregado (o iPad faz isso com o PWA em segundo plano): a memória se perdeu, mas o sessionStorage não.
  useEffect(() => {
    if (inicial) return;
    const g = lerEstadoGuardado(chave);
    if (!g) return;
    /* eslint-disable react-hooks/set-state-in-effect -- restauração única depois da hidratação */
    setQuestoes(g.questoes);
    setIndice(g.indice);
    setRespostas(g.respostas);
    setSessao(g.sessao);
    setRascunhos(g.rascunhos);
    /* eslint-enable react-hooks/set-state-in-effect */
    requestAnimationFrame(() => window.scrollTo({ top: g.scrollY }));
  }, [chave, inicial]);

  useEffect(() => {
    guardarEstado(chave, { questoes, indice, respostas, sessao, rascunhos, scrollY: scrollY.current });
  }, [chave, questoes, indice, respostas, sessao, rascunhos]);

  // Rolagem: guarda ao sair da página e devolve ao voltar.
  useLayoutEffect(() => {
    if (scrollY.current > 0) {
      const y = scrollY.current;
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    }
    return () => {
      scrollY.current = window.scrollY;
      const e = lerEstado(chave);
      if (e) guardarEstado(chave, { ...e, scrollY: window.scrollY });
    };
  }, [chave]);

  useEffect(() => {
    guardarUrlQuestoes(busca ? `/questoes?${busca}` : "/questoes");
  }, [busca]);

  const atual = questoes[indice] as QuestaoTela | undefined;
  const total = questoes.length;

  const irPara = useCallback((i: number) => {
    setIndice(Math.max(0, Math.min(i, total - 1)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [total]);

  function registrar(q: QuestaoTela, r: Resposta) {
    setRespostas((x) => ({ ...x, [q.id]: r }));
    setSessao((s) => ({ feitas: s.feitas + 1, certas: s.certas + (r.acertou ? 1 : 0) }));
  }

  function atualizarQuestao(id: string, mudanca: Partial<QuestaoTela>) {
    setQuestoes((qs) => qs.map((q) => (q.id === id ? { ...q, ...mudanca } : q)));
  }

  const semNada = dados.geral.total === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6">
      {dados.modo === "demo" && (
        <p className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
          Modo demonstração: questões de exemplo, nada é gravado.
        </p>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Questões</h1>
          {!semNada && (
            <p className="mt-1 text-sm text-muted-foreground">
              {dados.geral.total} no banco · {dados.geral.resolvidas} resolvidas
              {dados.geral.resolvidas > 0 && ` · ${Math.round((100 * dados.geral.acertos) / dados.geral.resolvidas)}% de acerto`}
              {sessao.feitas > 0 && (
                <span className="text-foreground">
                  {" "}
                  · agora: {sessao.certas} de {sessao.feitas}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!semNada && (
            <Button asChild variant="outline">
              <Link href="/simulados">
                <Timer />
                Simulado
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/questoes/importar">
              <FileUp />
              Importar prova
            </Link>
          </Button>
        </div>
      </header>

      {semNada ? (
        <section className="rounded-xl border bg-card p-6 md:p-8">
          <h2 className="text-lg font-semibold">Seu banco ainda está vazio</h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Importe uma prova anterior da sua banca em PDF, de preferência com o gabarito. A IA transcreve as questões, liga cada uma a um
            tópico da sua ementa e você revisa antes de gravar.
          </p>
          <Button asChild variant="highlight" className="mt-5">
            <Link href="/questoes/importar">Importar prova</Link>
          </Button>
        </section>
      ) : (
        <>
          <Filtros dados={dados} />
          {atual ? (
            <>
              <CartaoQuestao
                key={atual.id}
                q={atual}
                resposta={respostas[atual.id]}
                rascunho={rascunhos[atual.id] ?? RASCUNHO_VAZIO}
                onRascunho={(r) => setRascunhos((x) => ({ ...x, [atual.id]: r }))}
                demo={dados.modo === "demo"}
                opcoesCard={opcoesCard}
                onResponder={(r) => registrar(atual, r)}
                onAtualizar={(m) => atualizarQuestao(atual.id, m)}
                onProxima={() => irPara(indice + 1)}
                temProxima={indice < total - 1}
              />
              <nav className="flex items-center justify-between gap-3" aria-label="Navegação entre questões">
                <Button variant="ghost" onClick={() => irPara(indice - 1)} disabled={indice === 0}>
                  <ArrowLeft />
                  Anterior
                </Button>
                <span className="tabular text-sm text-muted-foreground">
                  {indice + 1} de {total}
                  {dados.totalFiltro > total && ` (das primeiras ${total} de ${dados.totalFiltro})`}
                </span>
                <Button variant="ghost" onClick={() => irPara(indice + 1)} disabled={indice >= total - 1}>
                  Próxima
                  <ArrowRight />
                </Button>
              </nav>
            </>
          ) : (
            <section className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {dados.filtros.situacao === "nao_resolvidas"
                ? "Você já resolveu todas as questões deste filtro. Troque para “Erradas” para refazer as que errou."
                : dados.filtros.situacao === "erradas"
                  ? "Nenhuma questão errada neste filtro."
                  : "Nenhuma questão neste filtro."}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Filtros (na URL, para o servidor recarregar a lista)
// =============================================================================

function Filtros({ dados }: { dados: DadosQuestoes }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const f = dados.filtros;

  function mudar(chaves: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(chaves)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    iniciar(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  }

  const topicos = dados.topicos.filter((t) => t.disciplinaId === f.disciplina);

  return (
    <section aria-label="Filtros" className={cn("flex flex-col gap-3 transition-opacity", pendente && "opacity-60")}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {dados.editais.length > 1 && (
          <Seletor
            rotulo="Edital"
            valor={dados.editalId ?? ""}
            onChange={(v) => mudar({ edital: v, disciplina: null, topico: null })}
            opcoes={dados.editais.map((e) => ({ valor: e.id, rotulo: e.nome }))}
          />
        )}
        <Seletor
          rotulo="Disciplina"
          valor={f.disciplina ?? ""}
          onChange={(v) => mudar({ disciplina: v, topico: null })}
          opcoes={[
            { valor: "", rotulo: "Todas as disciplinas" },
            ...dados.disciplinas.filter((d) => d.total > 0).map((d) => ({ valor: d.id, rotulo: `${d.nome} (${d.total})` })),
          ]}
        />
        {f.disciplina && topicos.length > 0 && (
          <Seletor
            rotulo="Tópico"
            valor={f.topico ?? ""}
            onChange={(v) => mudar({ topico: v })}
            opcoes={[{ valor: "", rotulo: "Todos os tópicos" }, ...topicos.map((t) => ({ valor: t.id, rotulo: `${t.titulo} (${t.total})` }))]}
          />
        )}
        {dados.provas.length > 1 && (
          <Seletor
            rotulo="Prova"
            valor={f.prova ?? ""}
            onChange={(v) => mudar({ prova: v })}
            opcoes={[{ valor: "", rotulo: "Todas as provas" }, ...dados.provas.map((p) => ({ valor: p.nome, rotulo: `${p.nome} (${p.total})` }))]}
          />
        )}
      </div>
      <div className="flex items-center gap-1 self-start rounded-lg bg-muted p-1" role="radiogroup" aria-label="Situação">
        {SITUACOES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={f.situacao === s.id}
            onClick={() => mudar({ situacao: s.id === "nao_resolvidas" ? null : s.id })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              f.situacao === s.id && "bg-card font-medium text-foreground shadow-sm",
            )}
          >
            {s.rotulo}
          </button>
        ))}
        {pendente && <Loader2 className="mx-1.5 size-4 animate-spin text-muted-foreground" />}
      </div>
    </section>
  );
}

function Seletor({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {rotulo}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 truncate rounded-md border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

// =============================================================================
// Questão
// =============================================================================

function CartaoQuestao({
  q,
  resposta,
  rascunho,
  onRascunho,
  demo,
  opcoesCard,
  onResponder,
  onAtualizar,
  onProxima,
  temProxima,
}: {
  q: QuestaoTela;
  resposta: Resposta | undefined;
  rascunho: Rascunho;
  onRascunho: (r: Rascunho) => void;
  demo: boolean;
  opcoesCard: OpcaoDisciplina[];
  onResponder: (r: Resposta) => void;
  onAtualizar: (m: Partial<QuestaoTela>) => void;
  onProxima: () => void;
  temProxima: boolean;
}) {
  const marcada = resposta?.marcada ?? rascunho.marcada;
  const riscadas = new Set(rascunho.riscadas);
  const setMarcada = useCallback((letra: string) => onRascunho({ ...rascunho, marcada: letra }), [onRascunho, rascunho]);
  function alternarRisco(letra: string) {
    const n = new Set(riscadas);
    if (n.has(letra)) n.delete(letra);
    else n.add(letra);
    // Riscar a que estava marcada desmarca: não faz sentido responder uma eliminada.
    onRascunho({ marcada: n.has(letra) && rascunho.marcada === letra ? null : rascunho.marcada, riscadas: [...n] });
  }
  const [enviando, setEnviando] = useState(false);
  const inicio = useRef(0);
  useEffect(() => {
    inicio.current = Date.now();
  }, []);

  const respondida = !!resposta;
  const letras = useMemo(() => q.alternativas.map((a) => a.letra), [q.alternativas]);

  const responder = useCallback(async () => {
    if (!marcada || respondida || enviando) return;
    setEnviando(true);
    const segundos = (Date.now() - inicio.current) / 1000;
    const local = { marcada, acertou: q.anulada || marcada === q.gabarito, gabarito: q.gabarito };
    if (demo) {
      onResponder(local);
      setEnviando(false);
      return;
    }
    const r = await responderQuestao(q.id, marcada, segundos);
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    onResponder({ marcada, acertou: r.acertou, gabarito: r.gabarito });
    for (const c of r.conquistas) toast.success(`Conquista desbloqueada: ${c.titulo}`, { description: c.descricao });
  }, [marcada, respondida, enviando, q, demo, onResponder]);

  // Atalhos: A–E marcam, Enter responde/avança.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const letra = e.key.toUpperCase();
      if (!respondida && letras.includes(letra)) {
        setMarcada(letra);
        e.preventDefault();
      } else if (e.key === "Enter") {
        if (respondida) {
          if (temProxima) onProxima();
        } else responder();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [letras, respondida, responder, onProxima, temProxima, setMarcada]);

  const ultima = q.status.tentativas > 0 && !respondida;

  return (
    <article className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:p-7" aria-labelledby={`q-${q.id}`}>
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--disc-${q.cor})` }} />
            <span className="truncate font-medium text-foreground">{q.disciplina ?? "Sem disciplina"}</span>
          </span>
          <span>
            {q.prova}
            {q.numero ? `, questão ${q.numero}` : ""}
          </span>
        </div>
        {q.topico && <p className="text-xs text-muted-foreground">{q.topico}</p>}
        {ultima && (
          <p className={cn("text-xs", q.status.acertouUltima ? "text-certo" : "text-destructive")}>
            {q.status.acertouUltima ? "Você acertou da última vez" : `Você errou da última vez (marcou ${q.status.ultimaMarcada})`}
            {q.status.tentativas > 1 && `, ${q.status.acertos} de ${q.status.tentativas} no total`}
          </p>
        )}
      </header>

      {q.textoApoio && (
        <details open className="group rounded-lg border bg-background/60">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">Texto de apoio</summary>
          <div className="max-h-[420px] overflow-y-auto border-t px-4 py-3 text-[15px] leading-relaxed">
            <TextoQuestao texto={q.textoApoio} />
          </div>
        </details>
      )}

      <div id={`q-${q.id}`} className="text-[15px] leading-relaxed md:text-base">
        <TextoQuestao texto={q.enunciado} />
      </div>

      {q.dependeDeImagem && (
        <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <ImageOff className="mt-px size-3.5 shrink-0" />
          Esta questão tinha uma figura na prova original. A descrição entre colchetes é uma transcrição aproximada.
        </p>
      )}

      <ol className="flex flex-col gap-2" aria-label="Alternativas">
        {q.alternativas.map((a) => {
          const riscada = riscadas.has(a.letra);
          const escolhida = marcada === a.letra;
          const ehGabarito = respondida && !q.anulada && a.letra === resposta.gabarito;
          const errouEssa = respondida && escolhida && !resposta.acertou;
          return (
            <li key={a.letra} className="group/alt flex items-stretch gap-1.5">
              <button
                type="button"
                disabled={respondida}
                onClick={() => setMarcada(a.letra)}
                aria-pressed={escolhida}
                className={cn(
                  "flex flex-1 items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-[15px] leading-snug transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default",
                  !respondida && "hover:bg-accent/60",
                  escolhida && !respondida && "border-foreground bg-accent",
                  ehGabarito && "border-certo bg-certo/10",
                  errouEssa && "border-destructive bg-destructive/10",
                  riscada && !respondida && "text-muted-foreground line-through decoration-1",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                    escolhida && !respondida && "border-foreground bg-foreground text-background",
                    ehGabarito && "border-certo bg-certo text-white",
                    errouEssa && "border-destructive bg-destructive text-white",
                  )}
                >
                  {ehGabarito ? <Check className="size-3.5" /> : errouEssa ? <X className="size-3.5" /> : a.letra}
                </span>
                <span className="min-w-0 flex-1 pt-0.5 whitespace-pre-line">{a.texto}</span>
              </button>
              {!respondida && (
                <button
                  type="button"
                  aria-label={riscada ? `Desfazer risco da alternativa ${a.letra}` : `Riscar alternativa ${a.letra}`}
                  title={riscada ? "Desfazer risco" : "Riscar"}
                  onClick={() => alternarRisco(a.letra)}
                  className={cn(
                    "grid w-9 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity outline-none group-hover/alt:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 max-md:opacity-60 pointer-coarse:opacity-60",
                    riscada && "opacity-100",
                  )}
                >
                  <Scissors className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {!respondida ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="highlight" size="lg" disabled={!marcada || enviando} onClick={responder}>
            {enviando && <Loader2 className="animate-spin" />}
            Responder
          </Button>
          <span className="hidden text-xs text-muted-foreground md:inline">Atalhos: letras A a E marcam, Enter responde.</span>
        </div>
      ) : (
        <Resultado
          q={q}
          resposta={resposta}
          demo={demo}
          opcoesCard={opcoesCard}
          onAtualizar={onAtualizar}
          onProxima={onProxima}
          temProxima={temProxima}
        />
      )}
    </article>
  );
}

// =============================================================================
// Resultado + Campos
// =============================================================================

function Resultado({
  q,
  resposta,
  demo,
  opcoesCard,
  onAtualizar,
  onProxima,
  temProxima,
}: {
  q: QuestaoTela;
  resposta: Resposta;
  demo: boolean;
  opcoesCard: OpcaoDisciplina[];
  onAtualizar: (m: Partial<QuestaoTela>) => void;
  onProxima: () => void;
  temProxima: boolean;
}) {
  const [explicacao, setExplicacao] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [criandoCard, setCriandoCard] = useState(false);

  async function perguntarAoCampos() {
    setCarregando(true);
    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questaoId: demo ? undefined : q.id,
          enunciado: q.enunciado,
          alternativas: q.alternativas,
          gabarito: q.gabarito,
          marcada: resposta.marcada,
          disciplina: q.disciplina ?? undefined,
          banca: q.banca ?? undefined,
          textoApoio: q.textoApoio ?? undefined,
          gabaritoNaoOficial: q.gabaritoFonte === "ia",
        }),
      });
      const json = await r.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
      if (!r.ok) throw new Error(json.erro ?? "O Campos não conseguiu responder.");
      setExplicacao(json.texto);
      onAtualizar({ explicacao: json.texto });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function corrigir(letra: string) {
    setCorrigindo(false);
    const r = await editarQuestao(q.id, { gabarito: letra });
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    onAtualizar({ gabarito: letra, gabaritoFonte: "manual" });
    toast.success(`Gabarito corrigido para ${letra}. Vale a partir da próxima vez.`);
  }

  const salva = explicacao ?? q.explicacao;
  const mostrar = explicacao !== null;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3",
          resposta.acertou ? "bg-certo/10 text-certo" : "bg-destructive/10 text-destructive",
        )}
      >
        <p className="font-semibold">
          {q.anulada
            ? "Questão anulada: conta como acerto."
            : resposta.acertou
              ? "Certo!"
              : `Errado. Gabarito: ${resposta.gabarito}.`}
        </p>
        {q.gabaritoFonte === "ia" && (
          <p className="text-xs text-muted-foreground">
            Gabarito sugerido pela IA, não oficial.{" "}
            {!demo && (
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setCorrigindo((v) => !v)}>
                Corrigir
              </button>
            )}
          </p>
        )}
      </div>

      {corrigindo && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Gabarito certo:</span>
          {q.alternativas.map((a) => (
            <Button key={a.letra} size="sm" variant={a.letra === q.gabarito ? "secondary" : "outline"} onClick={() => corrigir(a.letra)}>
              {a.letra}
            </Button>
          ))}
        </div>
      )}

      {mostrar || carregando ? (
        <section aria-live="polite" className="rounded-lg border bg-background/60 p-4 text-[15px] leading-relaxed">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="size-4 text-highlight-ink" />
            Campos
          </p>
          {carregando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lendo a questão…
            </p>
          ) : (
            <TextoSimples texto={explicacao!} />
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!mostrar && !carregando && (
          <Button variant={resposta.acertou ? "outline" : "highlight"} onClick={() => (salva ? setExplicacao(salva) : perguntarAoCampos())}>
            <GraduationCap />
            {resposta.acertou ? "Explicar com o Campos" : "Por que errei?"}
          </Button>
        )}
        <Button variant="outline" onClick={() => setCriandoCard(true)}>
          <GalleryVerticalEnd />
          Criar card
        </Button>
        {temProxima && (
          <Button variant={mostrar || resposta.acertou ? "highlight" : "outline"} onClick={onProxima}>
            Próxima questão
            <ArrowRight />
          </Button>
        )}
      </div>
      {criandoCard && (
        <GerarCards
          aberto
          onAberto={setCriandoCard}
          disciplinas={opcoesCard}
          demo={demo}
          questaoId={demo ? undefined : q.id}
          daQuestao
          quantidadeInicial={2}
          classificacao={{ disciplinaId: q.disciplinaId, topicoId: q.topicoId }}
          contexto={
            resposta.acertou
              ? "Questão de concurso que o estudante acertou; o card deve fixar o conceito principal cobrado."
              : `Questão de concurso que o estudante errou (marcou ${resposta.marcada}, gabarito ${q.gabarito}); o card deve fixar o ponto que causou o erro.`
          }
          textoInicial={[
            q.textoApoio ? `Texto de apoio (resumo): ${q.textoApoio.slice(0, 3000)}` : "",
            `Enunciado: ${q.enunciado}`,
            `Alternativas:\n${q.alternativas.map((a) => `${a.letra}) ${a.texto}`).join("\n")}`,
            `Gabarito: ${q.gabarito}. Marcada: ${resposta.marcada}.`,
            (explicacao ?? q.explicacao) ? `Explicação do tutor: ${explicacao ?? q.explicacao}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")}
        />
      )}
    </div>
  );
}
