"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Highlighter, Link2, Loader2, Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { criarLei } from "@/app/actions/leis";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import type { OpcaoDisciplina } from "@/lib/data/flashcards";
import type { LeiResumo } from "@/lib/data/leis";
import { cn } from "@/lib/utils";

const SUGESTOES = [
  { titulo: "Constituição Federal", sigla: "CF/88", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" },
  { titulo: "Lei 8.112/1990 (Servidores federais)", sigla: "Lei 8.112/90", url: "https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm" },
  { titulo: "Lei 9.784/1999 (Processo administrativo)", sigla: "Lei 9.784/99", url: "https://www.planalto.gov.br/ccivil_03/leis/l9784.htm" },
  { titulo: "Lei 8.429/1992 (Improbidade)", sigla: "Lei 8.429/92", url: "https://www.planalto.gov.br/ccivil_03/leis/l8429.htm" },
  { titulo: "Lei 14.133/2021 (Licitações)", sigla: "Lei 14.133/21", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" },
  { titulo: "LINDB (Decreto-Lei 4.657/1942)", sigla: "LINDB", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del4657compilado.htm" },
  { titulo: "LGPD (Lei 13.709/2018)", sigla: "LGPD", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
  { titulo: "Estatuto da Pessoa com Deficiência (Lei 13.146/2015)", sigla: "LBI", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm" },
  { titulo: "Abuso de autoridade (Lei 13.869/2019)", sigla: "Lei 13.869/19", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13869.htm" },
];

export function ListaLeis({ leis, disciplinas, demo }: { leis: LeiResumo[]; disciplinas: OpcaoDisciplina[]; demo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [inicial, setInicial] = useState<{ titulo: string; sigla: string; url: string } | null>(null);

  function adicionar(s?: (typeof SUGESTOES)[number]) {
    setInicial(s ? { titulo: s.titulo, sigla: s.sigla, url: s.url } : null);
    setAberto(true);
  }

  const jaTem = new Set(leis.map((l) => l.fonteUrl));

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leis secas</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            O texto oficial, sem os trechos revogados, para ler, grifar e anotar. Grife um trecho para pedir a explicação do Pontes ou virar flashcard.
          </p>
        </div>
        <Button variant="highlight" onClick={() => adicionar()} disabled={demo}>
          <Plus />
          Adicionar lei
        </Button>
      </header>

      {demo && <p className="rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">Leis secas precisam do Supabase configurado.</p>}

      {leis.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {leis.map((l) => (
            <li key={l.id}>
              <Link
                href={`/leis/${l.id}`}
                className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                  <Scale className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{l.titulo}</p>
                  <p className="text-sm text-muted-foreground">
                    {[l.sigla, l.disciplina].filter(Boolean).join(" · ") || "Sem disciplina"}
                  </p>
                  {l.marcacoes > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Highlighter className="size-3" />
                      {l.marcacoes} {l.marcacoes === 1 ? "marcação" : "marcações"}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!demo && (
        <section aria-labelledby="sugestoes" className="flex flex-col gap-3">
          <h2 id="sugestoes" className="font-semibold tracking-tight">
            {leis.length ? "Adicionar outra" : "Comece por uma destas"}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {SUGESTOES.filter((s) => !jaTem.has(s.url)).map((s) => (
              <li key={s.url}>
                <button
                  type="button"
                  onClick={() => adicionar(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  {s.titulo}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Qualquer outra lei, resolução ou regimento entra pelo link da página oficial ou colando o texto.</p>
        </section>
      )}

      {aberto && <AdicionarLei key={inicial?.url ?? "nova"} aberto onAberto={setAberto} inicial={inicial} disciplinas={disciplinas} />}
    </div>
  );
}

function AdicionarLei({
  aberto,
  onAberto,
  inicial,
  disciplinas,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  inicial: { titulo: string; sigla: string; url: string } | null;
  disciplinas: OpcaoDisciplina[];
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"link" | "texto">("link");
  const [url, setUrl] = useState(inicial?.url ?? "");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [sigla, setSigla] = useState(inicial?.sigla ?? "");
  const [texto, setTexto] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [salvando, iniciar] = useTransition();

  async function salvar() {
    let conteudo = texto;
    if (modo === "link") {
      setBaixando(true);
      try {
        const r = await fetch("/api/leis/importar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const j = await r.json().catch(() => ({ erro: "Resposta inválida." }));
        if (!r.ok) throw new Error(j.erro);
        conteudo = j.texto;
        if (!titulo.trim() && j.titulo) setTitulo(j.titulo);
      } catch (e) {
        toast.error((e as Error).message);
        setBaixando(false);
        return;
      }
      setBaixando(false);
    }
    iniciar(async () => {
      const r = await criarLei({
        titulo: titulo.trim() || "Lei sem nome",
        sigla: sigla || null,
        texto: conteudo,
        fonteUrl: modo === "link" ? url : null,
        disciplinaId: disciplinaId || null,
      });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      onAberto(false);
      router.push(`/leis/${r.id}`);
    });
  }

  const ocupado = baixando || salvando;

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent titulo="Adicionar lei" descricao="Pelo link da página oficial (o texto riscado, revogado, fica de fora) ou colando o texto.">
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 self-start rounded-lg bg-muted p-1" role="radiogroup" aria-label="Como adicionar">
            {(["link", "texto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modo === m}
                onClick={() => setModo(m)}
                className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground", modo === m && "bg-card font-medium text-foreground shadow-sm")}
              >
                {m === "link" ? "Link" : "Colar texto"}
              </button>
            ))}
          </div>
          {modo === "link" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lei-url">Link da lei</Label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="lei-url" type="url" placeholder="https://www.planalto.gov.br/ccivil_03/leis/…" value={url} onChange={(e) => setUrl(e.target.value)} className="pl-9" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lei-texto">Texto</Label>
              <Textarea id="lei-texto" rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui o texto da lei, resolução ou regimento." />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lei-titulo">Nome</Label>
              <Input id="lei-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Regimento Interno do TRT-8" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lei-sigla">Sigla</Label>
              <Input id="lei-sigla" value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Ex.: RI TRT-8" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lei-disc">Disciplina</Label>
            <select id="lei-disc" value={disciplinaId} onChange={(e) => setDisciplinaId(e.target.value)} className="h-9 rounded-md border bg-card px-2.5 text-sm">
              <option value="">Sem disciplina</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Button variant="highlight" disabled={ocupado || (modo === "link" ? !url.trim() : texto.trim().length < 50)} onClick={salvar}>
              {ocupado && <Loader2 className="animate-spin" />}
              {baixando ? "Baixando o texto…" : salvando ? "Salvando…" : "Adicionar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
