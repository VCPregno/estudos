"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ExternalLink, FileText, Loader2, Network, Pencil, Sparkles, Trash2, Upload, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apagarMapa, editarMapa, registrarMapa } from "@/app/actions/mapas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import type { DadosMapas, Mapa } from "@/lib/data/mapas";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ACEITOS = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const LIMITE = 50 * 1024 * 1024;

export function PainelMapas({ dados }: { dados: DadosMapas }) {
  const [filtro, setFiltro] = useState("");
  const [enviar, setEnviar] = useState(false);
  const [aberto, setAberto] = useState<Mapa | null>(null);
  const [editando, setEditando] = useState<Mapa | null>(null);
  const [desenhar, setDesenhar] = useState(false);
  const router = useRouter();
  const demo = dados.modo === "demo";

  const nomes = useMemo(() => new Map(dados.disciplinas.map((d) => [d.id, d])), [dados.disciplinas]);
  const assuntos = useMemo(() => [...new Set(dados.mapas.map((m) => m.assunto).filter((a): a is string => !!a))].sort(), [dados.mapas]);

  const grupos = useMemo(() => {
    const visiveis = dados.mapas.filter((m) => !filtro || (m.disciplinaId ?? "") === filtro);
    const porDisc = new Map<string, Map<string, Mapa[]>>();
    for (const m of visiveis) {
      const d = m.disciplinaId ?? "";
      const a = m.assunto ?? "";
      if (!porDisc.has(d)) porDisc.set(d, new Map());
      const g = porDisc.get(d)!;
      g.set(a, [...(g.get(a) ?? []), m]);
    }
    return [...porDisc].map(([d, g]) => ({
      id: d,
      nome: nomes.get(d)?.nome ?? "Sem disciplina",
      cor: nomes.get(d)?.cor ?? 8,
      assuntos: [...g].sort(([a], [b]) => (a || "zzz").localeCompare(b || "zzz")),
    }));
  }, [dados.mapas, filtro, nomes]);

  const discsComMapa = [...new Set(dados.mapas.map((m) => m.disciplinaId ?? ""))];

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mapas e esquemas</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">Seus mapas mentais e resumos em PDF ou imagem, organizados por disciplina e assunto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEnviar(true)} disabled={demo}>
            <Upload />
            Enviar arquivo
          </Button>
          <Button variant="highlight" onClick={() => setDesenhar(true)} disabled={demo}>
            <Sparkles />
            Desenhar com IA
          </Button>
        </div>
      </header>

      {demo && <p className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">Mapas precisam do Supabase configurado.</p>}

      {!demo && dados.mapas.length === 0 && (
        <section className="rounded-xl border bg-card p-6 md:p-8">
          <h2 className="text-lg font-semibold">Nenhum mapa ainda</h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Peça para a IA desenhar um mapa mental ou um fluxograma de um tópico da sua ementa ou de um texto colado, ou envie a foto do mapa feito à
            mão e o PDF do iPad. Tudo fica separado por disciplina e assunto.
          </p>
        </section>
      )}

      {discsComMapa.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar por disciplina">
          {[{ id: "", nome: "Todas" }, ...discsComMapa.map((id) => ({ id, nome: nomes.get(id)?.nome ?? "Sem disciplina" }))].map((d) => (
            <button
              key={d.id || "todas"}
              type="button"
              role="radio"
              aria-checked={filtro === d.id}
              onClick={() => setFiltro(d.id)}
              className={cn("rounded-full border px-3 py-1 text-sm text-muted-foreground", filtro === d.id && "border-foreground bg-foreground text-background")}
            >
              {d.nome}
            </button>
          ))}
        </div>
      )}

      {grupos.map((g) => (
        <section key={g.id || "sem"} aria-label={g.nome} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: `var(--disc-${g.cor})` }} />
            {g.nome}
          </h2>
          {g.assuntos.map(([assunto, mapas]) => (
            <div key={assunto || "geral"} className="flex flex-col gap-2">
              {assunto && <h3 className="text-sm text-muted-foreground">{assunto}</h3>}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {mapas.map((m) => (
                  <li key={m.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => (m.tipo === "diagrama" ? router.push(`/mapas/${m.id}`) : setAberto(m))}
                      className="flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left outline-none transition-colors hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <span className="grid aspect-[4/3] place-items-center overflow-hidden bg-muted">
                        {m.tipo === "diagrama" ? (
                          <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
                            {m.diagrama?.formato === "fluxo" ? <Workflow className="size-8" /> : <Network className="size-8" />}
                            <span className="text-xs">{m.diagrama?.formato === "fluxo" ? "Fluxograma" : "Mapa mental"}</span>
                          </span>
                        ) : m.mimeType?.startsWith("image/") && m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <FileText className="size-8 text-muted-foreground" />
                        )}
                      </span>
                      <span className="truncate px-3 py-2 text-sm font-medium">{m.titulo}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar ${m.titulo}`}
                      onClick={() => setEditando(m)}
                      className="absolute top-2 right-2 grid size-8 place-items-center rounded-md border bg-card/90 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-80"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {enviar && <EnviarMapa aberto onAberto={setEnviar} dados={dados} assuntos={assuntos} />}
      {desenhar && <DesenharComIA onFechar={() => setDesenhar(false)} dados={dados} />}
      {editando && <EditarMapa key={editando.id} mapa={editando} onFechar={() => setEditando(null)} dados={dados} assuntos={assuntos} />}
      {aberto && (
        <Dialog open onOpenChange={(v) => !v && setAberto(null)}>
          <DialogContent titulo={aberto.titulo} descricao={[nomes.get(aberto.disciplinaId ?? "")?.nome, aberto.assunto].filter(Boolean).join(" · ") || undefined} className="max-w-5xl">
            {!aberto.url ? (
              <p className="text-sm text-muted-foreground">Não deu para abrir o arquivo. Recarregue a página.</p>
            ) : aberto.mimeType?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={aberto.url} alt={aberto.titulo} className="mx-auto max-h-[70dvh] w-auto rounded-md" />
            ) : (
              <iframe src={aberto.url} title={aberto.titulo} className="h-[70dvh] w-full rounded-md border" />
            )}
            {aberto.url && (
              <a href={aberto.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline">
                Abrir em nova aba <ExternalLink className="size-3.5" />
              </a>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CamposMapa({
  titulo,
  setTitulo,
  disciplinaId,
  setDisciplinaId,
  assunto,
  setAssunto,
  dados,
  assuntos,
}: {
  titulo: string;
  setTitulo: (v: string) => void;
  disciplinaId: string;
  setDisciplinaId: (v: string) => void;
  assunto: string;
  setAssunto: (v: string) => void;
  dados: DadosMapas;
  assuntos: string[];
}) {
  const disc = dados.disciplinas.find((d) => d.id === disciplinaId);
  const sugestoes = [...new Set([...assuntos, ...(disc?.topicos.map((t) => t.titulo.split(" › ")[0]) ?? [])])];
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mapa-titulo">Título</Label>
        <Input id="mapa-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mapa-disc">Disciplina</Label>
          <select id="mapa-disc" value={disciplinaId} onChange={(e) => setDisciplinaId(e.target.value)} className="h-9 rounded-md border bg-card px-2.5 text-sm">
            <option value="">Sem disciplina</option>
            {dados.disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mapa-assunto">Assunto</Label>
          <Input id="mapa-assunto" list="mapa-assuntos" value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: Licitações" />
          <datalist id="mapa-assuntos">
            {sugestoes.slice(0, 80).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      </div>
    </>
  );
}

function EnviarMapa({ aberto, onAberto, dados, assuntos }: { aberto: boolean; onAberto: (v: boolean) => void; dados: DadosMapas; assuntos: string[] }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [assunto, setAssunto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function escolher(f: File | undefined) {
    if (!f) return;
    if (!ACEITOS.includes(f.type)) {
      toast.error("Envie PDF ou imagem (PNG, JPG, WEBP, SVG).");
      return;
    }
    if (f.size > LIMITE) {
      toast.error("Arquivo maior que 50 MB.");
      return;
    }
    setArquivo(f);
    if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const supabase = criarClienteNavegador();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
      const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "bin";
      const caminho = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("mapas").upload(caminho, arquivo, { contentType: arquivo.type });
      if (error) throw new Error(`Falha no envio: ${error.message}`);
      const r = await registrarMapa({
        titulo: titulo.trim() || arquivo.name,
        assunto: assunto.trim() || null,
        disciplinaId: disciplinaId || null,
        arquivoPath: caminho,
        mimeType: arquivo.type as "application/pdf",
      });
      if (!r.ok) throw new Error(r.erro);
      toast.success("Mapa salvo.");
      onAberto(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent titulo="Enviar mapa" descricao="PDF ou imagem, até 50 MB.">
        <div className="flex flex-col gap-4">
          {arquivo ? (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{arquivo.name}</span>
              <Button size="icon-sm" variant="ghost" aria-label="Trocar arquivo" onClick={() => setArquivo(null)}>
                <Trash2 />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => ref.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                escolher(e.dataTransfer.files[0]);
              }}
              className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-sm text-muted-foreground hover:bg-accent/40"
            >
              <Upload className="size-6" />
              Arraste o arquivo ou clique para escolher
            </button>
          )}
          <input ref={ref} type="file" accept={ACEITOS.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => escolher(e.target.files?.[0])} />
          <CamposMapa
            titulo={titulo}
            setTitulo={setTitulo}
            disciplinaId={disciplinaId}
            setDisciplinaId={setDisciplinaId}
            assunto={assunto}
            setAssunto={setAssunto}
            dados={dados}
            assuntos={assuntos}
          />
          <div>
            <Button variant="highlight" disabled={!arquivo || enviando} onClick={enviar}>
              {enviando && <Loader2 className="animate-spin" />}
              Salvar mapa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditarMapa({ mapa, onFechar, dados, assuntos }: { mapa: Mapa; onFechar: () => void; dados: DadosMapas; assuntos: string[] }) {
  const [titulo, setTitulo] = useState(mapa.titulo);
  const [disciplinaId, setDisciplinaId] = useState(mapa.disciplinaId ?? "");
  const [assunto, setAssunto] = useState(mapa.assunto ?? "");
  const [ocupado, iniciar] = useTransition();

  function salvar() {
    iniciar(async () => {
      const r = await editarMapa(mapa.id, { titulo: titulo.trim() || mapa.titulo, assunto: assunto.trim() || null, disciplinaId: disciplinaId || null });
      if (!r.ok) toast.error(r.erro);
      else onFechar();
    });
  }
  function apagar() {
    if (!window.confirm(`Apagar “${mapa.titulo}”?`)) return;
    iniciar(async () => {
      const r = await apagarMapa(mapa.id);
      if (!r.ok) toast.error(r.erro);
      else onFechar();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent titulo="Editar mapa">
        <div className="flex flex-col gap-4">
          <CamposMapa
            titulo={titulo}
            setTitulo={setTitulo}
            disciplinaId={disciplinaId}
            setDisciplinaId={setDisciplinaId}
            assunto={assunto}
            setAssunto={setAssunto}
            dados={dados}
            assuntos={assuntos}
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="highlight" disabled={ocupado} onClick={salvar}>
              {ocupado && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
            <Button variant="ghost" className="text-destructive" disabled={ocupado} onClick={apagar}>
              <Trash2 />
              Apagar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DesenharComIA({ onFechar, dados }: { onFechar: () => void; dados: DadosMapas }) {
  const router = useRouter();
  const [formato, setFormato] = useState<"mapa" | "fluxo">("mapa");
  const [fonte, setFonte] = useState<"topico" | "texto">("topico");
  const [disciplinaId, setDisciplinaId] = useState(dados.disciplinas[0]?.id ?? "");
  const [topico, setTopico] = useState("");
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const disc = dados.disciplinas.find((d) => d.id === disciplinaId);

  async function gerar() {
    setGerando(true);
    try {
      const tema = fonte === "topico" ? topico : undefined;
      const r = await fetch("/api/mapas/gerar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formato,
          tema,
          texto: fonte === "texto" ? texto : undefined,
          disciplinaId: disciplinaId || null,
          assunto: fonte === "topico" ? topico.split(" › ")[0] : null,
          contexto: disc ? `Disciplina: ${disc.nome}` : undefined,
        }),
      });
      const j = await r.json().catch(() => ({ erro: "Resposta inválida." }));
      if (!r.ok) throw new Error(j.erro);
      router.push(`/mapas/${j.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setGerando(false);
    }
  }

  const pronto = fonte === "topico" ? topico.length > 0 : texto.trim().length >= 30;
  const opcao = (ativo: boolean) => cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground", ativo && "bg-card font-medium text-foreground shadow-sm");

  return (
    <Dialog open onOpenChange={(v) => !v && !gerando && onFechar()}>
      <DialogContent titulo="Desenhar com IA" descricao="Mapa mental para conceitos e classificações; fluxograma para procedimentos e ritos.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Formato">
              <button type="button" role="radio" aria-checked={formato === "mapa"} onClick={() => setFormato("mapa")} className={opcao(formato === "mapa")}>
                Mapa mental
              </button>
              <button type="button" role="radio" aria-checked={formato === "fluxo"} onClick={() => setFormato("fluxo")} className={opcao(formato === "fluxo")}>
                Fluxograma
              </button>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="A partir de">
              <button type="button" role="radio" aria-checked={fonte === "topico"} onClick={() => setFonte("topico")} className={opcao(fonte === "topico")}>
                Tópico da ementa
              </button>
              <button type="button" role="radio" aria-checked={fonte === "texto"} onClick={() => setFonte("texto")} className={opcao(fonte === "texto")}>
                Texto colado
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Disciplina</span>
              <select value={disciplinaId} onChange={(e) => { setDisciplinaId(e.target.value); setTopico(""); }} className="h-9 rounded-md border bg-card px-2.5 text-sm">
                <option value="">Sem disciplina</option>
                {dados.disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </label>
            {fonte === "topico" && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">Tópico</span>
                <select value={topico} onChange={(e) => setTopico(e.target.value)} className="h-9 rounded-md border bg-card px-2.5 text-sm">
                  <option value="">Escolha</option>
                  {(disc?.topicos ?? []).map((t) => (
                    <option key={t.id} value={t.titulo}>
                      {t.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {fonte === "texto" && (
            <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole um trecho de lei, resumo ou anotação." aria-label="Texto" />
          )}
          <div>
            <Button variant="highlight" disabled={!pronto || gerando} onClick={gerar}>
              {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {gerando ? "Desenhando…" : "Desenhar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
