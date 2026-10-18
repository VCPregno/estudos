import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { LeitorLei } from "@/features/leis/leitor-lei";
import { carregarLei } from "@/lib/data/leis";

export const metadata: Metadata = { title: "Lei seca" };

export default function LeiPage({ params }: PageProps<"/leis/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-[60vh]" />
        </div>
      }
    >
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/leis/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const { lei, disciplinas } = await carregarLei(id);
  if (!lei) notFound();
  return <LeitorLei lei={lei} disciplinas={disciplinas} />;
}
