import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ImportadorEdital } from "@/features/editais/importador-edital";
import { modeloEditalDe, provedorConfigurado } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";

export const metadata: Metadata = { title: "Importar edital" };

export default function ImportarEditalPage() {
  return (
    <Suspense>
      <Importador />
    </Suspense>
  );
}

async function Importador() {
  await connection(); // lê variáveis de ambiente em tempo de execução
  const nome = provedorConfigurado();
  return <ImportadorEdital provedor={{ nome, modelo: nome ? modeloEditalDe(nome) : null, usaStorage: supabaseConfigurado() }} />;
}
