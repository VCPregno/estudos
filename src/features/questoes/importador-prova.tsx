"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, CircleAlert, FileText, ImageOff, Link2, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { gravarQuestoes } from "@/app/actions/questoes";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import type { EditalImportacao, OpcoesImportacao } from "@/lib/data/questoes";
import { type QuestaoRevisao, nomeDaProva } from "@/lib/questoes";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { TextoQuestao } from "./texto-questao";

export interface InfoProvedorProva {
  nome: "claude" | "gemini" | null;
  modelo: string | null;
}

interface Extraido {
  importacaoId: string | null;
  prova: { banca: string | null; orgao: string | null; cargo: string | null; ano: number | null; nome: string };
  gabaritoOficial: boolean;
  observacoes: string | null;
  questoes: QuestaoRevisao[];
}

type Etapa =
  | { tipo: "envio" }
  | { tipo: "lendo"; desde: number }
  | { tipo: "revisao"; dados: Extraido; editalId: string | null }
  | { tipo: "pronto"; gravadas: number; prova: string };

const NOME = { claude: "Claude", gemini: "Gemini" } as const;

export function ImportadorProva({ opcoes, provedor }: { opcoes: OpcoesImportacao; provedor: InfoProvedorProva }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "envio" });
  return (
    <div className="mx-auto w-full max-w-4xl min-w-0">
      {etapa.tipo === "envio" && <Envio opcoes={opcoes} provedor={provedor} onEtapa={setEtapa} />}
      {etapa.tipo === "lendo" && <Lendo desde={etapa.desde} provedor={provedor} />}
      {etapa.tipo === "revisao" && (
        <Revisao
          inicial={etapa.dados}
          edital={opcoes.editais.find((e) => e.id === etapa.editalId) ?? null}
          onVoltar={() => setEtapa({ tipo: "envio" })}
          onPronto={(gravadas, prova) => setEtapa({ tipo: "pronto", gravadas, prova })}
        />
      )}
      {etapa.tipo === "pronto" && (
        <section className="flex flex-col items-start gap-4 rounded-xl border bg-card p-6 md:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{etapa.gravadas} questões no seu banco</h1>
          <p className="text-muted-foreground">{etapa.prova}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="highlight">
              <Link href={`/questoes?prova=${encodeURIComponent(etapa.prova)}`}>Resolver agora</Link>
            </Button>
            <Button variant="outline" onClick={() => setEtapa({ tipo: "envio" })}>
              Importar outra prova
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

// =============================================================================
// Envio
// =============================================================================

type Fonte = { tipo: "arquivo"; file: File } | { tipo: "link"; url: string } | null;

function CampoPdf({
  id,
  rotulo,
  dica,
  valor,
  onChange,
}: {
  id: string;
  rotulo: string;
  dica: string;
  valor: Fonte;
  onChange: (f: Fonte) => void;
}) {
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [arrastando, setArrastando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function escolher(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Escolha um arquivo PDF.");
      return;
    }
    onChange({ tipo: "arquivo", file });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{rotulo}</Label>
        <div className="flex gap-1 text-xs" role="radiogroup" aria-label={`Como enviar ${rotulo.toLowerCase()}`}>
          {(["arquivo", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              onClick={() => {
                setModo(m);
                onChange(null);
              }}
              className={cn("rounded px-2 py-1 text-muted-foreground", modo === m && "bg-muted font-medium text-foreground")}
            >
              {m === "arquivo" ? "Arquivo" : "Link"}
            </button>
          ))}
        </div>
      </div>
      {modo === "link" ? (
        <div className="relative">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            type="url"
            inputMode="url"
            placeholder="https://…/prova.pdf"
            className="pl-9"
            value={valor?.tipo === "link" ? valor.url : ""}
            onChange={(e) => onChange(e.target.value.trim() ? { tipo: "link", url: e.target.value.trim() } : null)}
          />
        </div>
      ) : valor?.tipo === "arquivo" ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{valor.file.name}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Remover arquivo" onClick={() => onChange(null)}>
            <X />
          </Button>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            escolher(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40",
            arrastando && "border-highlight bg-card",
          )}
        >
          <Upload className="size-4" />
          Arraste o PDF ou clique para escolher
        </button>
      )}
      <input ref={ref} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={(e) => escolher(e.target.files?.[0])} />
      <p className="text-xs text-muted-foreground">{dica}</p>
    </div>
  );
}

function Envio({ opcoes, provedor, onEtapa }: { opcoes: OpcoesImportacao; provedor: InfoProvedorProva; onEtapa: (e: Etapa) => void }) {
  const [caderno, setCaderno] = useState<Fonte>(null);
  const [gabarito, setGabarito] = useState<Fonte>(null);
  const [editalId, setEditalId] = useState(opcoes.editalPadrao ?? "");
  const [paginas, setPaginas] = useState("");

  async function origem(f: Fonte, uid: string) {
    if (!f) return null;
    if (f.tipo === "link") return { url: f.url };
    const supabase = criarClienteNavegador();
    const caminho = `${uid}/provas/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from("editais").upload(caminho, f.file, { contentType: "application/pdf" });
    if (error) throw new Error(`Falha no envio do PDF: ${error.message}`);
    return { storagePath: caminho };
  }

  async function enviar() {
    if (!caderno) return;
    onEtapa({ tipo: "lendo", desde: Date.now() });
    try {
      const supabase = criarClienteNavegador();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
      const [c, g] = await Promise.all([origem(caderno, auth.user.id), origem(gabarito, auth.user.id)]);
      const r = await fetch("/api/questoes/extrair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editalId: editalId || null, caderno: c, gabarito: g, paginas: paginas.trim() || undefined }),
      });
      const json = await r.json().catch(() => ({ erro: "A leitura demorou demais ou a conexão caiu. Tente de novo." }));
      if (!r.ok) throw new Error(json.erro ?? "Falha na leitura da prova.");
      if (!json.questoes?.length) throw new Error("A IA não encontrou questões nesse PDF.");
      onEtapa({ tipo: "revisao", dados: json, editalId: editalId || null });
    } catch (e) {
      toast.error((e as Error).message);
      onEtapa({ tipo: "envio" });
    }
  }

  const demo = opcoes.modo === "demo";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/questoes" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Questões
        </Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Importar prova</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Mande o caderno de uma prova anterior e, se tiver, o gabarito. A IA transcreve as questões e liga cada uma a um tópico da sua
          ementa; você confere antes de gravar.
        </p>
      </div>

      {(demo || !provedor.nome) && (
        <div className="flex gap-3 rounded-lg border border-dashed p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-highlight-ink" />
          <p className="text-muted-foreground">
            {demo ? "A importação de provas precisa do Supabase configurado." : "Nenhuma IA configurada no servidor."}
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <CampoPdf
          id="caderno"
          rotulo="Caderno de questões"
          dica="Até 14 MB por leitura. Provas maiores: informe as páginas e importe em partes."
          valor={caderno}
          onChange={setCaderno}
        />
        <CampoPdf
          id="gabarito"
          rotulo="Gabarito (opcional)"
          dica="Sem gabarito, a IA resolve as questões e o gabarito fica marcado como não oficial."
          valor={gabarito}
          onChange={setGabarito}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edital">Classificar pela ementa de</Label>
          <select
            id="edital"
            value={editalId}
            onChange={(e) => setEditalId(e.target.value)}
            className="h-9 rounded-md border bg-card px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {opcoes.editais.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
            <option value="">Não classificar</option>
          </select>
          <p className="text-xs text-muted-foreground">Cada questão vai para um tópico, e o acerto aparece na Ementa.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="paginas">Páginas do caderno</Label>
          <Input id="paginas" placeholder="Ex.: 3-14" value={paginas} onChange={(e) => setPaginas(e.target.value)} />
          <p className="text-xs text-muted-foreground">Opcional. Deixe em branco para ler o caderno inteiro.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="highlight" size="lg" disabled={!caderno || demo || !provedor.nome} onClick={enviar}>
          <Sparkles />
          Ler prova com IA
        </Button>
        {provedor.nome && (
          <span className="text-xs text-muted-foreground">
            Leitura por {NOME[provedor.nome]} ({provedor.modelo})
          </span>
        )}
      </div>
    </div>
  );
}

function Lendo({ desde, provedor }: { desde: number; provedor: InfoProvedorProva }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(id);
  }, [desde]);
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-16 text-center" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-highlight-ink" />
      <h2 className="text-xl font-semibold">Transcrevendo a prova</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {provedor.nome ? NOME[provedor.nome] : "A IA"} está lendo questão por questão e conferindo o gabarito. Uma prova de 60 questões
        leva de 1 a 4 minutos; não feche esta aba.
      </p>
      <p className="tabular text-sm text-muted-foreground">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
      </p>
    </div>
  );
}

// =============================================================================
// Revisão
// =============================================================================

type Filtro = "todas" | "sem_topico" | "imagem" | "anuladas" | "sem_gabarito";

function opcoesDeTopico(edital: EditalImportacao | null) {
  if (!edital) return [];
  const filhos = new Map<string | null, EditalImportacao["topicos"]>();
  for (const t of edital.topicos) {
    const l = filhos.get(t.parentId) ?? [];
    l.push(t);
    filhos.set(t.parentId, l);
  }
  for (const l of filhos.values()) l.sort((a, b) => a.ordem - b.ordem);
  return edital.disciplinas.map((d) => {
    const itens: { valor: string; rotulo: string }[] = [{ valor: `d:${d.id}`, rotulo: `${d.nome} (sem tópico)` }];
    const visitar = (t: EditalImportacao["topicos"][number], nivel: number) => {
      itens.push({ valor: `t:${t.id}`, rotulo: `${" ".repeat(nivel)}${t.titulo}` });
      for (const f of filhos.get(t.id) ?? []) visitar(f, nivel + 1);
    };
    for (const t of (filhos.get(null) ?? []).filter((x) => x.disciplinaId === d.id)) visitar(t, 0);
    return { disciplina: d, itens };
  });
}

function Revisao({
  inicial,
  edital,
  onVoltar,
  onPronto,
}: {
  inicial: Extraido;
  edital: EditalImportacao | null;
  onVoltar: () => void;
  onPronto: (gravadas: number, prova: string) => void;
}) {
  const [meta, setMeta] = useState(inicial.prova);
  const [questoes, setQuestoes] = useState(inicial.questoes);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const [aberta, setAberta] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [gravando, iniciar] = useTransition();

  const nome = nomeDaProva(meta);
  const grupos = useMemo(() => opcoesDeTopico(edital), [edital]);
  const topicoPorId = useMemo(() => new Map(edital?.topicos.map((t) => [t.id, t]) ?? []), [edital]);
  const discPorId = useMemo(() => new Map(edital?.disciplinas.map((d) => [d.id, d]) ?? []), [edital]);

  const contagem = {
    total: questoes.length,
    semTopico: questoes.filter((q) => !q.topicoId).length,
    imagem: questoes.filter((q) => q.dependeDeImagem).length,
    anuladas: questoes.filter((q) => q.anulada).length,
    semGabarito: questoes.filter((q) => !q.gabarito && !q.anulada).length,
  };
  const visiveis = questoes.filter(
    (q) =>
      filtro === "todas" ||
      (filtro === "sem_topico" && !q.topicoId) ||
      (filtro === "imagem" && q.dependeDeImagem) ||
      (filtro === "anuladas" && q.anulada) ||
      (filtro === "sem_gabarito" && !q.gabarito && !q.anulada),
  );
  const aGravar = questoes.filter((q) => !excluidas.has(q.numero) && (q.gabarito || q.anulada));

  function mudar(numero: number, m: Partial<QuestaoRevisao>) {
    setQuestoes((qs) => qs.map((q) => (q.numero === numero ? { ...q, ...m } : q)));
  }

  function gravar() {
    iniciar(async () => {
      const r = await gravarQuestoes({
        importacaoId: inicial.importacaoId,
        editalId: edital?.id ?? null,
        prova: { ...meta, nome },
        gabaritoOficial: inicial.gabaritoOficial,
        questoes: aGravar,
      });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      onPronto(r.gravadas, r.prova);
    });
  }

  const filtros: { id: Filtro; rotulo: string; n: number }[] = [
    { id: "todas", rotulo: "Todas", n: contagem.total },
    { id: "sem_topico", rotulo: "Sem tópico", n: contagem.semTopico },
    { id: "sem_gabarito", rotulo: "Sem gabarito", n: contagem.semGabarito },
    { id: "imagem", rotulo: "Com figura", n: contagem.imagem },
    { id: "anuladas", rotulo: "Anuladas", n: contagem.anuladas },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Conferir questões</h1>
        <p className="mt-2 text-muted-foreground">
          {contagem.total} questões lidas.{" "}
          {inicial.gabaritoOficial ? "Gabarito oficial aplicado." : "Sem gabarito oficial: as respostas são da IA e ficam marcadas como não oficiais."}{" "}
          {contagem.total - contagem.semTopico} ligadas a um tópico da ementa.
        </p>
      </div>

      {inicial.observacoes && (
        <p className="flex gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-highlight-ink" />
          {inicial.observacoes}
        </p>
      )}

      <section aria-label="Dados da prova" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ["banca", "Banca"],
            ["ano", "Ano"],
            ["orgao", "Órgão"],
            ["cargo", "Cargo"],
          ] as const
        ).map(([k, rotulo]) => (
          <div key={k} className={cn("flex flex-col gap-1.5", k === "cargo" && "col-span-2 md:col-span-1")}>
            <Label htmlFor={`meta-${k}`}>{rotulo}</Label>
            <Input
              id={`meta-${k}`}
              value={meta[k] ?? ""}
              inputMode={k === "ano" ? "numeric" : undefined}
              onChange={(e) =>
                setMeta((m) => ({ ...m, [k]: k === "ano" ? (Number(e.target.value) || null) : e.target.value || null }))
              }
            />
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mostrar">
        {filtros
          .filter((f) => f.id === "todas" || f.n > 0)
          .map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm text-muted-foreground",
                filtro === f.id && "border-foreground bg-foreground text-background",
              )}
            >
              {f.rotulo} <span className="tabular opacity-70">{f.n}</span>
            </button>
          ))}
      </div>

      <ol className="flex flex-col divide-y rounded-xl border bg-card">
        {visiveis.map((q) => {
          const disc = q.disciplinaId ? discPorId.get(q.disciplinaId) : null;
          const top = q.topicoId ? topicoPorId.get(q.topicoId) : null;
          const fora = excluidas.has(q.numero);
          const valorSelect = q.topicoId ? `t:${q.topicoId}` : q.disciplinaId ? `d:${q.disciplinaId}` : "";
          return (
            <li key={q.numero} className={cn("flex flex-col gap-3 p-3 md:p-4", fora && "opacity-50")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  onClick={() => setAberta(aberta === q.numero ? null : q.numero)}
                  aria-expanded={aberta === q.numero}
                  className="flex min-w-0 flex-1 basis-64 items-center gap-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberta === q.numero && "rotate-180")} />
                  <span className="tabular w-7 shrink-0 text-sm font-semibold">{q.numero}</span>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: disc ? `var(--disc-${disc.cor})` : "var(--border)" }} />
                  <span className="min-w-0 truncate text-sm">{top?.titulo ?? disc?.nome ?? <em className="text-muted-foreground">Sem classificação</em>}</span>
                  {q.dependeDeImagem && <ImageOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Tem figura" />}
                </button>
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Gabarito da questão ${q.numero}`}
                    value={q.anulada ? "anulada" : (q.gabarito ?? "")}
                    onChange={(e) =>
                      mudar(q.numero, e.target.value === "anulada" ? { anulada: true } : { anulada: false, gabarito: e.target.value || null })
                    }
                    className={cn(
                      "h-8 rounded-md border bg-card px-2 text-sm",
                      !q.gabarito && !q.anulada && "border-destructive text-destructive",
                    )}
                  >
                    <option value="">?</option>
                    {["A", "B", "C", "D", "E"].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                    <option value="anulada">Anulada</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!fora}
                      onChange={() =>
                        setExcluidas((s) => {
                          const n = new Set(s);
                          if (n.has(q.numero)) n.delete(q.numero);
                          else n.add(q.numero);
                          return n;
                        })
                      }
                      className="size-4 accent-[var(--foreground)]"
                    />
                    Gravar
                  </label>
                </div>
              </div>
              {aberta === q.numero && (
                <div className="flex flex-col gap-3 pl-7 md:pl-[3.25rem]">
                  {edital && (
                    <select
                      aria-label={`Tópico da questão ${q.numero}`}
                      value={valorSelect}
                      onChange={(e) => {
                        const [tipo, id] = e.target.value.split(":");
                        if (tipo === "t") mudar(q.numero, { topicoId: id, disciplinaId: topicoPorId.get(id)?.disciplinaId ?? null });
                        else if (tipo === "d") mudar(q.numero, { topicoId: null, disciplinaId: id });
                        else mudar(q.numero, { topicoId: null, disciplinaId: null });
                      }}
                      className="h-9 w-full min-w-0 rounded-md border bg-card px-2.5 text-sm"
                    >
                      <option value="">Sem classificação</option>
                      {grupos.map((g) => (
                        <optgroup key={g.disciplina.id} label={g.disciplina.nome}>
                          {g.itens.map((i) => (
                            <option key={i.valor} value={i.valor}>
                              {i.rotulo}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                  {q.textoApoio && (
                    <details className="rounded-md border text-sm">
                      <summary className="cursor-pointer px-3 py-2 text-muted-foreground">Texto de apoio</summary>
                      <div className="max-h-64 overflow-y-auto border-t px-3 py-2">
                        <TextoQuestao texto={q.textoApoio} />
                      </div>
                    </details>
                  )}
                  <TextoQuestao texto={q.enunciado} className="text-sm" />
                  <ol className="flex flex-col gap-1 text-sm">
                    {q.alternativas.map((a) => (
                      <li key={a.letra} className={cn("flex gap-2", a.letra === q.gabarito && "font-semibold")}>
                        <span className="w-4 shrink-0">{a.letra}</span>
                        <span className="whitespace-pre-line">{a.texto}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 p-3 backdrop-blur md:bottom-4">
        <Button variant="highlight" size="lg" disabled={gravando || !aGravar.length} onClick={gravar}>
          {gravando && <Loader2 className="animate-spin" />}
          Gravar {aGravar.length} questões
        </Button>
        <Button variant="ghost" onClick={onVoltar} disabled={gravando}>
          Recomeçar
        </Button>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{nome}</span>
      </div>
    </div>
  );
}
