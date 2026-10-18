import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Editais" };

export default function EditaisPage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Editais</h1>
          <p className="mt-2 text-muted-foreground">Cada edital importado vira uma ementa com disciplinas e tópicos.</p>
        </div>
        <Button asChild variant="highlight">
          <Link href="/editais/importar">
            <Upload />
            Importar edital
          </Link>
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="mt-8 h-32" />}>
        <Lista />
      </Suspense>
    </div>
  );
}

async function Lista() {
  await connection();
  if (!supabaseConfigurado()) {
    return (
      <p className="mt-8 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        No modo demonstração a lista fica vazia. Você ainda pode importar um PDF e revisar o resultado.
      </p>
    );
  }
  const { supabase } = await usuarioAtual();
  const { data: editais } = await supabase
    .from("editais")
    .select("id, nome, banca, data_prova, created_at, topicos_ementa(count)")
    .order("created_at", { ascending: false });

  if (!editais?.length) {
    return (
      <p className="mt-8 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        Nenhum edital ainda. Importe o PDF do concurso que você está mirando para montar a ementa.
      </p>
    );
  }

  return (
    <ul className="mt-8 divide-y rounded-xl border bg-card">
      {editais.map((e) => {
        const topicos = (e.topicos_ementa as unknown as { count: number }[])?.[0]?.count ?? 0;
        return (
          <li key={e.id} className="flex items-center gap-4 p-4">
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{e.nome}</p>
              <p className="text-sm text-muted-foreground">
                {[e.banca, `${topicos} tópicos`, e.data_prova ? `prova em ${formatarData.longa(e.data_prova)}` : null]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/ementa?edital=${e.id}`}>Ementa</Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
