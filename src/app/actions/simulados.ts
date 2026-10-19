"use server";

import { z } from "zod";
import { supabaseConfigurado } from "@/lib/env";
import { corrigirSimulado } from "@/lib/simulado";
import { usuarioAtual } from "@/lib/supabase/server";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export interface QuestaoSimulado {
  id: string;
  numero: number | null;
  prova: string | null;
  disciplina: string | null;
  textoApoio: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  dependeDeImagem: boolean;
}

const Config = z.object({
  origem: z.enum(["prova", "mix"]),
  prova: z.string().max(300).optional(),
  disciplinaIds: z.array(z.uuid()).max(50).optional(),
  quantidade: z.number().int().min(1).max(120).optional(),
  apenasNaoResolvidas: z.boolean().optional(),
});
export type ConfigSimulado = z.infer<typeof Config>;

const COLUNAS = "id, numero, prova, texto_apoio, enunciado, alternativas, depende_de_imagem, disciplinas(nome)";

function embaralhar<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Monta o caderno. O gabarito não sai do servidor. */
export async function montarSimulado(config: ConfigSimulado): Promise<Resultado<{ questoes: QuestaoSimulado[] }>> {
  const c = Config.safeParse(config);
  if (!c.success) return { ok: false, erro: "Configuração inválida." };
  if (!supabaseConfigurado()) return { ok: false, erro: "Simulados precisam do Supabase configurado." };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  let linhas: Record<string, unknown>[] = [];
  if (c.data.origem === "prova") {
    if (!c.data.prova) return { ok: false, erro: "Escolha a prova." };
    const { data } = await supabase.from("questoes").select(COLUNAS).eq("prova", c.data.prova).order("numero");
    linhas = data ?? [];
  } else {
    let q = supabase.from("questoes").select("id");
    if (c.data.disciplinaIds?.length) q = q.in("disciplina_id", c.data.disciplinaIds);
    const [{ data: ids }, { data: status }] = await Promise.all([
      q,
      c.data.apenasNaoResolvidas ? supabase.from("v_questoes_status").select("questao_id, tentativas") : Promise.resolve({ data: null }),
    ]);
    const feitas = new Set((status ?? []).filter((s) => Number(s.tentativas) > 0).map((s) => s.questao_id));
    const candidatas = (ids ?? []).map((x) => x.id as string).filter((id) => !feitas.has(id));
    const escolhidas = embaralhar(candidatas).slice(0, c.data.quantidade ?? 30);
    if (!escolhidas.length) return { ok: false, erro: "Não há questões com esse filtro." };
    const { data } = await supabase.from("questoes").select(COLUNAS).in("id", escolhidas);
    const pos = new Map(escolhidas.map((id, i) => [id, i]));
    linhas = (data ?? []).sort((a, b) => pos.get(a.id as string)! - pos.get(b.id as string)!);
  }
  if (!linhas.length) return { ok: false, erro: "Nenhuma questão encontrada." };

  return {
    ok: true,
    questoes: linhas.map((q) => ({
      id: q.id as string,
      numero: (q.numero as number | null) ?? null,
      prova: (q.prova as string | null) ?? null,
      disciplina: (q.disciplinas as { nome: string } | null)?.nome ?? null,
      textoApoio: (q.texto_apoio as string | null) ?? null,
      enunciado: q.enunciado as string,
      alternativas: (q.alternativas ?? []) as { letra: string; texto: string }[],
      dependeDeImagem: Boolean(q.depende_de_imagem),
    })),
  };
}

const Entrega = z.object({
  titulo: z.string().trim().min(1).max(300),
  config: Config.extend({ limiteMin: z.number().int().min(1).max(600), penalidade: z.boolean() }),
  respostas: z.array(z.object({ questaoId: z.uuid(), marcada: z.string().regex(/^[A-E]$/).nullable() })).min(1).max(120),
  duracaoSeg: z.number().int().min(0).max(36000),
});

/** Corrige com o gabarito do banco, grava as respostas (contam nas estatísticas) e o simulado. */
export async function entregarSimulado(
  dados: z.infer<typeof Entrega>,
): Promise<Resultado<{ id: string; conquistas: { titulo: string; descricao: string }[] }>> {
  const e = Entrega.safeParse(dados);
  if (!e.success) return { ok: false, erro: "Dados da entrega inválidos." };
  if (!supabaseConfigurado()) return { ok: false, erro: "Simulados precisam do Supabase configurado." };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada. Suas respostas ficam guardadas neste aparelho: entre de novo e entregue." };

  const ids = e.data.respostas.map((r) => r.questaoId);
  const { data: gabaritos, error } = await supabase.from("questoes").select("id, gabarito, anulada, disciplinas(nome)").in("id", ids);
  if (error || !gabaritos) return { ok: false, erro: "Não deu para corrigir agora. Tente de novo." };
  const porId = new Map(gabaritos.map((g) => [g.id, g]));

  const r = corrigirSimulado(
    e.data.respostas
      .filter((x) => porId.has(x.questaoId))
      .map((x) => {
        const g = porId.get(x.questaoId)!;
        return {
          questaoId: x.questaoId,
          marcada: x.marcada,
          gabarito: g.gabarito,
          anulada: g.anulada,
          disciplina: (g.disciplinas as unknown as { nome: string } | null)?.nome ?? null,
        };
      }),
    e.data.config.penalidade,
  );

  const tempoMedio = r.total ? Math.round(e.data.duracaoSeg / r.total) : null;
  const respondidas = r.itens.filter((i) => i.marcada);
  if (respondidas.length) {
    const { error: e2 } = await supabase.from("respostas_questoes").insert(
      respondidas.map((i) => ({ questao_id: i.questao_id, alternativa_marcada: i.marcada, acertou: i.acertou, tempo_segundos: tempoMedio })),
    );
    if (e2) return { ok: false, erro: `Não deu para salvar as respostas: ${e2.message}` };
  }

  const { data: sim, error: e3 } = await supabase
    .from("simulados")
    .insert({
      titulo: e.data.titulo,
      config: e.data.config,
      itens: r.itens,
      total: r.total,
      acertos: r.acertos,
      erros: r.erros,
      em_branco: r.emBranco,
      nota: r.nota,
      duracao_seg: e.data.duracaoSeg,
    })
    .select("id")
    .single();
  if (e3 || !sim) return { ok: false, erro: `Corrigido, mas não deu para salvar: ${e3?.message}` };

  const { data: novas } = await supabase.rpc("verificar_conquistas");
  return {
    ok: true,
    id: sim.id,
    conquistas: ((novas ?? []) as { titulo: string; descricao: string }[]).map((x) => ({ titulo: x.titulo, descricao: x.descricao })),
  };
}

export async function apagarSimulado(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Simulado inválido." };
  if (!supabaseConfigurado()) return { ok: true };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { ok: false, erro: "Sessão expirada." };
  const { error } = await supabase.from("simulados").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
