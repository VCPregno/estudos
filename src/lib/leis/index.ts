/**
 * Funções puras das Leis secas: HTML de lei → texto limpo, parágrafos com
 * offsets e a divisão do texto em trechos marcados para exibir.
 */

const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ordm: "º",
  ordf: "ª",
  sect: "§",
  deg: "°",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  middot: "·",
  shy: "",
};

export function decodificarEntidades(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const lower = e.toLowerCase();
    if (lower in ENTIDADES) return ENTIDADES[lower];
    // letras acentuadas: &aacute; &ccedil; &atilde; etc.
    const acentos: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈", cedil: "̧" };
    const mm = e.match(/^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i);
    if (mm) return (mm[1] + acentos[mm[2].toLowerCase()]).normalize("NFC");
    return m;
  });
}

/**
 * Converte o HTML de uma página de legislação (como as do Planalto) em texto:
 * remove o que está riscado (dispositivos revogados ou com redação antiga),
 * scripts e estilos, e mantém um parágrafo por linha.
 */
export function htmlParaTexto(html: string): { titulo: string | null; texto: string } {
  const tituloTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let h = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|noscript)\b[\s\S]*?<\/\1>/gi, "")
    // texto riscado = revogado ou redação anterior
    .replace(/<(strike|s|del)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  h = h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote|center)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|li|tr|table|blockquote|center)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "");
  const texto = decodificarEntidades(h)
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t\r\f\v]+/g, " ").trim())
    .filter((l) => l.length > 0)
    // linhas que sobraram só com parênteses de "(Revogado)" sem texto útil continuam: são informação
    .join("\n");
  const titulo = tituloTag ? decodificarEntidades(tituloTag).replace(/\s+/g, " ").trim() || null : null;
  return { titulo, texto };
}

/** Normaliza texto colado: quebras de linha consistentes, sem espaços sobrando. */
export function normalizarTexto(t: string) {
  return t
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join("\n")
    .trim();
}

export interface Paragrafo {
  indice: number;
  inicio: number;
  fim: number;
  texto: string;
  /** "Art. 5º" quando o parágrafo começa um artigo */
  artigo: string | null;
}

export function paragrafos(texto: string): Paragrafo[] {
  const out: Paragrafo[] = [];
  let pos = 0;
  texto.split("\n").forEach((linha, indice) => {
    const m = linha.match(/^(Art\.?\s*\d+[\wº°-]*)/i);
    out.push({ indice, inicio: pos, fim: pos + linha.length, texto: linha, artigo: m ? m[1].replace(/\s+/g, " ") : null });
    pos += linha.length + 1;
  });
  return out;
}

export interface Marcacao {
  id: string;
  inicio: number;
  fim: number;
  cor: string;
  nota: string | null;
}

export interface Trecho {
  texto: string;
  inicio: number;
  marcacao: Marcacao | null;
  busca: boolean;
}

/**
 * Divide um parágrafo em trechos, aplicando marcações (a mais recente vence
 * quando se sobrepõem) e os acertos da busca.
 */
export function trechos(p: Paragrafo, marcacoes: readonly Marcacao[], buscas: readonly [number, number][] = []): Trecho[] {
  const ms = marcacoes.filter((m) => m.fim > p.inicio && m.inicio < p.fim);
  const bs = buscas.filter(([a, b]) => b > p.inicio && a < p.fim);
  const cortes = new Set<number>([p.inicio, p.fim]);
  for (const m of ms) {
    cortes.add(Math.max(p.inicio, m.inicio));
    cortes.add(Math.min(p.fim, m.fim));
  }
  for (const [a, b] of bs) {
    cortes.add(Math.max(p.inicio, a));
    cortes.add(Math.min(p.fim, b));
  }
  const pts = [...cortes].sort((a, b) => a - b);
  const out: Trecho[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (b <= a) continue;
    let marcacao: Marcacao | null = null;
    for (const m of ms) if (m.inicio <= a && m.fim >= b) marcacao = m;
    const busca = bs.some(([x, y]) => x <= a && y >= b);
    const anterior = out[out.length - 1];
    if (anterior && anterior.marcacao === marcacao && anterior.busca === busca) {
      anterior.texto += p.texto.slice(a - p.inicio, b - p.inicio);
    } else {
      out.push({ texto: p.texto.slice(a - p.inicio, b - p.inicio), inicio: a, marcacao, busca });
    }
  }
  return out;
}

/** Posições [início, fim) de cada ocorrência do termo, sem diferenciar acentos e maiúsculas. */
export function buscar(texto: string, termo: string): [number, number][] {
  const t = termo.trim();
  if (t.length < 2) return [];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // NFD muda o tamanho; normalizamos caractere a caractere para manter os offsets
  const base = [...texto].map((c) => norm(c)[0] ?? c).join("");
  const alvo = norm(t);
  const out: [number, number][] = [];
  let i = base.indexOf(alvo);
  while (i !== -1 && out.length < 2000) {
    out.push([i, i + alvo.length]);
    i = base.indexOf(alvo, i + alvo.length);
  }
  return out;
}
