import "server-only";
import { supabaseConfigurado } from "@/lib/env";
import { PROVA_DEMO, QUESTOES_DEMO } from "@/lib/simulado/demo";
import { usuarioAtual } from "@/lib/supabase/server";

const DEMO: OpcoesSimulado = {
  modo: "demo",
  provas: [{ nome: PROVA_DEMO, total: QUESTOES_DEMO.length }],
  disciplinas: [
    { id: "00000000-0000-4000-8000-0000000000d1", nome: "Tecnologia da Informação", total: 2, naoResolvidas: 2 },
    { id: "00000000-0000-4000-8000-0000000000d2", nome: "Língua Portuguesa", total: 2, naoResolvidas: 2 },
  ],
  historico: [],
};

export interface OpcoesSimulado {
  modo: "demo" | "real";
  provas: { nome: string; total: number }[];
  disciplinas: { id: string; nome: string; total: number; naoResolvidas: number }[];
  historico: { id: string; titulo: string; nota: number; acertos: number; total: number; duracaoSeg: number; criadoEm: string }[];
}

export async function carregarOpcoesSimulado(): Promise<OpcoesSimulado> {
  if (!supabaseConfigurado()) return DEMO;
  const { supabase, user } = await usuarioAtual();
  if (!user) return DEMO;

  const [{ data: qs }, { data: status }, { data: sims }] = await Promise.all([
    supabase.from("questoes").select("id, prova, disciplina_id, disciplinas(nome)").limit(5000),
    supabase.from("v_questoes_status").select("questao_id, tentativas"),
    supabase.from("simulados").select("id, titulo, nota, acertos, total, duracao_seg, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const feitas = new Set((status ?? []).filter((s) => Number(s.tentativas) > 0).map((s) => s.questao_id));
  const provas = new Map<string, number>();
  const discs = new Map<string, { nome: string; total: number; naoResolvidas: number }>();
  for (const q of qs ?? []) {
    if (q.prova) provas.set(q.prova, (provas.get(q.prova) ?? 0) + 1);
    if (q.disciplina_id) {
      const d = discs.get(q.disciplina_id) ?? { nome: (q.disciplinas as unknown as { nome: string } | null)?.nome ?? "Disciplina", total: 0, naoResolvidas: 0 };
      d.total++;
      if (!feitas.has(q.id)) d.naoResolvidas++;
      discs.set(q.disciplina_id, d);
    }
  }
  return {
    modo: "real",
    provas: [...provas].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.nome.localeCompare(a.nome)),
    disciplinas: [...discs].map(([id, d]) => ({ id, ...d })).sort((a, b) => b.total - a.total),
    historico: (sims ?? []).map((s) => ({
      id: s.id,
      titulo: s.titulo,
      nota: Number(s.nota),
      acertos: s.acertos,
      total: s.total,
      duracaoSeg: s.duracao_seg,
      criadoEm: s.created_at,
    })),
  };
}

export interface SimuladoCompleto {
  id: string;
  titulo: string;
  nota: number;
  acertos: number;
  erros: number;
  emBranco: number;
  total: number;
  duracaoSeg: number;
  limiteMin: number | null;
  penalidade: boolean;
  criadoEm: string;
  porDisciplina: { disciplina: string; total: number; acertos: number }[];
  itens: ItemRevisao[];
}

export interface ItemRevisao {
  questaoId: string;
  marcada: string | null;
  acertou: boolean;
  disciplina: string | null;
  gabarito: string | null;
  anulada: boolean;
  gabaritoNaoOficial: boolean;
  numero: number | null;
  prova: string | null;
  banca: string | null;
  textoApoio: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  explicacao: string | null;
}

export async function carregarSimulado(id: string): Promise<SimuladoCompleto | null> {
  if (!supabaseConfigurado() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { supabase, user } = await usuarioAtual();
  if (!user) return null;
  const { data: s } = await supabase.from("simulados").select("*").eq("id", id).maybeSingle();
  if (!s) return null;
  const itens = (s.itens ?? []) as { questao_id: string; marcada: string | null; acertou: boolean; disciplina: string | null }[];
  const ids = itens.map((i) => i.questao_id);
  const [{ data: qs }, { data: msgs }] = await Promise.all([
    supabase
      .from("questoes")
      .select("id, gabarito, anulada, gabarito_fonte, numero, prova, banca, texto_apoio, enunciado, alternativas")
      .in("id", ids),
    supabase
      .from("tutor_mensagens")
      .select("contexto_id, conteudo, created_at")
      .eq("contexto_tipo", "questao")
      .eq("papel", "assistant")
      .in("contexto_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const porId = new Map((qs ?? []).map((q) => [q.id, q]));
  const explicacao = new Map<string, string>();
  for (const m of msgs ?? []) if (m.contexto_id && !explicacao.has(m.contexto_id)) explicacao.set(m.contexto_id, m.conteudo);
  const disc = new Map<string, { total: number; acertos: number }>();
  for (const i of itens) {
    const nome = i.disciplina ?? "Sem disciplina";
    const d = disc.get(nome) ?? { total: 0, acertos: 0 };
    d.total++;
    if (i.acertou) d.acertos++;
    disc.set(nome, d);
  }
  return {
    id: s.id,
    titulo: s.titulo,
    nota: Number(s.nota),
    acertos: s.acertos,
    erros: s.erros,
    emBranco: s.em_branco,
    total: s.total,
    duracaoSeg: s.duracao_seg,
    limiteMin: s.config?.limiteMin ?? null,
    penalidade: !!s.config?.penalidade,
    criadoEm: s.created_at,
    porDisciplina: [...disc].map(([disciplina, v]) => ({ disciplina, ...v })).sort((a, b) => b.total - a.total),
    itens: itens.map((i) => {
      const q = porId.get(i.questao_id);
      return {
        questaoId: i.questao_id,
        marcada: i.marcada,
        acertou: i.acertou,
        disciplina: i.disciplina,
        gabarito: q?.gabarito ?? null,
        anulada: !!q?.anulada,
        gabaritoNaoOficial: q?.gabarito_fonte === "ia",
        numero: q?.numero ?? null,
        prova: q?.prova ?? null,
        banca: q?.banca ?? null,
        textoApoio: q?.texto_apoio ?? null,
        enunciado: q?.enunciado ?? "(questão apagada do banco)",
        alternativas: (q?.alternativas ?? []) as { letra: string; texto: string }[],
        explicacao: explicacao.get(i.questao_id) ?? null,
      };
    }),
  };
}
