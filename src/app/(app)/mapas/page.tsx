import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { PainelMapas } from "@/features/mapas/painel-mapas";
import { carregarMapas } from "@/lib/data/mapas";

export const metadata: Metadata = { title: "Mapas e esquemas" };

export default function MapasPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48" />
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  return <PainelMapas dados={await carregarMapas()} />;
}
