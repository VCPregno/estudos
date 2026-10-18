import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { PainelFlashcards } from "@/features/flashcards/painel-flashcards";
import { carregarFlashcards } from "@/lib/data/flashcards";

export const metadata: Metadata = { title: "Flashcards" };

export default function FlashcardsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-28" />
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
  return <PainelFlashcards dados={await carregarFlashcards()} />;
}
