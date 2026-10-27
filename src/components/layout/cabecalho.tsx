import { Suspense } from "react";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { TimerSessao } from "@/components/timer/timer-sessao";
import { Ofensiva, OfensivaCarregando } from "@/components/gamificacao/ofensiva";
import { AlternarTema } from "./alternar-tema";
import { BotaoSidebar } from "./sidebar-oculta";

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-8">
      <BotaoSidebar />
      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Meu Dia">
        <span className="grid size-8 place-items-center rounded-lg bg-highlight text-highlight-foreground">
          <BookOpenText className="size-4" strokeWidth={2.25} />
        </span>
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-2 md:gap-3">
        <TimerSessao />
        <Suspense fallback={<OfensivaCarregando />}>
          <Ofensiva />
        </Suspense>
        <AlternarTema />
      </div>
    </header>
  );
}
