import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 5400 → "1h30", 2700 → "45 min", 0 → "0 min" */
export function formatarDuracao(segundos: number): string {
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Relógio: 3725 → "01:02:05" */
export function formatarRelogio(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, "0")).join(":");
}

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const SEMANA_CURTA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

function deISO(data: string) {
  return new Date(`${data}T12:00:00Z`);
}

export const formatarData = {
  longa: (d: string) => DATA_LONGA.format(deISO(d)),
  curta: (d: string) => DATA_CURTA.format(deISO(d)),
  semana: (d: string) => SEMANA.format(deISO(d)),
  semanaCurta: (d: string) => SEMANA_CURTA.format(deISO(d)).replace(".", ""),
};
