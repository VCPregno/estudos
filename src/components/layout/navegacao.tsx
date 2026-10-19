"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "@/app/login/actions";
import {
  BookOpenText,
  Ellipsis,
  LogOut,
  CalendarRange,
  FileUp,
  GalleryVerticalEnd,
  ListChecks,
  Network,
  PenLine,
  Scale,
  Sun,
  TableProperties,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ITENS_NAV = [
  { href: "/", rotulo: "Meu Dia", icone: Sun, mobile: true },
  { href: "/questoes", rotulo: "Questões", icone: ListChecks, mobile: true },
  { href: "/flashcards", rotulo: "Flashcards", icone: GalleryVerticalEnd, mobile: false },
  { href: "/leis", rotulo: "Leis secas", icone: Scale, mobile: false },
  { href: "/redacao", rotulo: "Redação", icone: PenLine, mobile: false },
  { href: "/mapas", rotulo: "Mapas e esquemas", icone: Network, mobile: false },
  { href: "/cronograma", rotulo: "Cronograma", icone: CalendarRange, mobile: true },
  { href: "/ementa", rotulo: "Ementa", icone: TableProperties, mobile: true },
  { href: "/editais", rotulo: "Editais", icone: FileUp, mobile: false },
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
  const [menuAberto, setMenuAberto] = useState(false);
  const principais = ITENS_NAV.filter((i) => i.mobile);
  const outros = ITENS_NAV.filter((i) => !i.mobile);
  const emOutro = outros.some((i) => ativo(pathname, i.href));

  return (
    <>
      {menuAberto && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px] md:hidden"
            onClick={() => setMenuAberto(false)}
          />
          <nav
            id="menu-mais"
            aria-label="Mais seções"
            className="fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-50 rounded-xl border bg-popover p-2 shadow-xl md:hidden"
          >
            <ul className="grid grid-cols-2 gap-1">
              {outros.map(({ href, rotulo, icone: Icone }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMenuAberto(false)}
                    aria-current={ativo(pathname, href) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                      ativo(pathname, href) && "bg-accent text-foreground",
                    )}
                  >
                    <Icone className="size-4" />
                    {rotulo}
                  </Link>
                </li>
              ))}
              {process.env.NEXT_PUBLIC_SUPABASE_URL && (
                <li>
                  <form action={sair}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <LogOut className="size-4" />
                      Sair
                    </button>
                  </form>
                </li>
              )}
            </ul>
          </nav>
        </>
      )}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {principais.map(({ href, rotulo, icone: Icone }) => {
          const atual = ativo(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={atual ? "page" : undefined}
              className={cn("flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground", atual && "text-foreground")}
            >
              <Icone className={cn("size-5", atual && "text-highlight-ink")} />
              {rotulo}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={menuAberto}
          aria-controls="menu-mais"
          onClick={() => setMenuAberto((v) => !v)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
            (menuAberto || emOutro) && "text-foreground",
          )}
        >
          <Ellipsis className={cn("size-5", emOutro && "text-highlight-ink")} />
          Mais
        </button>
      </nav>
    </>
  );
}
