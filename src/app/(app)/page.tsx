import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { carregarDashboard } from "@/lib/data/dashboard";
import { PainelDashboard } from "@/features/dashboard/painel-dashboard";

export default function MeuDiaPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection(); // depende de "hoje" e dos dados do usuário: sempre na hora da requisição
  const data = await carregarDashboard();
  return <PainelDashboard data={data} />;
}

function Carregando() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8" aria-busy>
      <Skeleton className="h-12 w-64" />
      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-44" />
    </div>
  );
}
