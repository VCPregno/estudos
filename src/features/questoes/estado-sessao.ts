"use client";

import type { QuestaoTela } from "@/lib/data/questoes";

/**
 * Guarda o andamento da resolução de questões (lista, posição, respostas, riscos) para que trocar de
 * página no menu e voltar não zere nada. Fica na memória enquanto o app está aberto e, como reserva,
 * no sessionStorage (o iPad às vezes recarrega o PWA quando ele fica em segundo plano).
 */

export interface Resposta {
  marcada: string;
  acertou: boolean;
  gabarito: string;
}

export interface Rascunho {
  marcada: string | null;
  riscadas: string[];
}

export interface EstadoQuestoes {
  questoes: QuestaoTela[];
  indice: number;
  respostas: Record<string, Resposta>;
  sessao: { feitas: number; certas: number };
  rascunhos: Record<string, Rascunho>;
  scrollY: number;
  em: number;
}

const PREFIXO = "estudos:questoes:";
const CHAVE_URL = "estudos:questoes-url";
/** Depois disso a lista é recarregada do zero (ex.: voltou no dia seguinte com o app aberto). */
const VALIDADE_MS = 6 * 60 * 60 * 1000;

const memoria = new Map<string, EstadoQuestoes>();
const valido = (e: EstadoQuestoes | null | undefined) => (e && Date.now() - e.em < VALIDADE_MS ? e : null);

export function lerEstado(chave: string): EstadoQuestoes | null {
  if (typeof window === "undefined") return null;
  return valido(memoria.get(chave));
}

export function lerEstadoGuardado(chave: string): EstadoQuestoes | null {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + chave);
    const e = valido(bruto ? (JSON.parse(bruto) as EstadoQuestoes) : null);
    if (e) memoria.set(chave, e);
    return e;
  } catch {
    return null;
  }
}

export function guardarEstado(chave: string, e: Omit<EstadoQuestoes, "em">) {
  const completo = { ...e, em: Date.now() };
  memoria.set(chave, completo);
  try {
    sessionStorage.setItem(PREFIXO + chave, JSON.stringify(completo));
  } catch {
    // Sem espaço ou sem acesso: a memória já basta enquanto o app não recarrega.
  }
}

// ---------------------------------------------------------------------------
// Último endereço de Questões (com os filtros), para o menu voltar ao mesmo lugar
// ---------------------------------------------------------------------------

const ouvintes = new Set<() => void>();

export function guardarUrlQuestoes(url: string) {
  try {
    if (sessionStorage.getItem(CHAVE_URL) === url) return;
    sessionStorage.setItem(CHAVE_URL, url);
  } catch {
    return;
  }
  for (const o of ouvintes) o();
}

export function assinarUrlQuestoes(o: () => void) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export function lerUrlQuestoes() {
  try {
    return sessionStorage.getItem(CHAVE_URL) ?? "/questoes";
  } catch {
    return "/questoes";
  }
}
