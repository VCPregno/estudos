import Link from "next/link";
import { Flame } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

async function carregarOfensiva() {
  if (!supabaseConfigurado()) return { atual: 13, recorde: 21, ativoHoje: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { atual: 0, recorde: 0, ativoHoje: false };
  const { data } = await supabase.rpc("calcular_ofensiva").single<{ atual: number; recorde: number; ativo_hoje: boolean }>();
  return { atual: data?.atual ?? 0, recorde: data?.recorde ?? 0, ativoHoje: data?.ativo_hoje ?? false };
}

export async function Ofensiva() {
  const { atual, recorde, ativoHoje } = await carregarOfensiva();
  const texto = ativoHoje
    ? `Ofensiva de ${atual} ${atual === 1 ? "dia" : "dias"}. Recorde: ${recorde}.`
    : atual > 0
      ? `Resolva uma questão ou revise flashcards hoje para manter os ${atual} dias.`
      : "Resolva uma questão ou revise flashcards para começar uma ofensiva.";

  return (
    <Tooltip content={texto}>
      <Link
        href="/conquistas"
        aria-label={texto}
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular transition-colors hover:bg-accent",
          ativoHoje ? "border-highlight/50 text-foreground" : "text-muted-foreground",
        )}
      >
        <Flame className={cn("size-4.5", ativoHoje ? "fill-highlight text-highlight-ink" : "")} />
        {atual}
      </Link>
    </Tooltip>
  );
}

export function OfensivaCarregando() {
  return <div className="h-10 w-16 rounded-full bg-muted/60" aria-hidden />;
}
