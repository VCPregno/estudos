"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function AlternarTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme !== "light";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
      onClick={() => setTheme(escuro ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
