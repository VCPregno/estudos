import "server-only";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";
import { indiceDeCor } from "./painel";

export type Situacao = "nao_resolvidas" | "erradas" | "todas";

export interface FiltrosQuestoes {
  edital?: string;
  disciplina?: string;
  topico?: string;
  prova?: string;
  situacao: Situacao;
}

export interface StatusQuestao {
  tentativas: number;
  acertos: number;
  acertouUltima: boolean | null;
  ultimaMarcada: string | null;
}

export interface QuestaoTela {
  id: string;
  prova: string | null;
  numero: number | null;
  banca: string | null;
  disciplinaId: string | null;
  disciplina: string | null;
  cor: number;
  topicoId: string | null;
  topico: string | null;
  textoApoio: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string;
  anulada: boolean;
  dependeDeImagem: boolean;
  gabaritoFonte: "oficial" | "ia" | "manual";
  status: StatusQuestao;
  explicacao: string | null;
}

export interface ContagemFiltro {
  total: number;
  resolvidas: number;
  acertos: number;
}

export interface DisciplinaFiltro extends ContagemFiltro {
  id: string;
  nome: string;
  cor: number;
}

export interface TopicoFiltro {
  id: string;
  disciplinaId: string;
  titulo: string;
  total: number;
}

export interface DadosQuestoes {
  modo: "demo" | "real";
  editais: { id: string; nome: string }[];
  editalId: string | null;
  disciplinas: DisciplinaFiltro[];
  topicos: TopicoFiltro[];
  provas: { nome: string; total: number }[];
  filtros: FiltrosQuestoes;
  /** Questões do filtro (no máximo LIMITE), já com conteúdo */
  questoes: QuestaoTela[];
  /** Total que bate com o filtro, antes do limite */
  totalFiltro: number;
  geral: ContagemFiltro;
}

const LIMITE = 100;
const SEM_STATUS: StatusQuestao = { tentativas: 0, acertos: 0, acertouUltima: null, ultimaMarcada: null };

function passaSituacao(s: StatusQuestao, situacao: Situacao) {
  if (situacao === "nao_resolvidas") return s.tentativas === 0;
  if (situacao === "erradas") return s.acertouUltima === false;
  return true;
}

export async function carregarQuestoes(filtros: FiltrosQuestoes): Promise<DadosQuestoes> {
  if (!supabaseConfigurado()) return dadosDemo(filtros);
  const { supabase, user } = await usuarioAtual();
  if (!user) return dadosDemo(filtros);

  // ---- edital em foco: o pedido, o do cronograma ativo ou o mais recente ----
  const [{ data: editais }, { data: ativo }] = await Promise.all([
    supabase.from("editais").select("id, nome").order("created_at", { ascending: false }),
    supabase.from("cronogramas").select("edital_id").eq("ativo", true).maybeSingle(),
  ]);
  const lista = editais ?? [];
  const editalId =
    (filtros.edital && lista.some((e) => e.id === filtros.edital) && filtros.edital) || ativo?.edital_id || lista[0]?.id || null;

  // ---- metadados leves de todas as questões do edital ----
  let base = supabase.from("questoes").select("id, disciplina_id, topico_id, prova, numero");
  if (editalId) base = base.eq("edital_id", editalId);
  const [{ data: meta }, { data: status }, discs, tops] = await Promise.all([
    base,
    supabase.from("v_questoes_status").select("questao_id, tentativas, acertos, acertou_ultima, ultima_marcada"),
    editalId
      ? supabase.from("edital_disciplinas").select("ordem, disciplinas(id, nome, cor)").eq("edital_id", editalId).order("ordem")
      : Promise.resolve({ data: [] as { ordem: number; disciplinas: unknown }[] }),
    editalId
      ? supabase.from("topicos_ementa").select("id, disciplina_id, parent_id, titulo, ordem").eq("edital_id", editalId).order("ordem")
      : Promise.resolve({ data: [] as { id: string; disciplina_id: string; parent_id: string | null; titulo: string; ordem: number }[] }),
  ]);

  const statusPorId = new Map<string, StatusQuestao>(
    (status ?? []).map((s) => [
      s.questao_id,
      {
        tentativas: Number(s.tentativas),
        acertos: Number(s.acertos),
        acertouUltima: s.acertou_ultima,
        ultimaMarcada: s.ultima_marcada,
      },
    ]),
  );
  const todas = meta ?? [];
  const st = (id: string) => statusPorId.get(id) ?? SEM_STATUS;

  // ---- tópicos: título com o pai, e o conjunto "tópico + filhos" ----
  const topicos = tops.data ?? [];
  const porId = new Map(topicos.map((t) => [t.id, t]));
  const tituloTopico = (id: string | null) => {
    const t = id ? porId.get(id) : null;
    if (!t) return null;
    const pai = t.parent_id ? porId.get(t.parent_id) : null;
    return pai ? `${pai.titulo} › ${t.titulo}` : t.titulo;
  };
  const doTopico = new Set<string>();
  if (filtros.topico) {
    doTopico.add(filtros.topico);
    for (const t of topicos) if (t.parent_id === filtros.topico) doTopico.add(t.id);
  }

  // ---- contagens para os filtros ----
  const contar = (ids: { id: string }[]): ContagemFiltro => {
    let resolvidas = 0;
    let acertos = 0;
    for (const q of ids) {
      const s = st(q.id);
      if (s.tentativas) {
        resolvidas++;
        if (s.acertouUltima) acertos++;
      }
    }
    return { total: ids.length, resolvidas, acertos };
  };

  const disciplinas: DisciplinaFiltro[] = (discs.data ?? [])
    .map((d, i) => {
      const x = d.disciplinas as { id: string; nome: string; cor: string | null } | null;
      if (!x) return null;
      return { id: x.id, nome: x.nome, cor: indiceDeCor(x.cor, i), ...contar(todas.filter((q) => q.disciplina_id === x.id)) };
    })
    .filter((d): d is DisciplinaFiltro => !!d);
  const corDe = new Map(disciplinas.map((d) => [d.id, d]));

  const qtdPorTopico = new Map<string, number>();
  for (const q of todas) {
    if (!q.topico_id) continue;
    qtdPorTopico.set(q.topico_id, (qtdPorTopico.get(q.topico_id) ?? 0) + 1);
    const pai = porId.get(q.topico_id)?.parent_id;
    if (pai) qtdPorTopico.set(pai, (qtdPorTopico.get(pai) ?? 0) + 1);
  }
  const topicosFiltro: TopicoFiltro[] = topicos
    .filter((t) => qtdPorTopico.has(t.id))
    .map((t) => ({ id: t.id, disciplinaId: t.disciplina_id, titulo: tituloTopico(t.id)!, total: qtdPorTopico.get(t.id)! }));

  const provasMap = new Map<string, number>();
  for (const q of todas) if (q.prova) provasMap.set(q.prova, (provasMap.get(q.prova) ?? 0) + 1);

  // ---- aplica os filtros ----
  const filtradas = todas.filter(
    (q) =>
      (!filtros.disciplina || q.disciplina_id === filtros.disciplina) &&
      (!filtros.topico || (q.topico_id && doTopico.has(q.topico_id))) &&
      (!filtros.prova || q.prova === filtros.prova) &&
      passaSituacao(st(q.id), filtros.situacao),
  );
  filtradas.sort((a, b) => (a.prova ?? "").localeCompare(b.prova ?? "") || (a.numero ?? 0) - (b.numero ?? 0));
  const ids = filtradas.slice(0, LIMITE).map((q) => q.id);
  const posicao = new Map(ids.map((id, i) => [id, i]));

  let questoes: QuestaoTela[] = [];
  if (ids.length) {
    const { data: completas } = await supabase
      .from("questoes")
      .select(
        "id, prova, numero, banca, disciplina_id, topico_id, texto_apoio, enunciado, alternativas, gabarito, anulada, depende_de_imagem, gabarito_fonte",
      )
      .in("id", ids);
    const escolhidas = (completas ?? []).sort((a, b) => posicao.get(a.id)! - posicao.get(b.id)!);
    const { data: msgs } = await supabase
      .from("tutor_mensagens")
      .select("contexto_id, conteudo, created_at")
      .eq("contexto_tipo", "questao")
      .eq("papel", "assistant")
      .in(
        "contexto_id",
        escolhidas.map((q) => q.id),
      )
      .order("created_at", { ascending: false });
    const explicacao = new Map<string, string>();
    for (const m of msgs ?? []) if (m.contexto_id && !explicacao.has(m.contexto_id)) explicacao.set(m.contexto_id, m.conteudo);

    questoes = escolhidas.map((q) => ({
      id: q.id,
      prova: q.prova,
      numero: q.numero,
      banca: q.banca,
      disciplinaId: q.disciplina_id,
      disciplina: q.disciplina_id ? (corDe.get(q.disciplina_id)?.nome ?? null) : null,
      cor: q.disciplina_id ? (corDe.get(q.disciplina_id)?.cor ?? 8) : 8,
      topicoId: q.topico_id,
      topico: tituloTopico(q.topico_id),
      textoApoio: q.texto_apoio,
      enunciado: q.enunciado,
      alternativas: (q.alternativas ?? []) as { letra: string; texto: string }[],
      gabarito: q.gabarito,
      anulada: q.anulada,
      dependeDeImagem: q.depende_de_imagem,
      gabaritoFonte: q.gabarito_fonte,
      status: st(q.id),
      explicacao: explicacao.get(q.id) ?? null,
    }));
  }

  return {
    modo: "real",
    editais: lista,
    editalId,
    disciplinas,
    topicos: topicosFiltro,
    provas: [...provasMap].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.nome.localeCompare(a.nome)),
    filtros,
    questoes,
    totalFiltro: filtradas.length,
    geral: contar(todas),
  };
}

// -----------------------------------------------------------------------------
// Demonstração (sem Supabase): questões originais, só para ver a tela.
// -----------------------------------------------------------------------------

function dadosDemo(filtros: FiltrosQuestoes): DadosQuestoes {
  const disciplinas: DisciplinaFiltro[] = [
    { id: "d-ti", nome: "Tecnologia da Informação", cor: 1, total: 2, resolvidas: 0, acertos: 0 },
    { id: "d-port", nome: "Língua Portuguesa", cor: 2, total: 1, resolvidas: 0, acertos: 0 },
  ];
  const prova = "Exemplo · questões de demonstração";
  const q = (x: Partial<QuestaoTela> & Pick<QuestaoTela, "id" | "enunciado" | "alternativas" | "gabarito">): QuestaoTela => ({
    prova,
    numero: null,
    banca: "Exemplo",
    disciplinaId: "d-ti",
    disciplina: "Tecnologia da Informação",
    cor: 1,
    topicoId: null,
    topico: null,
    textoApoio: null,
    anulada: false,
    dependeDeImagem: false,
    gabaritoFonte: "oficial",
    status: SEM_STATUS,
    explicacao: null,
    ...x,
  });
  const questoes = [
    q({
      id: "demo-1",
      numero: 1,
      topico: "Banco de Dados › SQL",
      enunciado:
        "Considere a tabela abaixo e a consulta em seguida.\n| id | setor | salario |\n|---|---|---|\n| 1 | TI | 9000 |\n| 2 | TI | 7000 |\n| 3 | RH | 6000 |\n```\nSELECT setor, AVG(salario)\nFROM servidor\nGROUP BY setor\nHAVING AVG(salario) > 6500;\n```\nO resultado da consulta é",
      alternativas: [
        { letra: "A", texto: "uma linha: TI, 8000." },
        { letra: "B", texto: "duas linhas: TI, 8000 e RH, 6000." },
        { letra: "C", texto: "uma linha: TI, 16000." },
        { letra: "D", texto: "nenhuma linha, pois HAVING não aceita funções de agregação." },
        { letra: "E", texto: "três linhas, uma por servidor." },
      ],
      gabarito: "A",
    }),
    q({
      id: "demo-2",
      numero: 2,
      topico: "Engenharia de Software › Métodos ágeis",
      enunciado: "No Scrum, o artefato que reúne os itens selecionados para a Sprint e o plano para entregá-los é o",
      alternativas: [
        { letra: "A", texto: "Product Backlog." },
        { letra: "B", texto: "Sprint Backlog." },
        { letra: "C", texto: "Incremento." },
        { letra: "D", texto: "Definition of Done." },
        { letra: "E", texto: "Sprint Review." },
      ],
      gabarito: "B",
    }),
    q({
      id: "demo-3",
      numero: 3,
      disciplinaId: "d-port",
      disciplina: "Língua Portuguesa",
      cor: 2,
      topico: "Emprego do sinal indicativo de crase",
      enunciado: "O sinal indicativo de crase está empregado corretamente em:",
      alternativas: [
        { letra: "A", texto: "Os servidores chegaram à tempo para a reunião." },
        { letra: "B", texto: "O relatório foi entregue à diretora do tribunal." },
        { letra: "C", texto: "A equipe começou à trabalhar cedo." },
        { letra: "D", texto: "Refiro-me à esse processo." },
        { letra: "E", texto: "O parecer foi enviado à todos os setores." },
      ],
      gabarito: "B",
    }),
  ].filter((x) => (!filtros.disciplina || x.disciplinaId === filtros.disciplina) && filtros.situacao !== "erradas");

  return {
    modo: "demo",
    editais: [{ id: "demo", nome: "Edital de exemplo" }],
    editalId: "demo",
    disciplinas,
    topicos: [],
    provas: [{ nome: prova, total: 3 }],
    filtros,
    questoes,
    totalFiltro: questoes.length,
    geral: { total: 3, resolvidas: 0, acertos: 0 },
  };
}

// -----------------------------------------------------------------------------
// Opções da importação de provas
// -----------------------------------------------------------------------------

export interface EditalImportacao {
  id: string;
  nome: string;
  disciplinas: { id: string; nome: string; cor: number }[];
  topicos: { id: string; disciplinaId: string; parentId: string | null; titulo: string; ordem: number }[];
}

export interface OpcoesImportacao {
  modo: "demo" | "real";
  editais: EditalImportacao[];
  editalPadrao: string | null;
}

export async function carregarOpcoesImportacao(): Promise<OpcoesImportacao> {
  if (!supabaseConfigurado()) return { modo: "demo", editais: [], editalPadrao: null };
  const { supabase, user } = await usuarioAtual();
  if (!user) return { modo: "demo", editais: [], editalPadrao: null };

  const [{ data: editais }, { data: ativo }, { data: discs }, { data: tops }] = await Promise.all([
    supabase.from("editais").select("id, nome").order("created_at", { ascending: false }),
    supabase.from("cronogramas").select("edital_id").eq("ativo", true).maybeSingle(),
    supabase.from("edital_disciplinas").select("edital_id, ordem, disciplinas(id, nome, cor)").order("ordem"),
    supabase.from("topicos_ementa").select("id, edital_id, disciplina_id, parent_id, titulo, ordem").order("ordem"),
  ]);

  const lista: EditalImportacao[] = (editais ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    disciplinas: (discs ?? [])
      .filter((d) => d.edital_id === e.id)
      .map((d, i) => {
        const x = d.disciplinas as unknown as { id: string; nome: string; cor: string | null } | null;
        return x ? { id: x.id, nome: x.nome, cor: indiceDeCor(x.cor, i) } : null;
      })
      .filter((d): d is { id: string; nome: string; cor: number } => !!d),
    topicos: (tops ?? [])
      .filter((t) => t.edital_id === e.id)
      .map((t) => ({ id: t.id, disciplinaId: t.disciplina_id, parentId: t.parent_id, titulo: t.titulo, ordem: t.ordem })),
  }));
  return { modo: "real", editais: lista, editalPadrao: ativo?.edital_id ?? lista[0]?.id ?? null };
}
