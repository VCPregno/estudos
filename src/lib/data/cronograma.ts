import "server-only";
import { redirect } from "next/navigation";
import { type ConfigCiclo, type DataISO, type TopicoCiclo, hojeEmSaoPaulo } from "@/lib/ciclo";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { type CronogramaRow, configDoCronograma } from "./dashboard";
import { entradaDemo } from "./demo";
import { indiceDeCor } from "./painel";
import { COLUNAS_TOPICO, type TopicoRow, topicosFolha } from "./topicos";

export interface DisciplinaEdital {
  id: string;
  nome: string;
  cor: number;
  pesoEdital: number | null;
  qtdQuestoes: number | null;
  ordem: number;
}

export interface EditalOpcao {
  id: string;
  nome: string;
  banca: string | null;
  dataProva: DataISO | null;
  disciplinas: DisciplinaEdital[];
  /** tópicos folha, com o progresso atual */
  topicos: TopicoCiclo[];
}

export interface CronogramaAtual {
  id: string;
  editalId: string;
  nome: string;
  config: ConfigCiclo;
  disciplinas: { id: string; ordem: number; peso: number; ativo: boolean }[];
}

export interface DadosCronograma {
  modo: "demo" | "real";
  hoje: DataISO;
  editais: EditalOpcao[];
  atual: CronogramaAtual | null;
}

function dadosDemo(hoje: DataISO): DadosCronograma {
  const e = entradaDemo(hoje);
  const c = e.ciclo!;
  return {
    modo: "demo",
    hoje,
    editais: [
      {
        id: c.edital.id,
        nome: c.edital.nome,
        banca: c.edital.banca,
        dataProva: c.edital.dataProva,
        disciplinas: c.disciplinas.map((d) => ({
          id: d.id,
          nome: d.nome,
          cor: d.cor,
          pesoEdital: d.peso,
          qtdQuestoes: null,
          ordem: d.ordem,
        })),
        topicos: c.topicos,
      },
    ],
    atual: {
      id: c.cronogramaId,
      editalId: c.edital.id,
      nome: "Ciclo TRT-2",
      config: c.config,
      disciplinas: c.disciplinas.map((d) => ({ id: d.id, ordem: d.ordem, peso: d.peso, ativo: true })),
    },
  };
}

export async function carregarDadosCronograma(): Promise<DadosCronograma> {
  const hoje = hojeEmSaoPaulo();
  if (!supabaseConfigurado()) return dadosDemo(hoje);

  const { supabase, user } = await usuarioAtual();
  if (!user) redirect("/login");

  const [{ data: editais }, { data: topicos }, { data: cron }] = await Promise.all([
    supabase
      .from("editais")
      .select("id, nome, banca, data_prova, edital_disciplinas(disciplina_id, peso, qtd_questoes, ordem, disciplinas(nome, cor))")
      .order("created_at", { ascending: false }),
    supabase.from("topicos_ementa").select(`${COLUNAS_TOPICO}, edital_id`),
    supabase
      .from("cronogramas")
      .select(
        "id, edital_id, nome, modo, data_inicio, minutos_por_dia, duracao_bloco_min, fragmento_minimo_min, revisoes_habilitadas, revisoes_intervalos, revisoes_dias_semana, minutos_por_revisao, limite_revisao_pct, posicao_ciclo, minutos_no_turno, cronograma_disciplinas(disciplina_id, ordem, peso, ativo)",
      )
      .eq("ativo", true)
      .maybeSingle(),
  ]);

  type EdDisc = {
    disciplina_id: string;
    peso: number | null;
    qtd_questoes: number | null;
    ordem: number;
    disciplinas: { nome: string; cor: string | null } | null;
  };

  const porEdital = new Map<string, TopicoRow[]>();
  for (const t of (topicos ?? []) as (TopicoRow & { edital_id: string })[]) {
    if (!porEdital.has(t.edital_id)) porEdital.set(t.edital_id, []);
    porEdital.get(t.edital_id)!.push(t);
  }

  return {
    modo: "real",
    hoje,
    editais: (editais ?? []).map((e) => ({
      id: e.id,
      nome: e.nome,
      banca: e.banca,
      dataProva: e.data_prova,
      disciplinas: ((e.edital_disciplinas ?? []) as unknown as EdDisc[])
        .sort((a, b) => a.ordem - b.ordem)
        .map((d, i) => ({
          id: d.disciplina_id,
          nome: d.disciplinas?.nome ?? "Disciplina",
          cor: indiceDeCor(d.disciplinas?.cor, i),
          pesoEdital: d.peso === null ? null : Number(d.peso),
          qtdQuestoes: d.qtd_questoes,
          ordem: d.ordem,
        })),
      topicos: topicosFolha(porEdital.get(e.id) ?? []),
    })),
    atual: cron
      ? {
          id: cron.id,
          editalId: cron.edital_id,
          nome: cron.nome,
          config: configDoCronograma(cron as unknown as CronogramaRow),
          disciplinas: ((cron.cronograma_disciplinas ?? []) as { disciplina_id: string; ordem: number; peso: number; ativo: boolean }[])
            .sort((a, b) => a.ordem - b.ordem)
            .map((d) => ({ id: d.disciplina_id, ordem: d.ordem, peso: d.peso, ativo: d.ativo })),
        }
      : null,
  };
}
