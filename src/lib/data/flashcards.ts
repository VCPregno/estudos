import "server-only";
import { supabaseConfigurado } from "@/lib/env";
import type { EstadoCard } from "@/lib/flashcards/agendador";
import { usuarioAtual } from "@/lib/supabase/server";
import { indiceDeCor } from "./painel";

export interface Flashcard {
  id: string;
  frente: string;
  verso: string;
  disciplinaId: string | null;
  topicoId: string | null;
  estado: EstadoCard;
  etapa: number;
  intervaloDias: number;
  facilidade: number;
  repeticoes: number;
  lapsos: number;
  vencimento: string;
}

export interface OpcaoDisciplina {
  id: string;
  nome: string;
  cor: number;
  topicos: { id: string; titulo: string }[];
}

export interface DadosFlashcards {
  modo: "demo" | "real";
  agora: string;
  disciplinas: OpcaoDisciplina[];
  /** Todos os cards (para a fila e para a lista) */
  cards: Flashcard[];
  novosPorDia: number;
}

const NOVOS_POR_DIA = 20;

export async function carregarDisciplinasComTopicos(): Promise<OpcaoDisciplina[]> {
  if (!supabaseConfigurado()) return DISCIPLINAS_DEMO;
  const { supabase, user } = await usuarioAtual();
  if (!user) return [];
  const [{ data: ativo }, { data: editais }] = await Promise.all([
    supabase.from("cronogramas").select("edital_id").eq("ativo", true).maybeSingle(),
    supabase.from("editais").select("id").order("created_at", { ascending: false }).limit(1),
  ]);
  const editalId = ativo?.edital_id ?? editais?.[0]?.id;
  const [{ data: todas }, discs, tops] = await Promise.all([
    supabase.from("disciplinas").select("id, nome, cor").order("nome"),
    editalId
      ? supabase.from("edital_disciplinas").select("disciplina_id, ordem").eq("edital_id", editalId).order("ordem")
      : Promise.resolve({ data: [] as { disciplina_id: string; ordem: number }[] }),
    editalId
      ? supabase.from("topicos_ementa").select("id, disciplina_id, parent_id, titulo, ordem").eq("edital_id", editalId).order("ordem")
      : Promise.resolve({ data: [] as { id: string; disciplina_id: string; parent_id: string | null; titulo: string; ordem: number }[] }),
  ]);
  const ordem = new Map((discs.data ?? []).map((d, i) => [d.disciplina_id, i]));
  const topicos = tops.data ?? [];
  const porId = new Map(topicos.map((t) => [t.id, t]));
  return (todas ?? [])
    .sort((a, b) => (ordem.get(a.id) ?? 999) - (ordem.get(b.id) ?? 999) || a.nome.localeCompare(b.nome))
    .map((d, i) => ({
      id: d.id,
      nome: d.nome,
      cor: indiceDeCor(d.cor, ordem.get(d.id) ?? i),
      topicos: topicos
        .filter((t) => t.disciplina_id === d.id)
        .sort((a, b) => {
          const oa = a.parent_id ? (porId.get(a.parent_id)?.ordem ?? 0) * 1000 + a.ordem : a.ordem * 1000;
          const ob = b.parent_id ? (porId.get(b.parent_id)?.ordem ?? 0) * 1000 + b.ordem : b.ordem * 1000;
          return oa - ob;
        })
        .map((t) => ({ id: t.id, titulo: t.parent_id ? `${porId.get(t.parent_id)?.titulo ?? ""} › ${t.titulo}` : t.titulo })),
    }));
}

export async function carregarFlashcards(): Promise<DadosFlashcards> {
  const agora = new Date().toISOString();
  if (!supabaseConfigurado()) return { modo: "demo", agora, disciplinas: DISCIPLINAS_DEMO, cards: cardsDemo(agora), novosPorDia: NOVOS_POR_DIA };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { modo: "demo", agora, disciplinas: [], cards: [], novosPorDia: NOVOS_POR_DIA };

  const [disciplinas, { data }] = await Promise.all([
    carregarDisciplinasComTopicos(),
    supabase
      .from("flashcards")
      .select("id, frente, verso, disciplina_id, topico_id, estado, etapa, intervalo_dias, facilidade, repeticoes, lapsos, vencimento")
      .order("created_at")
      .limit(5000),
  ]);
  return {
    modo: "real",
    agora,
    disciplinas,
    novosPorDia: NOVOS_POR_DIA,
    cards: (data ?? []).map((c) => ({
      id: c.id,
      frente: c.frente,
      verso: c.verso,
      disciplinaId: c.disciplina_id,
      topicoId: c.topico_id,
      estado: c.estado,
      etapa: c.etapa,
      intervaloDias: Number(c.intervalo_dias),
      facilidade: Number(c.facilidade),
      repeticoes: c.repeticoes,
      lapsos: c.lapsos,
      vencimento: c.vencimento,
    })),
  };
}

// -----------------------------------------------------------------------------

const DISCIPLINAS_DEMO: OpcaoDisciplina[] = [
  { id: "d-ti", nome: "Tecnologia da Informação", cor: 1, topicos: [{ id: "t-scrum", titulo: "Métodos Ágeis" }] },
  { id: "d-adm", nome: "Direito Administrativo", cor: 3, topicos: [{ id: "t-9784", titulo: "Processo administrativo (Lei 9.784/1999)" }] },
];

function cardsDemo(agora: string): Flashcard[] {
  const base = { estado: "novo" as EstadoCard, etapa: 0, intervaloDias: 0, facilidade: 2.5, repeticoes: 0, lapsos: 0, vencimento: agora, topicoId: null };
  return [
    { ...base, id: "c1", disciplinaId: "d-ti", frente: "No Scrum, quem é responsável por maximizar o valor do produto?", verso: "O Product Owner." },
    { ...base, id: "c2", disciplinaId: "d-ti", frente: "Qual é o time-box máximo da Sprint?", verso: "Um mês." },
    {
      ...base,
      id: "c3",
      disciplinaId: "d-adm",
      frente: "Qual o prazo geral para interpor recurso administrativo na Lei 9.784/1999?",
      verso: "10 dias, contados da ciência ou divulgação oficial da decisão (art. 59).",
    },
  ];
}
