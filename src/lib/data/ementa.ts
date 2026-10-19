import "server-only";
import { redirect } from "next/navigation";
import { type DataISO, estimarConclusao, hojeEmSaoPaulo, somarDias } from "@/lib/ciclo";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { carregarCicloAtivo } from "./dashboard";
import { entradaDemo } from "./demo";
import { indiceDeCor } from "./painel";

export type TipoFonte = "norma" | "guia" | "classica" | "orgao";

export interface LinhaEmenta {
  id: string;
  disciplinaId: string;
  parentId: string | null;
  codigo: string | null;
  titulo: string;
  ordem: number;
  teoria: boolean;
  revisoesFeitas: number;
  revisoesTotal: number;
  proximaRevisao: DataISO | null;
  questoes: number;
  aproveitamento: number | null;
  tipoFonte: TipoFonte | null;
  fonte: string | null;
  /** questões do banco ligadas ao tópico (resolvidas ou não) */
  questoesBanco: number;
}

export interface TopicoEmenta extends LinhaEmenta {
  subtopicos: LinhaEmenta[];
}

export interface DisciplinaEmenta {
  id: string;
  nome: string;
  cor: number;
  topicos: TopicoEmenta[];
}

export interface DadosEmenta {
  modo: "demo" | "real";
  hoje: DataISO;
  editais: { id: string; nome: string }[];
  edital: { id: string; nome: string; banca: string | null; dataProva: DataISO | null } | null;
  disciplinas: DisciplinaEmenta[];
  conclusao: { noPlano: DataISO | null; noRitmo: DataISO | null; ritmo: number | null } | null;
}

interface LinhaView {
  id: string;
  disciplina_id: string;
  disciplina: string;
  parent_id: string | null;
  codigo: string | null;
  titulo: string;
  ordem: number;
  teoria_concluida: boolean;
  revisoes_feitas: number;
  revisoes_total: number;
  proxima_revisao: string | null;
  questoes_resolvidas: number;
  aproveitamento: number | null;
  tipo_fonte: TipoFonte | null;
  fonte: string | null;
  questoes_banco: number;
}

function montarArvore(linhas: LinhaView[], ordemDisciplinas: { id: string; nome: string; cor: number }[]): DisciplinaEmenta[] {
  const paraLinha = (l: LinhaView): LinhaEmenta => ({
    id: l.id,
    disciplinaId: l.disciplina_id,
    parentId: l.parent_id,
    codigo: l.codigo,
    titulo: l.titulo,
    ordem: l.ordem,
    teoria: l.teoria_concluida,
    revisoesFeitas: Number(l.revisoes_feitas),
    revisoesTotal: Number(l.revisoes_total),
    proximaRevisao: l.proxima_revisao,
    questoes: Number(l.questoes_resolvidas),
    aproveitamento: l.aproveitamento === null ? null : Number(l.aproveitamento),
    tipoFonte: l.tipo_fonte,
    fonte: l.fonte,
    questoesBanco: Number(l.questoes_banco ?? 0),
  });
  const filhos = new Map<string, LinhaEmenta[]>();
  for (const l of linhas) {
    if (!l.parent_id) continue;
    if (!filhos.has(l.parent_id)) filhos.set(l.parent_id, []);
    filhos.get(l.parent_id)!.push(paraLinha(l));
  }
  return ordemDisciplinas.map((d) => ({
    ...d,
    topicos: linhas
      .filter((l) => l.disciplina_id === d.id && !l.parent_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map((l) => ({ ...paraLinha(l), subtopicos: (filhos.get(l.id) ?? []).sort((a, b) => a.ordem - b.ordem) })),
  }));
}

function dadosDemo(hoje: DataISO): DadosEmenta {
  const e = entradaDemo(hoje);
  const c = e.ciclo!;
  const linhas: LinhaView[] = c.topicos.map((t, i) => {
    const feitas = t.teoriaConcluida ? 1 + (i % 3) : 0;
    const questoes = t.teoriaConcluida ? 12 + ((i * 7) % 30) : 0;
    return {
      id: t.id,
      disciplina_id: t.disciplinaId,
      disciplina: "",
      parent_id: null,
      codigo: String(t.ordem + 1),
      titulo: t.titulo,
      ordem: t.ordem,
      teoria_concluida: t.teoriaConcluida,
      revisoes_feitas: feitas,
      revisoes_total: t.teoriaConcluida ? 5 : 0,
      proxima_revisao: t.teoriaConcluida ? somarDias(hoje, 1 + (i % 9)) : null,
      questoes_resolvidas: questoes,
      aproveitamento: questoes ? 55 + ((i * 13) % 40) : null,
      tipo_fonte: (["norma", "classica", "guia", "classica", "orgao"] as const)[i % 5],
      fonte: ["Lei 9.784/1999 — texto compilado no Planalto", "Material-base da disciplina; foco no que a banca cobra", "Guia do Scrum 2020 — gratuito em scrumguides.org", "Livro-texto ou aula aberta do tópico", "Site do órgão: cartilhas e atos normativos"][i % 5],
      questoes_banco: questoes ? questoes + 5 : 0,
    };
  });
  const minutosPorData = Object.fromEntries(e.progresso.map((p) => [p.dia, Math.round(p.segundos / 60)]));
  const est = estimarConclusao(
    { config: c.config, disciplinas: c.disciplinas, topicos: c.topicos, revisoesPendentes: c.revisoes, estado: c.estado, hoje },
    minutosPorData,
  );
  return {
    modo: "demo",
    hoje,
    editais: [{ id: c.edital.id, nome: c.edital.nome }],
    edital: c.edital,
    disciplinas: montarArvore(linhas, c.disciplinas.map((d) => ({ id: d.id, nome: d.nome, cor: d.cor }))),
    conclusao: { noPlano: est.noPlano, noRitmo: est.noRitmoAtual, ritmo: est.ritmo },
  };
}

export async function carregarEmenta(editalPedido?: string): Promise<DadosEmenta> {
  const hoje = hojeEmSaoPaulo();
  if (!supabaseConfigurado()) return dadosDemo(hoje);

  const { supabase, user } = await usuarioAtual();
  if (!user) redirect("/login");

  const [{ data: editais }, ciclo] = await Promise.all([
    supabase.from("editais").select("id, nome, banca, data_prova").order("created_at", { ascending: false }),
    carregarCicloAtivo(supabase),
  ]);
  const lista = editais ?? [];
  const escolhido =
    lista.find((e) => e.id === editalPedido) ?? lista.find((e) => e.id === ciclo?.edital.id) ?? lista[0] ?? null;

  if (!escolhido) return { modo: "real", hoje, editais: [], edital: null, disciplinas: [], conclusao: null };

  const [{ data: linhas }, { data: discs }, progresso] = await Promise.all([
    supabase
      .from("v_ementa")
      .select(
        "id, disciplina_id, disciplina, parent_id, codigo, titulo, ordem, teoria_concluida, revisoes_feitas, revisoes_total, proxima_revisao, questoes_resolvidas, aproveitamento, tipo_fonte, fonte, questoes_banco",
      )
      .eq("edital_id", escolhido.id),
    supabase
      .from("edital_disciplinas")
      .select("disciplina_id, ordem, disciplinas(nome, cor)")
      .eq("edital_id", escolhido.id)
      .order("ordem"),
    ciclo?.edital.id === escolhido.id
      ? supabase.from("progresso_diario").select("dia, segundos_estudados").gte("dia", somarDias(hoje, -21))
      : Promise.resolve({ data: null }),
  ]);

  type DiscJoin = { disciplina_id: string; ordem: number; disciplinas: { nome: string; cor: string | null } | null };
  const ordem = ((discs ?? []) as unknown as DiscJoin[]).map((d, i) => ({
    id: d.disciplina_id,
    nome: d.disciplinas?.nome ?? "Disciplina",
    cor: indiceDeCor(d.disciplinas?.cor, i),
  }));

  let conclusao: DadosEmenta["conclusao"] = null;
  if (ciclo && ciclo.edital.id === escolhido.id) {
    const minutosPorData = Object.fromEntries(
      ((progresso.data ?? []) as { dia: string; segundos_estudados: number }[]).map((p) => [p.dia, Math.round(p.segundos_estudados / 60)]),
    );
    const est = estimarConclusao(
      {
        config: ciclo.config,
        disciplinas: ciclo.disciplinas,
        topicos: ciclo.topicos,
        revisoesPendentes: ciclo.revisoes,
        estado: ciclo.estado,
        hoje,
      },
      minutosPorData,
    );
    conclusao = {
      noPlano: ciclo.config.modo === "fixo" ? (ciclo.ultimaDataFixa ?? est.noPlano) : est.noPlano,
      noRitmo: est.noRitmoAtual,
      ritmo: est.ritmo,
    };
  }

  return {
    modo: "real",
    hoje,
    editais: lista.map((e) => ({ id: e.id, nome: e.nome })),
    edital: { id: escolhido.id, nome: escolhido.nome, banca: escolhido.banca, dataProva: escolhido.data_prova },
    disciplinas: montarArvore((linhas ?? []) as LinhaView[], ordem),
    conclusao,
  };
}
