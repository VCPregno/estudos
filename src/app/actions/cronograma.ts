"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { type DiaSemana, gerarPlanoFixo } from "@/lib/ciclo";
import { supabaseConfigurado } from "@/lib/env";
import { COLUNAS_TOPICO, type TopicoRow, topicosFolha } from "@/lib/data/topicos";
import { usuarioAtual } from "@/lib/supabase/server";

const Dia = z.number().int().min(0).max(6);

const CronogramaSchema = z.object({
  editalId: z.string().min(1),
  nome: z.string().trim().min(1).max(120),
  modo: z.enum(["dinamico", "fixo"]),
  dataInicio: z.iso.date(),
  disciplinas: z
    .array(z.object({ id: z.string().min(1), peso: z.number().int().min(1).max(10), ativo: z.boolean() }))
    .min(1),
  minutosPorDia: z.array(z.number().int().min(0).max(1440)).length(7),
  duracaoBlocoMin: z.number().int().min(10).max(480),
  revisoes: z.object({
    habilitadas: z.boolean(),
    intervalos: z.array(z.number().int().min(1).max(365)).max(12),
    diasPermitidos: z.array(Dia).max(7),
    minutosPorRevisao: z.number().int().min(5).max(120),
  }),
});

export type DadosNovoCronograma = z.infer<typeof CronogramaSchema>;

export type ResultadoCronograma = { ok: true; demo: boolean; itensFixos: number } | { ok: false; erro: string };

/**
 * Cria o cronograma e o torna o ativo (o anterior fica guardado como inativo).
 * Modo fixo: gera e grava o plano completo em cronograma_itens.
 */
export async function salvarCronograma(dados: unknown): Promise<ResultadoCronograma> {
  const parsed = CronogramaSchema.safeParse(dados);
  if (!parsed.success) return { ok: false, erro: "Revise os campos do cronograma." };
  const c = parsed.data;

  if (!c.disciplinas.some((d) => d.ativo)) return { ok: false, erro: "Inclua pelo menos uma disciplina no ciclo." };
  if (c.minutosPorDia.every((m) => m === 0)) return { ok: false, erro: "Defina tempo de estudo em pelo menos um dia da semana." };
  if (c.revisoes.habilitadas && (c.revisoes.intervalos.length === 0 || c.revisoes.diasPermitidos.length === 0)) {
    return { ok: false, erro: "Escolha ao menos um intervalo e um dia da semana para as revisões." };
  }

  if (!supabaseConfigurado()) return { ok: true, demo: true, itensFixos: 0 };

  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const intervalos = [...new Set(c.revisoes.intervalos)].sort((a, b) => a - b);
  const minutosPorDia = Object.fromEntries(c.minutosPorDia.map((m, i) => [String(i), m]));

  // Só um cronograma ativo por vez: o atual vira histórico (e volta a ser o ativo se algo falhar).
  const { data: anterior } = await supabase.from("cronogramas").select("id").eq("ativo", true).maybeSingle();
  const { error: e1 } = await supabase.from("cronogramas").update({ ativo: false }).eq("ativo", true);
  if (e1) return { ok: false, erro: `Não deu para desativar o cronograma anterior: ${e1.message}` };

  const { data: novo, error: e2 } = await supabase
    .from("cronogramas")
    .insert({
      edital_id: c.editalId,
      nome: c.nome,
      modo: c.modo,
      ativo: true,
      data_inicio: c.dataInicio,
      minutos_por_dia: minutosPorDia,
      duracao_bloco_min: c.duracaoBlocoMin,
      revisoes_habilitadas: c.revisoes.habilitadas,
      revisoes_intervalos: intervalos,
      revisoes_dias_semana: [...new Set(c.revisoes.diasPermitidos)].sort(),
      minutos_por_revisao: c.revisoes.minutosPorRevisao,
    })
    .select("id")
    .single();
  if (e2 || !novo) {
    if (anterior) await supabase.from("cronogramas").update({ ativo: true }).eq("id", anterior.id);
    return { ok: false, erro: `Não deu para criar o cronograma: ${e2?.message ?? "erro desconhecido"}` };
  }

  const desfazer = async () => {
    await supabase.from("cronogramas").delete().eq("id", novo.id);
    if (anterior) await supabase.from("cronogramas").update({ ativo: true }).eq("id", anterior.id);
  };

  const { error: e3 } = await supabase.from("cronograma_disciplinas").insert(
    c.disciplinas.map((d, i) => ({ cronograma_id: novo.id, disciplina_id: d.id, ordem: i, peso: d.peso, ativo: d.ativo })),
  );
  if (e3) {
    await desfazer();
    return { ok: false, erro: `Não deu para gravar as disciplinas: ${e3.message}` };
  }

  let itensFixos = 0;
  if (c.modo === "fixo") {
    const { data: tops, error: e4 } = await supabase.from("topicos_ementa").select(COLUNAS_TOPICO).eq("edital_id", c.editalId);
    if (e4) {
      await desfazer();
      return { ok: false, erro: `Não deu para ler a ementa: ${e4.message}` };
    }
    const plano = gerarPlanoFixo({
      config: {
        modo: "fixo",
        dataInicio: c.dataInicio,
        minutosPorDia: c.minutosPorDia as unknown as Record<DiaSemana, number>,
        duracaoBlocoMin: c.duracaoBlocoMin,
        fragmentoMinimoMin: 20,
        // As revisões do modo fixo vêm do banco (trigger ao concluir a teoria); o plano grava só a teoria,
        // mas reserva o tempo delas na projeção para o plano não ficar otimista demais.
        revisoes: {
          habilitadas: c.revisoes.habilitadas,
          intervalos,
          diasPermitidos: c.revisoes.diasPermitidos as DiaSemana[],
          minutosPorRevisao: c.revisoes.minutosPorRevisao,
          limiteDoDia: 0.5,
        },
      },
      disciplinas: c.disciplinas.map((d, i) => ({ id: d.id, nome: "", peso: d.peso, ordem: i, ativo: d.ativo })),
      topicos: topicosFolha((tops ?? []) as TopicoRow[]),
      revisoesPendentes: [],
    });

    const linhas = plano.dias.flatMap((dia) =>
      dia.itens
        .filter((i) => i.tipo === "teoria")
        .map((i, ordem) => ({
          cronograma_id: novo.id,
          data: dia.data,
          ordem_no_dia: ordem,
          tipo: "teoria" as const,
          disciplina_id: i.disciplinaId,
          topico_id: i.topicoId,
          minutos_planejados: i.minutos,
        })),
    );
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await supabase.from("cronograma_itens").insert(linhas.slice(i, i + 500));
      if (error) {
        await desfazer();
        return { ok: false, erro: `Não deu para gravar o plano fixo: ${error.message}` };
      }
    }
    itensFixos = linhas.length;
  }

  refresh();
  return { ok: true, demo: false, itensFixos };
}
