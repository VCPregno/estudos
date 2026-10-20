import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import { ApagarSimulado, ResultadoSimulado } from "@/features/simulados/resultado-simulado";
import { carregarSimulado } from "@/lib/data/simulados";
import { formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Resultado do simulado" };

export default function SimuladoPage({ params }: PageProps<"/simulados/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Suspense
        fallback={
          <>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-24" />
            <Skeleton className="h-96" />
          </>
        }
      >
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: { params: PageProps<"/simulados/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const s = await carregarSimulado(id);
  if (!s) notFound();
  return (
    <>
      <header>
        <Link href="/simulados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Simulados
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{s.titulo}</h1>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {formatarData.curta(s.criadoEm.slice(0, 10))}
            {s.penalidade ? " · um errado anula um certo" : ""}
          </p>
          <ApagarSimulado id={s.id} />
        </div>
      </header>
      <ResultadoSimulado s={s} />
    </>
  );
}
