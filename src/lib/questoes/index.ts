import type { ProvaExtraida } from "@/lib/ai/esquema-prova";

/**
 * Funções puras do Banco de Questões: a lista de classificação que vai para a
 * IA, a conversão do resultado em linhas revisáveis e a quebra do enunciado em
 * blocos (texto, código, tabela) para exibir.
 */

export interface DisciplinaRef {
  id: string;
  nome: string;
}

export interface TopicoRef {
  id: string;
  disciplinaId: string;
  parentId: string | null;
  titulo: string;
  ordem: number;
}

export interface Classificacao {
  /** Texto enviado no prompt */
  texto: string;
  disciplinas: Map<string, string>; // "D1" → disciplina_id
  topicos: Map<string, { topicoId: string; disciplinaId: string }>; // "T7" → ids
}

/** Monta a lista "D1 | Nome" / "T7 | D1 | Pai > Filho" em ordem de edital. */
export function montarClassificacao(disciplinas: readonly DisciplinaRef[], topicos: readonly TopicoRef[]): Classificacao {
  const chaveDisc = new Map<string, string>(); // id → "D1"
  const mapaD = new Map<string, string>();
  const mapaT = new Map<string, { topicoId: string; disciplinaId: string }>();
  const linhas: string[] = [];

  disciplinas.forEach((d, i) => {
    const k = `D${i + 1}`;
    chaveDisc.set(d.id, k);
    mapaD.set(k, d.id);
    linhas.push(`${k} | ${d.nome}`);
  });

  const porId = new Map(topicos.map((t) => [t.id, t]));
  const filhos = new Map<string | null, TopicoRef[]>();
  for (const t of topicos) {
    const lista = filhos.get(t.parentId) ?? [];
    lista.push(t);
    filhos.set(t.parentId, lista);
  }
  for (const lista of filhos.values()) lista.sort((a, b) => a.ordem - b.ordem);

  let n = 0;
  const visitar = (t: TopicoRef) => {
    const kd = chaveDisc.get(t.disciplinaId);
    if (kd) {
      const k = `T${++n}`;
      mapaT.set(k, { topicoId: t.id, disciplinaId: t.disciplinaId });
      const pai = t.parentId ? porId.get(t.parentId) : null;
      linhas.push(`${k} | ${kd} | ${pai ? `${pai.titulo} > ${t.titulo}` : t.titulo}`);
    }
    for (const f of filhos.get(t.id) ?? []) visitar(f);
  };
  for (const d of disciplinas) for (const t of (filhos.get(null) ?? []).filter((x) => x.disciplinaId === d.id)) visitar(t);

  return { texto: linhas.join("\n"), disciplinas: mapaD, topicos: mapaT };
}

export interface QuestaoRevisao {
  numero: number;
  textoApoio: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string | null;
  anulada: boolean;
  disciplinaId: string | null;
  topicoId: string | null;
  dependeDeImagem: boolean;
}

const LETRAS = /^[A-E]$/;

/** Converte o JSON da IA em questões com ids reais, prontas para revisão. */
export function prepararQuestoes(r: ProvaExtraida, c: Pick<Classificacao, "disciplinas" | "topicos">): QuestaoRevisao[] {
  const textos = new Map(r.textos.map((t) => [t.id.trim().toLowerCase(), t.texto.trim()]));
  const vistos = new Set<number>();
  return r.questoes
    .filter((q) => {
      if (vistos.has(q.numero)) return false;
      vistos.add(q.numero);
      return q.enunciado.trim().length > 0;
    })
    .sort((a, b) => a.numero - b.numero)
    .map((q) => {
      const t = q.topico ? c.topicos.get(q.topico.trim().toUpperCase()) : undefined;
      const d = q.disciplina ? c.disciplinas.get(q.disciplina.trim().toUpperCase()) : undefined;
      const gabarito = q.gabarito?.trim().toUpperCase() ?? null;
      return {
        numero: q.numero,
        textoApoio: q.texto_apoio ? (textos.get(q.texto_apoio.trim().toLowerCase()) ?? null) : null,
        enunciado: q.enunciado.trim(),
        alternativas: q.alternativas.map((a) => ({ letra: a.letra.trim().toUpperCase().replace(/[^A-E]/g, ""), texto: a.texto.trim() })),
        gabarito: gabarito && LETRAS.test(gabarito) ? gabarito : null,
        anulada: q.anulada,
        // o tópico manda: se a IA errar a disciplina, vale a do tópico
        disciplinaId: t?.disciplinaId ?? d ?? null,
        topicoId: t?.topicoId ?? null,
        dependeDeImagem: q.depende_de_imagem,
      };
    });
}

/** "FCC 2025 · TRT-15 · Analista Judiciário TI" */
export function nomeDaProva(p: { banca: string | null; ano: number | null; orgao: string | null; cargo: string | null }) {
  return [p.banca, p.ano, p.orgao, p.cargo].filter((x) => x !== null && String(x).trim() !== "").join(" · ") || "Prova importada";
}

/** Id estável para não duplicar a mesma questão em importações repetidas. */
export function idExterno(prova: string, numero: number) {
  const slug = prova
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}#${numero}`;
}

// -----------------------------------------------------------------------------
// Exibição
// -----------------------------------------------------------------------------

export type Bloco = { tipo: "texto"; texto: string } | { tipo: "codigo"; texto: string } | { tipo: "tabela"; linhas: string[][] };

/** Quebra o texto em parágrafos, blocos de código (```) e tabelas (linhas com |). */
export function blocosDeTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    const t = paragrafo.join("\n").trim();
    if (t) blocos.push({ tipo: "texto", texto: t });
    paragrafo = [];
  };

  while (i < linhas.length) {
    const l = linhas[i];
    if (l.trim().startsWith("```")) {
      fecharParagrafo();
      const codigo: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith("```")) codigo.push(linhas[i++]);
      i++; // fecha ```
      blocos.push({ tipo: "codigo", texto: codigo.join("\n").replace(/^\n+|\s+$/g, "") });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      fecharParagrafo();
      const tabela: string[][] = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) {
        const celulas = linhas[i]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        if (!celulas.every((c) => /^:?-{2,}:?$/.test(c))) tabela.push(celulas);
        i++;
      }
      blocos.push({ tipo: "tabela", linhas: tabela });
      continue;
    }
    if (l.trim() === "") fecharParagrafo();
    else paragrafo.push(l);
    i++;
  }
  fecharParagrafo();
  return blocos;
}
