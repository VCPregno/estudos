import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { PainelConquistas } from "@/features/conquistas/painel-conquistas";
import { carregarConquistas } from "@/lib/data/conquistas";

export const metadata: Metadata = { title: "Conquistas" };

export default function ConquistasPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-28" />
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
  return <PainelConquistas dados={await carregarConquistas()} />;
}
