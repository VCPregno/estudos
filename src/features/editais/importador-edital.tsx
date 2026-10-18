"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, CircleAlert, FileText, Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { confirmarImportacao } from "@/app/actions/editais";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import type { EditalExtraido } from "@/lib/ai/esquema-edital";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { EDITAL_EXEMPLO } from "./exemplo";
import { contarPaginas, interpretarIntervalo, recortarPaginas } from "./paginas-pdf";

export interface InfoProvedor {
  nome: "claude" | "gemini" | null;
  modelo: string | null;
  usaStorage: boolean;
}

type Etapa =
  | { tipo: "envio" }
  | { tipo: "lendo"; desde: number; paginas: number }
  | { tipo: "revisao"; dados: EditalExtraido; importacaoId: string | null; storagePath: string | null; exemplo: boolean }
  | { tipo: "pronto"; editalId: string | null; demo: boolean; nome: string };

const NOME_PROVEDOR = { claude: "Claude", gemini: "Gemini" } as const;

function tamanhoArquivo(bytes: number) {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return bytes < 1024 * 1024 ? `${fmt(bytes / 1024)} KB` : `${fmt(bytes / 1024 / 1024)} MB`;
}

// =============================================================================

export function ImportadorEdital({ provedor }: { provedor: InfoProvedor }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "envio" });

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0">
      <Passos atual={etapa.tipo} />
      {etapa.tipo === "envio" && <EtapaEnvio provedor={provedor} onLendo={setEtapa} />}
      {etapa.tipo === "lendo" && <EtapaLendo desde={etapa.desde} paginas={etapa.paginas} provedor={provedor} />}
      {etapa.tipo === "revisao" && (
        <EtapaRevisao
          inicial={etapa.dados}
          importacaoId={etapa.importacaoId}
          storagePath={etapa.storagePath}
          exemplo={etapa.exemplo}
          onVoltar={() => setEtapa({ tipo: "envio" })}
          onPronto={(r) => setEtapa({ tipo: "pronto", ...r })}
        />
      )}
      {etapa.tipo === "pronto" && <EtapaPronto {...etapa} onNovo={() => setEtapa({ tipo: "envio" })} />}
    </div>
  );
}

function Passos({ atual }: { atual: Etapa["tipo"] }) {
  const passos = [
    { id: "envio", rotulo: "Enviar PDF" },
    { id: "lendo", rotulo: "Leitura pela IA" },
    { id: "revisao", rotulo: "Revisar" },
    { id: "pronto", rotulo: "Na ementa" },
  ];
  const idx = passos.findIndex((p) => p.id === atual);
  return (
    <ol className="mb-8 flex items-center gap-2 text-sm" aria-label="Etapas da importação">
      {passos.map((p, i) => (
        <li key={p.id} className="flex items-center gap-2" aria-current={i === idx ? "step" : undefined}>
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full border text-xs tabular",
              i < idx && "border-foreground bg-foreground text-background",
              i === idx && "border-highlight bg-highlight text-highlight-foreground font-semibold",
              i > idx && "text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
          <span className={cn("hidden sm:inline", i === idx ? "text-foreground" : "text-muted-foreground")}>{p.rotulo}</span>
          {i < passos.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-border sm:w-10" />}
        </li>
      ))}
    </ol>
  );
}

// =============================================================================
// 1. Envio
// =============================================================================

function EtapaEnvio({ provedor, onLendo }: { provedor: InfoProvedor; onLendo: (e: Etapa) => void }) {
  const [arquivo, setArquivo] = useState<{ file: File; bytes: ArrayBuffer; paginas: number } | null>(null);
  const [intervalo, setIntervalo] = useState("");
  const [cargo, setCargo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function escolher(file: File | undefined) {
    setErro(null);
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErro("Escolha um arquivo PDF.");
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const paginas = await contarPaginas(bytes);
      setArquivo({ file, bytes, paginas });
    } catch {
      setErro("Não consegui abrir esse PDF. Ele pode estar corrompido ou protegido por senha.");
    }
  }

  async function enviar() {
    if (!arquivo) return;
    setErro(null);

    let indices: number[] | null = null;
    try {
      if (intervalo.trim()) indices = interpretarIntervalo(intervalo, arquivo.paginas);
    } catch (e) {
      setErro((e as Error).message);
      return;
    }

    const paginasEnviadas = indices?.length ?? arquivo.paginas;
    if (paginasEnviadas > 100 && provedor.nome === "claude") {
      setErro(`São ${paginasEnviadas} páginas; o limite por leitura é 100. Informe só as páginas do conteúdo programático.`);
      return;
    }

    onLendo({ tipo: "lendo", desde: Date.now(), paginas: paginasEnviadas });

    try {
      const pdf = indices ? await recortarPaginas(arquivo.bytes, indices) : new Uint8Array(arquivo.bytes);
      const rotuloPaginas = intervalo.trim() || undefined;
      let resposta: Response;

      if (provedor.usaStorage) {
        const supabase = criarClienteNavegador();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
        const caminho = `${auth.user.id}/${crypto.randomUUID()}.pdf`;
        const { error } = await supabase.storage
          .from("editais")
          .upload(caminho, new Blob([pdf], { type: "application/pdf" }), { contentType: "application/pdf" });
        if (error) throw new Error(`Falha no envio do PDF: ${error.message}`);
        resposta = await fetch("/api/editais/extrair", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storagePath: caminho, cargo: cargo || undefined, paginas: rotuloPaginas }),
        });
      } else {
        const form = new FormData();
        form.append("arquivo", new Blob([pdf], { type: "application/pdf" }), arquivo.file.name);
        if (cargo) form.append("cargo", cargo);
        if (rotuloPaginas) form.append("paginas", rotuloPaginas);
        resposta = await fetch("/api/editais/extrair", { method: "POST", body: form });
      }

      const json = await resposta.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
      if (!resposta.ok) throw new Error(json.erro ?? "Falha na leitura do edital.");
      onLendo({
        tipo: "revisao",
        dados: json.resultado,
        importacaoId: json.importacaoId,
        storagePath: json.storagePath,
        exemplo: false,
      });
    } catch (e) {
      toast.error((e as Error).message);
      onLendo({ tipo: "envio" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Importar edital</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Envie o PDF do edital. A IA lê o conteúdo programático e monta as disciplinas e os tópicos; você revisa antes de
          gravar na ementa.
        </p>
      </div>

      {!provedor.nome && (
        <div className="flex gap-3 rounded-lg border border-dashed p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-highlight-ink" />
          <div>
            <p className="font-medium">Nenhuma IA configurada</p>
            <p className="mt-1 text-muted-foreground">
              Defina <code className="text-foreground">ANTHROPIC_API_KEY</code> (Claude) ou{" "}
              <code className="text-foreground">GEMINI_API_KEY</code> (Gemini) no <code className="text-foreground">.env.local</code> e
              reinicie o servidor. Enquanto isso, dá para conhecer a revisão com um edital de exemplo.
            </p>
          </div>
        </div>
      )}

      {arquivo ? (
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <span className="grid size-11 place-items-center rounded-lg bg-muted">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{arquivo.file.name}</p>
            <p className="text-sm text-muted-foreground">
              {arquivo.paginas} {arquivo.paginas === 1 ? "página" : "páginas"}, {tamanhoArquivo(arquivo.file.size)}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Remover arquivo" onClick={() => setArquivo(null)}>
            <X />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
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
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40",
            arrastando && "border-highlight bg-card",
          )}
        >
          <Upload className="size-7 text-muted-foreground" />
          <span className="font-medium">Arraste o PDF do edital ou clique para escolher</span>
          <span className="text-sm text-muted-foreground">Até 30 MB. Você pode mandar só as páginas do conteúdo programático.</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => escolher(e.target.files?.[0])} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="paginas">Páginas do conteúdo programático</Label>
          <Input id="paginas" placeholder="Ex.: 45-80" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
          <p className="text-xs text-muted-foreground">Opcional. Mandar só o anexo deixa a leitura mais rápida e barata.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cargo">Cargo de interesse</Label>
          <Input id="cargo" placeholder="Ex.: Analista Judiciário, Área Judiciária" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <p className="text-xs text-muted-foreground">Opcional. Útil quando o edital tem conteúdos diferentes por cargo.</p>
        </div>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="highlight" size="lg" disabled={!arquivo || !provedor.nome} onClick={enviar}>
          <Sparkles />
          Ler edital com IA
        </Button>
        <Button
          variant="ghost"
          onClick={() => onLendo({ tipo: "revisao", dados: structuredClone(EDITAL_EXEMPLO), importacaoId: null, storagePath: null, exemplo: true })}
        >
          Ver um exemplo
        </Button>
        {provedor.nome && (
          <span className="text-xs text-muted-foreground">
            Leitura por {NOME_PROVEDOR[provedor.nome]} ({provedor.modelo})
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 2. Lendo
// =============================================================================

function EtapaLendo({ desde, paginas, provedor }: { desde: number; paginas: number; provedor: InfoProvedor }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(id);
  }, [desde]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-16 text-center" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-highlight-ink" />
      <h2 className="text-xl font-semibold">Lendo {paginas} páginas do edital</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {provedor.nome ? NOME_PROVEDOR[provedor.nome] : "A IA"} está separando disciplinas e tópicos. Editais longos levam de 1 a 3
        minutos; não feche esta aba.
      </p>
      <p className="tabular text-sm text-muted-foreground">
        {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}
      </p>
    </div>
  );
}

// =============================================================================
// 3. Revisão
// =============================================================================

function EtapaRevisao({
  inicial,
  importacaoId,
  storagePath,
  exemplo,
  onVoltar,
  onPronto,
}: {
  inicial: EditalExtraido;
  importacaoId: string | null;
  storagePath: string | null;
  exemplo: boolean;
  onVoltar: () => void;
  onPronto: (r: { editalId: string | null; demo: boolean; nome: string }) => void;
}) {
  const [dados, setDados] = useState(inicial);
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set([0]));
  const [salvando, startTransition] = useTransition();

  const totalTopicos = dados.disciplinas.reduce(
    (s, d) => s + d.topicos.reduce((t, top) => t + Math.max(1, top.subtopicos.length), 0),
    0,
  );

  function editar(fn: (rascunho: EditalExtraido) => void) {
    setDados((atual) => {
      const copia = structuredClone(atual);
      fn(copia);
      return copia;
    });
  }

  function alternar(i: number) {
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  function importar() {
    startTransition(async () => {
      const r = await confirmarImportacao({ ...dados, importacaoId, storagePath });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      onPronto({ editalId: r.editalId, demo: r.demo, nome: dados.edital.nome });
    });
  }

  const e = dados.edital;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Revise antes de importar</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Corrija nomes, apague o que não for cobrado e junte o que a IA separou demais. Nada vai para a ementa até você
          confirmar.
        </p>
        {exemplo && <p className="mt-3 text-sm text-highlight-ink">Este é um edital de exemplo, não foi lido de nenhum PDF.</p>}
      </div>

      {dados.observacoes && (
        <div className="flex gap-3 rounded-lg border border-highlight/50 bg-highlight/10 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-highlight-ink" />
          <p>
            <span className="font-medium">Avisos da IA: </span>
            {dados.observacoes}
          </p>
        </div>
      )}

      <section aria-labelledby="dados-edital" className="rounded-xl border bg-card p-5">
        <h2 id="dados-edital" className="mb-4 font-semibold">
          Dados do concurso
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="nome" rotulo="Nome" className="sm:col-span-2" valor={e.nome} onChange={(v) => editar((d) => void (d.edital.nome = v))} />
          <Campo id="orgao" rotulo="Órgão" valor={e.orgao ?? ""} onChange={(v) => editar((d) => void (d.edital.orgao = v || null))} />
          <Campo id="banca" rotulo="Banca" valor={e.banca ?? ""} onChange={(v) => editar((d) => void (d.edital.banca = v || null))} />
          <Campo id="cargo-ed" rotulo="Cargo" valor={e.cargo ?? ""} onChange={(v) => editar((d) => void (d.edital.cargo = v || null))} />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="carreira">Carreira</Label>
              <SelectArea id="carreira" valor={e.carreira} onChange={(v) => editar((d) => void (d.edital.carreira = v))} />
            </div>
            <Campo
              id="data-prova"
              rotulo="Data da prova"
              tipo="date"
              valor={e.data_prova ?? ""}
              onChange={(v) => editar((d) => void (d.edital.data_prova = v || null))}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="disciplinas" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="disciplinas" className="font-semibold">
            Conteúdo programático
          </h2>
          <span className="text-sm text-muted-foreground">
            {dados.disciplinas.length} disciplinas, {totalTopicos} unidades de estudo
          </span>
        </div>

        {dados.disciplinas.map((disc, di) => {
          const aberta = abertas.has(di);
          return (
            <div key={di} className="rounded-xl border bg-card">
              <div className="flex items-center gap-2 p-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-expanded={aberta}
                  aria-label={aberta ? `Recolher ${disc.nome}` : `Expandir ${disc.nome}`}
                  onClick={() => alternar(di)}
                >
                  <ChevronDown className={cn("transition-transform", !aberta && "-rotate-90")} />
                </Button>
                <span aria-hidden className="h-6 w-1 rounded-full" style={{ background: `var(--disc-${(di % 8) + 1})` }} />
                <input
                  aria-label="Nome da disciplina"
                  value={disc.nome}
                  onChange={(ev) => editar((d) => void (d.disciplinas[di].nome = ev.target.value))}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium outline-none hover:border-input focus:border-ring"
                />
                <span className="hidden text-xs text-muted-foreground tabular sm:inline">{disc.topicos.length} tópicos</span>
                <SelectArea
                  id={`area-${di}`}
                  valor={disc.area}
                  compacto
                  onChange={(v) => editar((d) => void (d.disciplinas[di].area = v))}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${disc.nome}`}
                  onClick={() => editar((d) => void d.disciplinas.splice(di, 1))}
                >
                  <Trash2 />
                </Button>
              </div>

              {aberta && (
                <ol className="border-t px-3 py-2">
                  {disc.topicos.map((top, ti) => (
                    <li key={ti} className="py-0.5">
                      <LinhaTopico
                        codigo={top.codigo}
                        titulo={top.titulo}
                        onTitulo={(v) => editar((d) => void (d.disciplinas[di].topicos[ti].titulo = v))}
                        onRemover={() => editar((d) => void d.disciplinas[di].topicos.splice(ti, 1))}
                      />
                      {top.subtopicos.length > 0 && (
                        <ol className="ml-8 border-l pl-2">
                          {top.subtopicos.map((sub, si) => (
                            <li key={si}>
                              <LinhaTopico
                                codigo={sub.codigo}
                                titulo={sub.titulo}
                                onTitulo={(v) => editar((d) => void (d.disciplinas[di].topicos[ti].subtopicos[si].titulo = v))}
                                onRemover={() => editar((d) => void d.disciplinas[di].topicos[ti].subtopicos.splice(si, 1))}
                              />
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  ))}
                  <li className="pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => editar((d) => void d.disciplinas[di].topicos.push({ codigo: null, titulo: "", subtopicos: [] }))}
                    >
                      <Plus />
                      Adicionar tópico
                    </Button>
                  </li>
                </ol>
              )}
            </div>
          );
        })}

        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            editar((d) => void d.disciplinas.push({ nome: "Nova disciplina", area: d.edital.carreira, peso: null, qtd_questoes: null, topicos: [] }));
            setAbertas((s) => new Set(s).add(dados.disciplinas.length));
          }}
        >
          <Plus />
          Adicionar disciplina
        </Button>
      </section>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-4 backdrop-blur md:bottom-4">
        <Button variant="ghost" onClick={onVoltar} disabled={salvando}>
          Enviar outro PDF
        </Button>
        <Button variant="highlight" size="lg" onClick={importar} disabled={salvando || dados.disciplinas.length === 0}>
          {salvando && <Loader2 className="animate-spin" />}
          Importar para a ementa
        </Button>
      </div>
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  onChange,
  tipo = "text",
  className,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectArea({
  id,
  valor,
  onChange,
  compacto,
}: {
  id: string;
  valor: "direito" | "ti" | "geral";
  onChange: (v: "direito" | "ti" | "geral") => void;
  compacto?: boolean;
}) {
  return (
    <select
      id={id}
      aria-label={compacto ? "Área da disciplina" : undefined}
      value={valor}
      onChange={(e) => onChange(e.target.value as "direito" | "ti" | "geral")}
      className={cn(
        "rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        compacto ? "h-8" : "h-9",
      )}
    >
      <option value="direito">Direito</option>
      <option value="ti">TI</option>
      <option value="geral">Geral</option>
    </select>
  );
}

function LinhaTopico({
  codigo,
  titulo,
  onTitulo,
  onRemover,
}: {
  codigo: string | null;
  titulo: string;
  onTitulo: (v: string) => void;
  onRemover: () => void;
}) {
  return (
    <div className="group flex items-center gap-2">
      <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">{codigo}</span>
      <input
        aria-label="Título do tópico"
        value={titulo}
        placeholder="Descreva o tópico"
        onChange={(e) => onTitulo(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none hover:border-input focus:border-ring"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remover ${titulo || "tópico"}`}
        onClick={onRemover}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X />
      </Button>
    </div>
  );
}

// =============================================================================
// 4. Pronto
// =============================================================================

function EtapaPronto({ demo, nome, onNovo }: { editalId: string | null; demo: boolean; nome: string; onNovo: () => void }) {
  return (
    <div className="rounded-xl border bg-card px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{demo ? "Revisão concluída" : "Edital importado"}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        {demo
          ? "No modo demonstração nada é gravado. Configure o Supabase para guardar a ementa."
          : `As disciplinas e os tópicos de "${nome}" já estão na sua ementa. O próximo passo é montar o ciclo de estudos.`}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {!demo && (
          <Button asChild variant="highlight">
            <Link href="/cronograma">Montar cronograma</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/ementa">Ver ementa</Link>
        </Button>
        <Button variant="ghost" onClick={onNovo}>
          Importar outro edital
        </Button>
      </div>
    </div>
  );
}
