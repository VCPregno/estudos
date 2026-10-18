"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { idExterno } from "@/lib/questoes";
import { usuarioAtual } from "@/lib/supabase/server";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const Letra = z.string().regex(/^[A-E]$/);

const QuestaoGravar = z.object({
  numero: z.number().int().min(1).max(500),
  textoApoio: z.string().max(30000).nullable(),
  enunciado: z.string().min(1).max(30000),
  alternativas: z.array(z.object({ letra: z.string().max(3), texto: z.string().max(10000) })).max(10),
  gabarito: Letra.nullable(),
  anulada: z.boolean(),
  disciplinaId: z.uuid().nullable(),
  topicoId: z.uuid().nullable(),
  dependeDeImagem: z.boolean(),
});

const Gravacao = z.object({
  importacaoId: z.uuid().nullable(),
  editalId: z.uuid().nullable(),
  prova: z.object({
    nome: z.string().min(1).max(300),
    banca: z.string().max(100).nullable(),
    orgao: z.string().max(100).nullable(),
    cargo: z.string().max(300).nullable(),
    ano: z.number().int().min(1990).max(2100).nullable(),
  }),
  gabaritoOficial: z.boolean(),
  questoes: z.array(QuestaoGravar).min(1).max(300),
});

export type DadosGravacao = z.infer<typeof Gravacao>;

/** Grava as questões revisadas. Reimportar a mesma prova não duplica (external_id). */
export async function gravarQuestoes(dados: DadosGravacao): Promise<Resultado<{ gravadas: number; prova: string }>> {
  const p = Gravacao.safeParse(dados);
  if (!p.success) return { ok: false, erro: "Dados inválidos. Revise as questões e tente de novo." };
  if (!supabaseConfigurado()) return { ok: true, gravadas: p.data.questoes.length, prova: p.data.prova.nome };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const { importacaoId, editalId, prova, gabaritoOficial, questoes } = p.data;
  let carreira: "direito" | "ti" | "geral" = "geral";
  if (editalId) {
    const { data } = await supabase.from("editais").select("carreira").eq("id", editalId).single();
    if (data) carreira = data.carreira;
  }

  const linhas = questoes
    .filter((q) => q.gabarito || q.anulada)
    .map((q) => ({
      external_id: idExterno(prova.nome, q.numero),
      edital_id: editalId,
      carreira,
      banca: prova.banca,
      orgao: prova.orgao,
      cargo: prova.cargo,
      ano: prova.ano,
      prova: prova.nome,
      numero: q.numero,
      disciplina_id: q.disciplinaId,
      topico_id: q.topicoId,
      tipo: "multipla_escolha",
      texto_apoio: q.textoApoio,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      gabarito: q.gabarito ?? "X",
      anulada: q.anulada,
      depende_de_imagem: q.dependeDeImagem,
      gabarito_fonte: gabaritoOficial ? "oficial" : "ia",
    }));
  if (!linhas.length) return { ok: false, erro: "Nenhuma questão tem gabarito. Preencha os gabaritos antes de gravar." };

  const { data, error } = await supabase
    .from("questoes")
    .upsert(linhas, { onConflict: "user_id,external_id", ignoreDuplicates: false })
    .select("id");
  if (error) return { ok: false, erro: `Não deu para gravar: ${error.message}` };

  if (importacaoId) await supabase.from("prova_importacoes").update({ status: "gravada" }).eq("id", importacaoId);
  refresh();
  return { ok: true, gravadas: data?.length ?? linhas.length, prova: prova.nome };
}

/** Registra a resposta. O acerto é decidido aqui, com o gabarito do banco. */
export async function responderQuestao(
  questaoId: string,
  marcada: string,
  tempoSegundos: number | null,
): Promise<Resultado<{ acertou: boolean; gabarito: string; conquistas: { titulo: string; descricao: string }[] }>> {
  if (!z.uuid().safeParse(questaoId).success || !Letra.safeParse(marcada).success) return { ok: false, erro: "Resposta inválida." };
  if (!supabaseConfigurado()) return { ok: false, erro: "demo" };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const { data: q, error } = await supabase.from("questoes").select("gabarito, anulada").eq("id", questaoId).single();
  if (error || !q) return { ok: false, erro: "Questão não encontrada." };

  // Questão anulada conta como acerto, como na prova.
  const acertou = q.anulada || q.gabarito === marcada;
  const tempo = tempoSegundos && tempoSegundos > 0 ? Math.min(Math.round(tempoSegundos), 3600) : null;
  const { error: e2 } = await supabase
    .from("respostas_questoes")
    .insert({ questao_id: questaoId, alternativa_marcada: marcada, acertou, tempo_segundos: tempo });
  if (e2) return { ok: false, erro: `Não deu para salvar a resposta: ${e2.message}` };

  const { data: novas } = await supabase.rpc("verificar_conquistas");
  const conquistas = ((novas ?? []) as { titulo: string; descricao: string }[]).map((c) => ({ titulo: c.titulo, descricao: c.descricao }));
  return { ok: true, acertou, gabarito: q.gabarito, conquistas };
}

const Edicao = z.object({
  gabarito: Letra.optional(),
  anulada: z.boolean().optional(),
  topicoId: z.uuid().nullable().optional(),
  disciplinaId: z.uuid().nullable().optional(),
});

/** Corrige gabarito, anulação ou classificação de uma questão já gravada. */
export async function editarQuestao(questaoId: string, mudancas: z.infer<typeof Edicao>): Promise<Resultado> {
  const m = Edicao.safeParse(mudancas);
  if (!z.uuid().safeParse(questaoId).success || !m.success) return { ok: false, erro: "Dados inválidos." };
  if (!supabaseConfigurado()) return { ok: true };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const update: Record<string, unknown> = {};
  if (m.data.gabarito) Object.assign(update, { gabarito: m.data.gabarito, gabarito_fonte: "manual" });
  if (m.data.anulada !== undefined) update.anulada = m.data.anulada;
  if (m.data.topicoId !== undefined) update.topico_id = m.data.topicoId;
  if (m.data.disciplinaId !== undefined) update.disciplina_id = m.data.disciplinaId;
  if (!Object.keys(update).length) return { ok: true };

  const { error } = await supabase.from("questoes").update(update).eq("id", questaoId);
  if (error) return { ok: false, erro: `Não deu para salvar: ${error.message}` };
  return { ok: true };
}

/** Apaga todas as questões de uma prova importada (para refazer a importação). */
export async function apagarProva(prova: string): Promise<Resultado<{ apagadas: number }>> {
  if (!z.string().min(1).max(300).safeParse(prova).success) return { ok: false, erro: "Prova inválida." };
  if (!supabaseConfigurado()) return { ok: true, apagadas: 0 };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const { data, error } = await supabase.from("questoes").delete().eq("prova", prova).select("id");
  if (error) return { ok: false, erro: `Não deu para apagar: ${error.message}` };
  refresh();
  return { ok: true, apagadas: data?.length ?? 0 };
}
