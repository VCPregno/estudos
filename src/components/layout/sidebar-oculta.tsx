"use client";

import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const CHAVE = "estudos:sidebar-oculta";

/** Roda antes da pintura (no <head>), para a barra não piscar ao abrir o app com ela oculta. */
export const SCRIPT_SIDEBAR = `try{if(localStorage.getItem("${CHAVE}")==="1")document.documentElement.dataset.sidebar="oculta"}catch(e){}`;

const ouvintes = new Set<() => void>();
const assinar = (o: () => void) => {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
};
const oculta = () => document.documentElement.dataset.sidebar === "oculta";

function alternar() {
  const nova = !oculta();
  if (nova) document.documentElement.dataset.sidebar = "oculta";
  else delete document.documentElement.dataset.sidebar;
  try {
    localStorage.setItem(CHAVE, nova ? "1" : "0");
  } catch {}
  for (const o of ouvintes) o();
}

export function BotaoSidebar() {
  const estaOculta = useSyncExternalStore(assinar, oculta, () => false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="-ml-2 hidden md:inline-flex"
      aria-label={estaOculta ? "Mostrar barra lateral" : "Ocultar barra lateral"}
      title={estaOculta ? "Mostrar barra lateral" : "Ocultar barra lateral"}
      onClick={alternar}
    >
      {estaOculta ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  );
}
