import "server-only";
import { type DataISO, hojeEmSaoPaulo, somarDias } from "@/lib/ciclo";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

export type Metrica = "ofensiva" | "questoes" | "acertos" | "horas" | "flashcards" | "editais" | "topicos";

export interface Conquista {
  codigo: string;
  titulo: string;
  descricao: string;
  icone: string;
  metrica: Metrica;
  meta: number;
  /** Valor atual da métrica (recorde, no caso da ofensiva) */
  valor: number;
  desbloqueadaEm: string | null;
}

export interface DiaAtividade {
  data: DataISO;
  segundos: number;
  questoes: number;
  flashcards: number;
  /** conta para a ofensiva (questões ou flashcards) */
  ativo: boolean;
}

export interface DadosConquistas {
  modo: "demo" | "real";
  hoje: DataISO;
  ofensiva: { atual: number; recorde: number; ativoHoje: boolean };
  totais: Record<Metrica, number>;
  conquistas: Conquista[];
  /** Últimas 18 semanas, de domingo a sábado, terminando na semana de hoje */
  dias: DiaAtividade[];
}

const SEMANAS = 18;

function grade(hoje: DataISO, porDia: Map<string, Omit<DiaAtividade, "data">>): DiaAtividade[] {
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const inicio = somarDias(hoje, -dow - (SEMANAS - 1) * 7);
  return Array.from({ length: SEMANAS * 7 }, (_, i) => {
    const data = somarDias(inicio, i);
    return { data, ...(porDia.get(data) ?? { segundos: 0, questoes: 0, flashcards: 0, ativo: false }) };
  });
}

export async function carregarConquistas(): Promise<DadosConquistas> {
  const hoje = hojeEmSaoPaulo();
  if (!supabaseConfigurado()) return demo(hoje);
  const { supabase, user } = await usuarioAtual();
  if (!user) return demo(hoje);

  // Garante que nada ficou para trás (a função só insere o que ainda falta).
  await supabase.rpc("verificar_conquistas");

  const desde = somarDias(hoje, -SEMANAS * 7 - 7);
  const [{ data: of }, { data: catalogo }, { data: feitas }, { data: progresso }, { data: totaisRows }, editais, topicos] = await Promise.all([
    supabase.rpc("calcular_ofensiva").single<{ atual: number; recorde: number; ativo_hoje: boolean }>(),
    supabase.from("conquistas").select("codigo, titulo, descricao, icone, metrica, meta, ordem").order("ordem"),
    supabase.from("conquistas_desbloqueadas").select("codigo, desbloqueada_em"),
    supabase
      .from("progresso_diario")
      .select("dia, segundos_estudados, questoes_resolvidas, flashcards_revisados")
      .gte("dia", desde),
    supabase.from("progresso_diario").select("segundos_estudados, questoes_resolvidas, questoes_certas, flashcards_revisados"),
    supabase.from("editais").select("id", { count: "exact", head: true }),
    supabase.from("topicos_ementa").select("id", { count: "exact", head: true }).eq("teoria_concluida", true),
  ]);

  const soma = (k: "segundos_estudados" | "questoes_resolvidas" | "questoes_certas" | "flashcards_revisados") =>
    (totaisRows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const ofensiva = { atual: of?.atual ?? 0, recorde: of?.recorde ?? 0, ativoHoje: of?.ativo_hoje ?? false };
  const totais: Record<Metrica, number> = {
    ofensiva: ofensiva.recorde,
    questoes: soma("questoes_resolvidas"),
    acertos: soma("questoes_certas"),
    horas: Math.floor(soma("segundos_estudados") / 3600),
    flashcards: soma("flashcards_revisados"),
    editais: editais.count ?? 0,
    topicos: topicos.count ?? 0,
  };

  const quando = new Map((feitas ?? []).map((f) => [f.codigo, f.desbloqueada_em as string]));
  const conquistas: Conquista[] = (catalogo ?? []).map((c) => ({
    codigo: c.codigo,
    titulo: c.titulo,
    descricao: c.descricao,
    icone: c.icone,
    metrica: c.metrica as Metrica,
    meta: c.meta,
    valor: totais[c.metrica as Metrica] ?? 0,
    desbloqueadaEm: quando.get(c.codigo) ?? null,
  }));

  const porDia = new Map(
    (progresso ?? []).map((p) => [
      p.dia as string,
      {
        segundos: p.segundos_estudados,
        questoes: p.questoes_resolvidas,
        flashcards: p.flashcards_revisados,
        ativo: p.questoes_resolvidas > 0 || p.flashcards_revisados > 0,
      },
    ]),
  );

  return { modo: "real", hoje, ofensiva, totais, conquistas, dias: grade(hoje, porDia) };
}

function demo(hoje: DataISO): DadosConquistas {
  const porDia = new Map<string, Omit<DiaAtividade, "data">>();
  for (let i = 0; i < 60; i++) {
    if (i > 12 && i % 9 === 0) continue;
    const seg = ((i * 37) % 7) * 1500 + 1800;
    porDia.set(somarDias(hoje, -i), { segundos: seg, questoes: (i * 13) % 40, flashcards: (i * 7) % 25, ativo: true });
  }
  const totais: Record<Metrica, number> = { ofensiva: 21, questoes: 1240, acertos: 860, horas: 96, flashcards: 412, editais: 1, topicos: 38 };
  const base: Omit<Conquista, "valor" | "desbloqueadaEm">[] = [
    { codigo: "ofensiva_3", titulo: "Aquecendo", descricao: "3 dias seguidos de ofensiva", icone: "flame", metrica: "ofensiva", meta: 3 },
    { codigo: "ofensiva_7", titulo: "Semana cheia", descricao: "7 dias seguidos de ofensiva", icone: "flame", metrica: "ofensiva", meta: 7 },
    { codigo: "ofensiva_30", titulo: "Hábito formado", descricao: "30 dias seguidos de ofensiva", icone: "flame-kindling", metrica: "ofensiva", meta: 30 },
    { codigo: "questoes_1000", titulo: "Milheiro", descricao: "1.000 questões resolvidas", icone: "trophy", metrica: "questoes", meta: 1000 },
    { codigo: "horas_100", titulo: "Cem horas", descricao: "100 horas líquidas de estudo", icone: "hourglass", metrica: "horas", meta: 100 },
    { codigo: "topicos_50", titulo: "Ementa andando", descricao: "50 tópicos com teoria concluída", icone: "book-open-check", metrica: "topicos", meta: 50 },
  ];
  return {
    modo: "demo",
    hoje,
    ofensiva: { atual: 13, recorde: 21, ativoHoje: true },
    totais,
    conquistas: base.map((c) => ({
      ...c,
      valor: totais[c.metrica],
      desbloqueadaEm: totais[c.metrica] >= c.meta ? `${somarDias(hoje, -10)}T12:00:00Z` : null,
    })),
    dias: grade(hoje, porDia),
  };
}
