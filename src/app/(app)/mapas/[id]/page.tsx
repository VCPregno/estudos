import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/primitives";
import { EditorDiagrama } from "@/features/mapas/editor-diagrama";
import { carregarMapa } from "@/lib/data/mapas";

export const metadata: Metadata = { title: "Mapa" };

export default function MapaPage({ params }: PageProps<"/mapas/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[70dvh] w-full max-w-6xl" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/mapas/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const { mapa } = await carregarMapa(id);
  if (!mapa) notFound();
  if (mapa.tipo !== "diagrama") redirect("/mapas");
  return <EditorDiagrama mapa={mapa} />;
}
