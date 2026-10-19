"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apagarRedacao } from "@/app/actions/redacoes";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import type { RedacaoCompleta } from "@/lib/data/redacoes";
import { type TipoErro, marcarErros } from "@/lib/redacao";
import { cn, formatarData } from "@/lib/utils";

const ROTULO_ERRO: Record<TipoErro, string> = {
  ortografia: "Ortografia",
  acentuacao: "Acentuação",
  pontuacao: "Pontuação",
  concordancia: "Concordância",
  regencia: "Regência",
  crase: "Crase",
  coesao: "Coesão",
  vocabulario: "Vocabulário",
  estrutura: "Estrutura",
  argumentacao: "Argumentação",
  outro: "Outro",
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function ResultadoRedacao({ r }: { r: RedacaoCompleta }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState<number | null>(null);
  const [apagando, iniciar] = useTransition();
  const c = r.correcao;
  const texto = r.texto ?? c?.transcricao ?? "";
  const { pedacos, encontrados } = useMemo(() => marcarErros(texto, c?.erros ?? []), [texto, c]);

  if (!c) return <p className="text-muted-foreground">Esta redação ainda não tem correção.</p>;

  const nota = r.nota ?? c.nota_total;
  const passou = r.notaMinima === null ? null : nota >= r.notaMinima;
  const linhasCurtas = r.linhasMin ? c.linhas_estimadas < r.linhasMin : false;
  const linhasLongas = r.linhasMax ? c.linhas_estimadas > r.linhasMax : false;

  function apagar() {
    if (!window.confirm("Apagar esta correção e as fotos?")) return;
    iniciar(async () => {
      const x = await apagarRedacao(r.id);
      if (!x.ok) toast.error(x.erro);
      else router.push("/redacao");
    });
  }

  function irParaErro(i: number) {
    setAtivo(i);
    document.getElementById(`erro-${i}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/redacao" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Redação
        </Link>
        <p className="text-sm text-muted-foreground">
          {r.tipo === "redacao" ? "Redação" : "Questão discursiva"} · {r.banca} · {formatarData.curta(r.criadaEm.slice(0, 10))}
        </p>
        <details className="group">
          <summary className="cursor-pointer list-none text-lg leading-snug font-semibold tracking-tight">
            <span className="line-clamp-3 group-open:line-clamp-none whitespace-pre-line">{r.tema}</span>
          </summary>
        </details>
      </header>

      <section aria-label="Nota" className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-xl border bg-card p-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:p-6">
        <div>
          <p className="text-5xl font-semibold tracking-tight">
            {fmt(nota)}
            <span className="text-2xl font-normal text-muted-foreground"> de {fmt(r.notaMaxima)}</span>
          </p>
          {passou !== null && (
            <p className={cn("mt-1 text-sm font-medium", passou ? "text-certo" : "text-destructive")}>
              {passou ? `Acima do mínimo (${fmt(r.notaMinima!)})` : `Abaixo do mínimo (${fmt(r.notaMinima!)})`}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p>{c.resumo}</p>
          {c.fuga_ao_tema && <p className="font-medium text-destructive">Fuga ao tema: a banca zera a redação.</p>}
          <p className={cn("text-muted-foreground", (linhasCurtas || linhasLongas) && "font-medium text-destructive")}>
            Cerca de {c.linhas_estimadas} linhas
            {r.linhasMin && r.linhasMax ? ` (pedido: ${r.linhasMin} a ${r.linhasMax})` : ""}
            {linhasCurtas ? ". Abaixo do mínimo." : linhasLongas ? ". Acima do máximo: o excedente não é lido." : ""}
          </p>
        </div>
      </section>

      <section aria-labelledby="criterios" className="flex flex-col gap-3">
        <h2 id="criterios" className="font-semibold tracking-tight">
          Critérios
        </h2>
        <ul className="flex flex-col gap-3">
          {c.criterios.map((k) => {
            const pct = k.maximo ? Math.round((100 * k.nota) / k.maximo) : 0;
            return (
              <li key={k.nome} className="rounded-xl border bg-card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{k.nome}</p>
                  <p className="text-sm">
                    <span className="font-semibold">{fmt(k.nota)}</span>
                    <span className="text-muted-foreground"> de {fmt(k.maximo)}</span>
                  </p>
                </div>
                <Progress value={pct} className="mt-2 h-1.5" indicatorClassName={pct >= 60 ? "bg-certo" : pct >= 40 ? "bg-highlight" : "bg-destructive"} aria-label={`${pct}% em ${k.nome}`} />
                <p className="mt-2 text-sm text-muted-foreground">{k.comentario}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="texto" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="texto" className="font-semibold tracking-tight">
            Seu texto
          </h2>
          <span className="text-xs text-muted-foreground">{c.erros.length} apontamentos. Toque num trecho marcado.</span>
        </div>
        <div className="rounded-xl border bg-card px-5 py-5 text-[15.5px] leading-8 whitespace-pre-wrap md:px-8">
          {pedacos.map((p, i) =>
            p.erro === null ? (
              <span key={i}>{p.texto}</span>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => irParaErro(p.erro!)}
                className={cn(
                  "rounded-[2px] bg-destructive/10 text-left underline decoration-destructive decoration-wavy decoration-1 underline-offset-4",
                  ativo === p.erro && "bg-destructive/25",
                )}
              >
                {p.texto}
                <sup className="ml-0.5 text-[10px] font-semibold text-destructive no-underline">{p.erro + 1}</sup>
              </button>
            ),
          )}
        </div>
        {r.imagens.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {r.imagens.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Foto da página ${i + 1}`} className="h-24 w-16 rounded-md border object-cover" />
              </a>
            ))}
            <p className="self-end text-xs text-muted-foreground">Confira se a transcrição bate com a sua folha.</p>
          </div>
        )}
      </section>

      {c.erros.length > 0 && (
        <section aria-labelledby="erros" className="flex flex-col gap-3">
          <h2 id="erros" className="font-semibold tracking-tight">
            Apontamentos
          </h2>
          <ol className="flex flex-col divide-y rounded-xl border bg-card">
            {c.erros.map((e, i) => (
              <li key={i} id={`erro-${i}`} className={cn("flex scroll-mt-24 gap-3 px-4 py-3 transition-colors", ativo === i && "bg-destructive/5")}>
                <span className="mt-0.5 w-5 shrink-0 text-sm font-semibold text-destructive">{i + 1}</span>
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {ROTULO_ERRO[e.tipo]}
                    {!encontrados.has(i) && " · trecho não localizado no texto"}
                  </p>
                  <p className="mt-0.5">
                    <span className="text-destructive line-through decoration-1">{e.trecho}</span>
                    <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" />
                    <span className="font-medium text-certo">{e.correcao}</span>
                  </p>
                  <p className="mt-1 text-muted-foreground">{e.explicacao}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {c.pontos_fortes.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold tracking-tight">O que funcionou</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {c.pontos_fortes.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </section>
        )}
        {c.melhorias.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold tracking-tight">Para subir a nota</h2>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
              {c.melhorias.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {c.paragrafo_modelo && (
        <section aria-labelledby="modelo" className="flex flex-col gap-3">
          <h2 id="modelo" className="font-semibold tracking-tight">
            Um parágrafo reescrito
          </h2>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 text-sm leading-relaxed">
              <p className="mb-1 text-xs text-muted-foreground">Como está</p>
              {c.paragrafo_modelo.original}
            </div>
            <div className="rounded-xl border border-certo/40 bg-card p-4 text-sm leading-relaxed">
              <p className="mb-1 text-xs text-muted-foreground">Como poderia ficar</p>
              {c.paragrafo_modelo.reescrito}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="highlight">
          <Link href="/redacao">Nova redação</Link>
        </Button>
        <Button variant="ghost" className="text-muted-foreground" disabled={apagando} onClick={apagar}>
          {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Apagar
        </Button>
      </div>
    </div>
  );
}
