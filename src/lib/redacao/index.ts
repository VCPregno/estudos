/**
 * Correção de redação: réguas por banca e funções puras para mostrar a correção.
 */

export type TipoTexto = "redacao" | "discursiva";

export interface Regua {
  id: string;
  rotulo: string;
  notaMaxima: number;
  notaMinima: number | null;
  linhas: [number, number];
  /** Texto enviado à IA: um critério por linha, com o peso */
  criterios: string;
  aviso?: string;
}

export const REGUAS_REDACAO: Regua[] = [
  {
    id: "FCC",
    rotulo: "FCC",
    notaMaxima: 10,
    notaMinima: 6,
    linhas: [20, 30],
    criterios: [
      "Conteúdo (40%): perspectiva adotada sobre o tema, profundidade da análise e senso crítico, consistência, clareza e coerência dos argumentos. Abordagem tangencial, parcial ou diluída em divagações reduz a nota; fuga ao tema zera.",
      "Estrutura (30%): adequação ao gênero dissertativo-argumentativo, progressão textual, encadeamento das ideias, coesão entre frases e parágrafos.",
      "Expressão (30%): registro adequado e domínio da norma-padrão: estrutura das frases, vocabulário, concordância, pontuação, regência, pronomes, tempos e modos verbais, ortografia e acentuação.",
    ].join("\n"),
  },
  {
    id: "Vunesp",
    rotulo: "Vunesp",
    notaMaxima: 40,
    notaMinima: 24, // edital TJ-SP 2026 (Escrevente): 24 de 40
    linhas: [20, 30],
    criterios: [
      "Tema e argumentação (40%): adequação ao tema e à proposta, qualidade e consistência dos argumentos, ponto de vista claro.",
      "Estrutura e coerência (30%): gênero dissertativo-argumentativo, organização em introdução, desenvolvimento e conclusão, coerência e progressão das ideias.",
      "Expressão (30%): coesão e domínio da norma-padrão (concordância, regência, pontuação, crase, ortografia, vocabulário).",
    ].join("\n"),
    aviso: "Pesos aproximados. Se o edital trouxer a régua, cole os critérios dele.",
  },
  {
    id: "Cebraspe",
    rotulo: "Cebraspe",
    notaMaxima: 10,
    notaMinima: null,
    linhas: [20, 30],
    criterios: [
      "Apresentação e estrutura textual (20%): legibilidade, respeito às margens e paragrafação, organização do texto.",
      "Desenvolvimento do tema (80%): abordagem de cada aspecto pedido, fundamentação e argumentação.",
      "Erros de norma-padrão descontam: nota final = nota de conteúdo − 2 × (número de erros ÷ número de linhas escritas).",
    ].join("\n"),
    aviso: "A Cebraspe costuma listar aspectos específicos por tema. Cole os do edital ou da prova, se tiver.",
  },
  {
    id: "FGV",
    rotulo: "FGV",
    notaMaxima: 10,
    notaMinima: null,
    linhas: [20, 30],
    criterios: [
      "Conteúdo (50%): pertinência ao tema, informatividade e qualidade da argumentação.",
      "Estrutura (25%): organização dos parágrafos, coesão e coerência.",
      "Expressão (25%): norma-padrão e adequação vocabular.",
    ].join("\n"),
    aviso: "Pesos aproximados. Se o edital trouxer a régua, cole os critérios dele.",
  },
];

export const REGUA_DISCURSIVA: Regua = {
  id: "discursiva",
  rotulo: "Discursiva",
  notaMaxima: 20,
  notaMinima: null,
  linhas: [10, 30],
  criterios: [
    "Conteúdo (70%): resposta a todos os pontos pedidos, correção técnica ou jurídica, fundamentação (artigo de lei, súmula, conceito) e precisão terminológica.",
    "Estrutura e expressão (30%): organização da resposta, objetividade, coesão e norma-padrão.",
  ].join("\n"),
};

export type TipoErro =
  | "ortografia"
  | "acentuacao"
  | "pontuacao"
  | "concordancia"
  | "regencia"
  | "crase"
  | "coesao"
  | "vocabulario"
  | "estrutura"
  | "argumentacao"
  | "outro";

export interface ErroRedacao {
  trecho: string;
  correcao: string;
  tipo: TipoErro;
  explicacao: string;
}

export type Pedaco = { texto: string; erro: number | null };

/**
 * Divide o texto em pedaços, marcando a primeira ocorrência de cada erro
 * (na ordem do texto). Erros cujo trecho não aparece ficam de fora.
 */
export function marcarErros(texto: string, erros: readonly ErroRedacao[]): { pedacos: Pedaco[]; encontrados: Set<number> } {
  const intervalos: { ini: number; fim: number; erro: number }[] = [];
  const ocupado = (a: number, b: number) => intervalos.some((x) => a < x.fim && b > x.ini);
  erros.forEach((e, i) => {
    const alvo = e.trecho.trim();
    if (alvo.length < 2) return;
    let pos = texto.indexOf(alvo);
    while (pos !== -1 && ocupado(pos, pos + alvo.length)) pos = texto.indexOf(alvo, pos + 1);
    if (pos === -1) {
      // tolera diferença de maiúsculas
      const lower = texto.toLowerCase();
      pos = lower.indexOf(alvo.toLowerCase());
      while (pos !== -1 && ocupado(pos, pos + alvo.length)) pos = lower.indexOf(alvo.toLowerCase(), pos + 1);
    }
    if (pos !== -1) intervalos.push({ ini: pos, fim: pos + alvo.length, erro: i });
  });
  intervalos.sort((a, b) => a.ini - b.ini);
  const pedacos: Pedaco[] = [];
  let cursor = 0;
  for (const x of intervalos) {
    if (x.ini > cursor) pedacos.push({ texto: texto.slice(cursor, x.ini), erro: null });
    pedacos.push({ texto: texto.slice(x.ini, x.fim), erro: x.erro });
    cursor = x.fim;
  }
  if (cursor < texto.length) pedacos.push({ texto: texto.slice(cursor), erro: null });
  return { pedacos, encontrados: new Set(intervalos.map((x) => x.erro)) };
}

/** Ajusta as notas dos critérios para somarem no máximo a nota máxima. */
export function normalizarNotas(criterios: { nota: number; maximo: number }[], notaMaxima: number) {
  const somaMax = criterios.reduce((s, c) => s + c.maximo, 0);
  const fator = somaMax > 0 ? notaMaxima / somaMax : 1;
  const ajustados = criterios.map((c) => {
    const maximo = Math.round(c.maximo * fator * 100) / 100;
    const nota = Math.round(Math.min(Math.max(c.nota, 0), c.maximo) * fator * 100) / 100;
    return { ...c, maximo, nota };
  });
  const total = Math.round(ajustados.reduce((s, c) => s + c.nota, 0) * 100) / 100;
  return { criterios: ajustados, total: Math.min(total, notaMaxima) };
}
