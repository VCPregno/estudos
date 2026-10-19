import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { ResultadoRedacao } from "@/features/redacao/resultado-redacao";
import { carregarRedacao } from "@/lib/data/redacoes";

export const metadata: Metadata = { title: "Correção" };

export default function RedacaoCorrigidaPage({ params }: PageProps<"/redacao/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/redacao/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const r = await carregarRedacao(id);
  if (!r) notFound();
  return <ResultadoRedacao r={r} />;
}
