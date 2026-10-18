import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { ListaLeis } from "@/features/leis/lista-leis";
import { carregarLeis } from "@/lib/data/leis";

export const metadata: Metadata = { title: "Leis secas" };

export default function LeisPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  const { modo, leis, disciplinas } = await carregarLeis();
  return <ListaLeis leis={leis} disciplinas={disciplinas} demo={modo === "demo"} />;
}
