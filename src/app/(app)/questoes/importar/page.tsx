import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { ImportadorProva } from "@/features/questoes/importador-prova";
import { modeloEditalDe, provedorConfigurado } from "@/lib/ai/provedores";
import { carregarOpcoesImportacao } from "@/lib/data/questoes";

export const metadata: Metadata = { title: "Importar prova" };

export default function ImportarProvaPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-4xl" />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  const nome = provedorConfigurado();
  const opcoes = await carregarOpcoesImportacao();
  return <ImportadorProva opcoes={opcoes} provedor={{ nome, modelo: nome ? modeloEditalDe(nome) : null }} />;
}
