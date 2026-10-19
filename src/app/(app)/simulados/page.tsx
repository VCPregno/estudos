import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { duracao } from "@/features/simulados/resultado-simulado";
import { Simulados } from "@/features/simulados/simulado";
import { carregarOpcoesSimulado } from "@/lib/data/simulados";
import { cn, formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Simulados" };

export default function SimuladosPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Simulados</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Prova no relógio, sem ver o gabarito até entregar. É aqui que aparece o que a resolução solta esconde: tempo, cansaço e chute.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

async function Conteudo() {
  await connection();
  const opcoes = await carregarOpcoesSimulado();
  return (
    <>
      <Simulados opcoes={opcoes} />
      {opcoes.historico.length > 0 && (
        <section aria-labelledby="historico" className="flex flex-col gap-3">
          <h2 id="historico" className="font-semibold tracking-tight">
            Histórico
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {opcoes.historico.map((s) => (
              <li key={s.id}>
                <Link href={`/simulados/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                  <span className={cn("w-16 shrink-0 text-right text-lg font-semibold", s.nota >= 70 ? "text-certo" : s.nota < 50 && "text-destructive")}>
                    {fmt(s.nota)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium">{s.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.acertos} de {s.total} · {duracao(s.duracaoSeg)} · {formatarData.curta(s.criadoEm.slice(0, 10))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
