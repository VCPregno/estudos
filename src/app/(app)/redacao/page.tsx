import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { NovaRedacao } from "@/features/redacao/nova-redacao";
import { carregarRedacoes } from "@/lib/data/redacoes";
import { cn, formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Redação" };

export default function RedacaoPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Redação</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Escreva à mão, como na prova, e mande a foto. O Campos transcreve, corrige pela régua da banca e marca cada erro no seu texto.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

async function Conteudo() {
  await connection();
  const { modo, redacoes } = await carregarRedacoes();
  return (
    <>
      <NovaRedacao demo={modo === "demo"} />
      {redacoes.length > 0 && (
        <section aria-labelledby="historico" className="flex flex-col gap-3">
          <h2 id="historico" className="font-semibold tracking-tight">
            Histórico
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {redacoes.map((r) => {
              const pct = r.nota === null ? null : r.nota / r.notaMaxima;
              const passou = r.nota !== null && r.notaMinima !== null ? r.nota >= r.notaMinima : null;
              return (
                <li key={r.id}>
                  <Link href={`/redacao/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                    <span
                      className={cn(
                        "w-16 shrink-0 text-right text-lg font-semibold",
                        passou === true && "text-certo",
                        passou === false && "text-destructive",
                      )}
                    >
                      {r.nota === null ? "–" : fmt(r.nota)}
                      <span className="block text-xs font-normal text-muted-foreground">de {fmt(r.notaMaxima)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium">{r.tema.split("\n")[0]}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.tipo === "redacao" ? "Redação" : "Discursiva"} · {r.banca} · {formatarData.curta(r.criadaEm.slice(0, 10))}
                        {pct !== null ? ` · ${Math.round(pct * 100)}%` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
