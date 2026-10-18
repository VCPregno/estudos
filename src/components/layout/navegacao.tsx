"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "@/app/login/actions";
import {
  BookOpenText,
  LogOut,
  CalendarRange,
  FileUp,
  GalleryVerticalEnd,
  ListChecks,
  Network,
  Scale,
  Sun,
  TableProperties,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ITENS_NAV = [
  { href: "/", rotulo: "Meu Dia", icone: Sun, mobile: true },
  { href: "/questoes", rotulo: "Questões", icone: ListChecks, mobile: true },
  { href: "/flashcards", rotulo: "Flashcards", icone: GalleryVerticalEnd, mobile: true },
  { href: "/leis", rotulo: "Leis secas", icone: Scale, mobile: true },
  { href: "/mapas", rotulo: "Mapas e esquemas", icone: Network, mobile: false },
  { href: "/cronograma", rotulo: "Cronograma", icone: CalendarRange, mobile: false },
  { href: "/ementa", rotulo: "Ementa", icone: TableProperties, mobile: false },
  { href: "/editais", rotulo: "Editais", icone: FileUp, mobile: true },
  { href: "/conquistas", rotulo: "Conquistas", icone: Trophy, mobile: false },
] as const;

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2.5">
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-highlight text-highlight-foreground">
          <BookOpenText className="size-4.5" strokeWidth={2.25} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Estudos</span>
      </Link>
      <nav aria-label="Principal" className="flex flex-col gap-0.5">
        {ITENS_NAV.map(({ href, rotulo, icone: Icone }) => {
          const atual = ativo(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                atual && "bg-card text-foreground shadow-[inset_2px_0_0_var(--highlight)]",
              )}
            >
              <Icone className="size-4" />
              {rotulo}
            </Link>
          );
        })}
      </nav>
      {process.env.NEXT_PUBLIC_SUPABASE_URL && (
        <form action={sair} className="mt-auto">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </form>
      )}
    </aside>
  );
}

export function NavegacaoMobile() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {ITENS_NAV.filter((i) => i.mobile).map(({ href, rotulo, icone: Icone }) => {
        const atual = ativo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
              atual && "text-foreground",
            )}
          >
            <Icone className={cn("size-5", atual && "text-highlight-ink")} />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
