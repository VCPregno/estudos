import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { ResolverQuestoes } from "@/features/questoes/resolver-questoes";
import { type Situacao, carregarQuestoes } from "@/lib/data/questoes";

export const metadata: Metadata = { title: "Questões" };

export default function QuestoesPage({ searchParams }: PageProps<"/questoes">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-20" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

async function Conteudo({ searchParams }: { searchParams: PageProps<"/questoes">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const situacao = um(sp.situacao);
  const filtros = {
    edital: um(sp.edital),
    disciplina: um(sp.disciplina),
    topico: um(sp.topico),
    prova: um(sp.prova),
    situacao: (situacao === "erradas" || situacao === "todas" ? situacao : "nao_resolvidas") as Situacao,
  };
  const dados = await carregarQuestoes(filtros);
  return <ResolverQuestoes key={JSON.stringify(filtros)} dados={dados} />;
}
