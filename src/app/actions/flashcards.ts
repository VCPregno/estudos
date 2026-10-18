"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { type EstadoCard, type Nota, avaliar } from "@/lib/flashcards/agendador";
import { usuarioAtual } from "@/lib/supabase/server";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const CardNovo = z.object({
  frente: z.string().trim().min(1, "A frente está vazia.").max(5000),
  verso: z.string().trim().min(1, "O verso está vazio.").max(10000),
  disciplinaId: z.uuid().nullable().optional(),
  topicoId: z.uuid().nullable().optional(),
  questaoId: z.uuid().nullable().optional(),
});

export type DadosCardNovo = z.infer<typeof CardNovo>;

export async function criarFlashcards(cards: DadosCardNovo[]): Promise<Resultado<{ criados: number }>> {
  const p = z.array(CardNovo).min(1).max(50).safeParse(cards);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? "Cards inválidos." };
  if (!supabaseConfigurado()) return { ok: true, criados: p.data.length };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const { data, error } = await supabase
    .from("flashcards")
    .insert(
      p.data.map((c) => ({
        frente: c.frente,
        verso: c.verso,
        disciplina_id: c.disciplinaId ?? null,
        topico_id: c.topicoId ?? null,
        questao_id: c.questaoId ?? null,
      })),
    )
    .select("id");
  if (error) return { ok: false, erro: `Não deu para salvar: ${error.message}` };
  refresh();
  return { ok: true, criados: data?.length ?? p.data.length };
}

export async function editarFlashcard(id: string, dados: DadosCardNovo): Promise<Resultado> {
  const p = CardNovo.safeParse(dados);
  if (!z.uuid().safeParse(id).success || !p.success) return { ok: false, erro: p.error?.issues[0]?.message ?? "Card inválido." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase
    .from("flashcards")
    .update({ frente: p.data.frente, verso: p.data.verso, disciplina_id: p.data.disciplinaId ?? null, topico_id: p.data.topicoId ?? null })
    .eq("id", id);
  if (error) return { ok: false, erro: `Não deu para salvar: ${error.message}` };
  return { ok: true };
}

export async function apagarFlashcard(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Card inválido." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  if (error) return { ok: false, erro: `Não deu para apagar: ${error.message}` };
  return { ok: true };
}

export interface CardAvaliado {
  estado: EstadoCard;
  etapa: number;
  intervaloDias: number;
  facilidade: number;
  repeticoes: number;
  lapsos: number;
  vencimento: string;
}

/** Registra a nota e devolve o novo agendamento. O cálculo é feito aqui, com o card do banco. */
export async function avaliarFlashcard(
  id: string,
  nota: Nota,
): Promise<Resultado<{ card: CardAvaliado; conquistas: { titulo: string; descricao: string }[] }>> {
  if (!z.uuid().safeParse(id).success || ![1, 2, 3, 4].includes(nota)) return { ok: false, erro: "Avaliação inválida." };
  if (!supabaseConfigurado()) return { ok: false, erro: "demo" };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const { data: c, error } = await supabase
    .from("flashcards")
    .select("estado, etapa, intervalo_dias, facilidade, repeticoes, lapsos")
    .eq("id", id)
    .single();
  if (error || !c) return { ok: false, erro: "Card não encontrado." };

  const antes = Number(c.intervalo_dias);
  const r = avaliar(
    {
      estado: c.estado,
      etapa: c.etapa,
      intervaloDias: antes,
      facilidade: Number(c.facilidade),
      repeticoes: c.repeticoes,
      lapsos: c.lapsos,
    },
    nota,
  );

  const agora = new Date().toISOString();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase
      .from("flashcards")
      .update({
        estado: r.estado,
        etapa: r.etapa,
        intervalo_dias: r.intervaloDias,
        facilidade: r.facilidade,
        repeticoes: r.repeticoes,
        lapsos: r.lapsos,
        vencimento: r.vencimento.toISOString(),
        ultima_revisao: agora,
      })
      .eq("id", id),
    supabase.from("flashcard_revisoes").insert({ flashcard_id: id, nota, intervalo_anterior: antes, intervalo_novo: r.intervaloDias }),
  ]);
  if (e1 || e2) return { ok: false, erro: `Não deu para salvar: ${(e1 ?? e2)!.message}` };

  const { data: novas } = await supabase.rpc("verificar_conquistas");
  return {
    ok: true,
    card: { ...r, vencimento: r.vencimento.toISOString() },
    conquistas: ((novas ?? []) as { titulo: string; descricao: string }[]).map((x) => ({ titulo: x.titulo, descricao: x.descricao })),
  };
}
