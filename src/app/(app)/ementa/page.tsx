import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { TabelaEmenta } from "@/features/ementa/tabela-ementa";
import { carregarEmenta } from "@/lib/data/ementa";

export const metadata: Metadata = { title: "Ementa" };

export default function EmentaPage({ searchParams }: PageProps<"/ementa">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/ementa">["searchParams"] }) {
  await connection();
  const { edital } = await searchParams;
  const dados = await carregarEmenta(typeof edital === "string" ? edital : undefined);
  return <TabelaEmenta key={dados.edital?.id ?? "vazio"} dados={dados} />;
}
