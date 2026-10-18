import "server-only";
import { redirect } from "next/navigation";
import { type ConfigCiclo, type DiaSemana, type TopicoCiclo, hojeEmSaoPaulo, somarDias } from "@/lib/ciclo";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { entradaDemo } from "./demo";
import { COLUNAS_TOPICO, type TopicoRow, topicosFolha } from "./topicos";
import { type DashboardData, type EntradaPainel, indiceDeCor, montarPainel } from "./painel";

export interface CronogramaRow {
  id: string;
  edital_id: string;
  modo: "dinamico" | "fixo";
  data_inicio: string;
  minutos_por_dia: Record<string, number>;
  duracao_bloco_min: number;
  fragmento_minimo_min: number;
  revisoes_habilitadas: boolean;
  revisoes_intervalos: number[];
  revisoes_dias_semana: number[];
  minutos_por_revisao: number;
  limite_revisao_pct: number;
  posicao_ciclo: number;
  minutos_no_turno: number;
}

export function configDoCronograma(c: CronogramaRow): ConfigCiclo {
  const minutosPorDia = Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [d, Number(c.minutos_por_dia?.[String(d)] ?? 0)]),
  ) as Record<DiaSemana, number>;
  return {
    modo: c.modo,
    dataInicio: c.data_inicio,
    minutosPorDia,
    duracaoBlocoMin: c.duracao_bloco_min,
    fragmentoMinimoMin: c.fragmento_minimo_min,
    revisoes: {
      habilitadas: c.revisoes_habilitadas,
      intervalos: c.revisoes_intervalos,
      diasPermitidos: c.revisoes_dias_semana as DiaSemana[],
      minutosPorRevisao: c.minutos_por_revisao,
      limiteDoDia: c.limite_revisao_pct / 100,
    },
  };
}

/** Carrega o necessário para projetar o ciclo ativo (também usado ao salvar sessões). */
export async function carregarCicloAtivo(supabase: Awaited<ReturnType<typeof usuarioAtual>>["supabase"]) {
  const { data: cron } = await supabase
    .from("cronogramas")
    .select(
      "id, edital_id, modo, data_inicio, minutos_por_dia, duracao_bloco_min, fragmento_minimo_min, revisoes_habilitadas, revisoes_intervalos, revisoes_dias_semana, minutos_por_revisao, limite_revisao_pct, posicao_ciclo, minutos_no_turno, cronograma_disciplinas(disciplina_id, ordem, peso, ativo, disciplinas(nome, cor)), editais(id, nome, banca, data_prova)",
    )
    .eq("ativo", true)
    .maybeSingle();
  if (!cron) return null;

  const ehFixo = (cron as unknown as CronogramaRow).modo === "fixo";
  const [{ data: tops }, { data: revs }, { data: itens }, { data: ultimo }] = await Promise.all([
    supabase.from("topicos_ementa").select(COLUNAS_TOPICO).eq("edital_id", cron.edital_id),
    supabase
      .from("revisoes_programadas")
      .select("id, topico_id, disciplina_id, numero, data_alvo")
      .eq("status", "pendente"),
    // modo fixo: plano gravado; pendentes até o fim da semana que vem (inclui os atrasados)
    ehFixo
      ? supabase
          .from("cronograma_itens")
          .select("id, data, ordem_no_dia, tipo, disciplina_id, topico_id, minutos_planejados, status")
          .eq("cronograma_id", cron.id)
          .eq("tipo", "teoria")
          .eq("status", "pendente")
          .lte("data", somarDias(hojeEmSaoPaulo(), 14))
          .order("data")
          .order("ordem_no_dia")
      : Promise.resolve({ data: null }),
    ehFixo
      ? supabase
          .from("cronograma_itens")
          .select("data")
          .eq("cronograma_id", cron.id)
          .eq("tipo", "teoria")
          .order("data", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const topicos: TopicoCiclo[] = topicosFolha((tops ?? []) as TopicoRow[]);

  type DiscJoin = { disciplina_id: string; ordem: number; peso: number; ativo: boolean; disciplinas: { nome: string; cor: string | null } | null };
  const disciplinas = ((cron.cronograma_disciplinas ?? []) as unknown as DiscJoin[])
    .sort((a, b) => a.ordem - b.ordem)
    .map((d, i) => ({
      id: d.disciplina_id,
      nome: d.disciplinas?.nome ?? "Disciplina",
      peso: d.peso,
      ordem: d.ordem,
      ativo: d.ativo,
      cor: indiceDeCor(d.disciplinas?.cor, i),
    }));

  const edital = cron.editais as unknown as { id: string; nome: string; banca: string | null; data_prova: string | null };
  const row = cron as unknown as CronogramaRow;

  return {
    cronogramaId: row.id,
    config: configDoCronograma(row),
    estado: { posicao: row.posicao_ciclo, minutosNoTurno: row.minutos_no_turno },
    disciplinas,
    topicos,
    revisoes: (revs ?? []).map((r) => ({
      id: r.id,
      topicoId: r.topico_id,
      disciplinaId: r.disciplina_id,
      numero: r.numero,
      dataAlvo: r.data_alvo,
    })),
    edital: { id: edital.id, nome: edital.nome, banca: edital.banca, dataProva: edital.data_prova },
    itensFixos: ehFixo
      ? (itens ?? []).map((i) => ({
          id: i.id as string,
          data: i.data as string,
          disciplinaId: i.disciplina_id as string,
          topicoId: i.topico_id as string,
          minutos: i.minutos_planejados as number,
        }))
      : null,
    ultimaDataFixa: (ultimo as { data: string } | null)?.data ?? null,
  };
}

export async function carregarDashboard(): Promise<DashboardData> {
  const hoje = hojeEmSaoPaulo();
  if (!supabaseConfigurado()) return montarPainel(entradaDemo(hoje));

  const { supabase, user } = await usuarioAtual();
  if (!user) redirect("/login");

  const [progresso, ofensiva, config, flashcards, ciclo, editais] = await Promise.all([
    supabase
      .from("progresso_diario")
      .select("dia, segundos_estudados, questoes_resolvidas, questoes_certas, flashcards_revisados")
      .gte("dia", somarDias(hoje, -21))
      .order("dia"),
    supabase.rpc("calcular_ofensiva").single<{ atual: number; recorde: number; ativo_hoje: boolean }>(),
    supabase.from("configuracoes").select("meta_diaria_min").maybeSingle(),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).lte("vencimento", new Date().toISOString()),
    carregarCicloAtivo(supabase),
    supabase.from("editais").select("id", { count: "exact", head: true }),
  ]);

  const entrada: EntradaPainel = {
    modo: "real",
    hoje,
    ofensiva: {
      atual: ofensiva.data?.atual ?? 0,
      recorde: ofensiva.data?.recorde ?? 0,
      ativoHoje: ofensiva.data?.ativo_hoje ?? false,
    },
    metaDiariaMin: config.data?.meta_diaria_min ?? 120,
    progresso: (progresso.data ?? []).map((p) => ({
      dia: p.dia,
      segundos: p.segundos_estudados,
      questoes: p.questoes_resolvidas,
      certas: p.questoes_certas,
      flashcards: p.flashcards_revisados,
    })),
    flashcardsDevidos: flashcards.count ?? 0,
    temEdital: (editais.count ?? 0) > 0,
    ciclo,
  };
  return montarPainel(entrada);
}
