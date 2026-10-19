import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { ListaLeis } from "@/features/leis/lista-leis";
import { carregarLeis } from "@/lib/data/leis";

export const metadata: Metadata = { title: "Leis secas" };

export default function LeisPage({ searchParams }: PageProps<"/leis">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/leis">["searchParams"] }) {
  await connection();
  const [{ modo, leis, disciplinas }, sp] = await Promise.all([carregarLeis(), searchParams]);
  const nova = typeof sp.nova === "string" ? sp.nova.slice(0, 200) : undefined;
  // se a lei já foi adicionada, vai direto para ela
  const numero = nova?.match(/\d{1,3}(?:\.\d{3})+|\d{4,}/)?.[0];
  const existente = nova
    ? leis.find((l) => l.titulo.toLowerCase().includes(nova.toLowerCase()) || (l.sigla && nova.includes(l.sigla)) || (numero && l.titulo.includes(numero)))
    : undefined;
  if (existente) redirect(`/leis/${existente.id}`);
  return <ListaLeis key={nova ?? ""} leis={leis} disciplinas={disciplinas} demo={modo === "demo"} nova={nova} />;
}
