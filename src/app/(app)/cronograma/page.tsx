import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { PaginaCronograma } from "@/features/cronograma/pagina-cronograma";
import { carregarDadosCronograma } from "@/lib/data/cronograma";

export const metadata: Metadata = { title: "Cronograma" };

export default function CronogramaPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  const dados = await carregarDadosCronograma();
  return <PaginaCronograma dados={dados} />;
}
