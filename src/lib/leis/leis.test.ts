import { describe, expect, it } from "vitest";
import { buscar, htmlParaTexto, normalizarTexto, paragrafos, pdfParaTexto, trechos } from ".";

describe("htmlParaTexto", () => {
  it("tira o texto riscado, tags e entidades, um parágrafo por linha", () => {
    const html = `<html><head><title>L9784</title><style>p{}</style></head><body>
      <p align="center"><b>LEI N&ordm; 9.784, DE 29 DE JANEIRO DE 1999.</b></p>
      <p><a name="art1"></a>Art. 1<sup>o</sup> Esta Lei estabelece normas b&aacute;sicas&nbsp;sobre o processo.</p>
      <p><strike>Art. 2&ordm; Texto antigo.</strike></p>
      <p>Art. 2&ordm; A Administração obedecerá
      aos princípios da legalidade, <strike>velho</strike>finalidade.<br>
      Parágrafo único. Nos processos…</p>
      <!-- comentário -->
    </body></html>`;
    const r = htmlParaTexto(html);
    expect(r.titulo).toBe("L9784");
    expect(r.texto.split("\n")).toEqual([
      "LEI Nº 9.784, DE 29 DE JANEIRO DE 1999.",
      "Art. 1º Esta Lei estabelece normas básicas sobre o processo.",
      "Art. 2º A Administração obedecerá aos princípios da legalidade, finalidade.",
      "Parágrafo único. Nos processos…",
    ]);
  });
});

describe("parágrafos, trechos e busca", () => {
  const texto = normalizarTexto("Art. 1º  Primeiro.\r\n\r\n\r\nArt. 2º Segundo artigo.\nParágrafo único. Fim.");

  it("normaliza o texto colado", () => {
    expect(texto).toBe("Art. 1º Primeiro.\n\nArt. 2º Segundo artigo.\nParágrafo único. Fim.");
  });

  it("calcula offsets e reconhece artigos", () => {
    const ps = paragrafos(texto);
    expect(ps.map((p) => p.artigo)).toEqual(["Art. 1º", null, "Art. 2º", null]);
    expect(texto.slice(ps[2].inicio, ps[2].fim)).toBe("Art. 2º Segundo artigo.");
  });

  it("divide em trechos com marcação e busca, inclusive marcação que atravessa parágrafos", () => {
    const ps = paragrafos(texto);
    const ini = texto.indexOf("Segundo");
    const fim = texto.indexOf("único") + 5;
    const m = { id: "m1", inicio: ini, fim, cor: "amarelo", nota: null };
    const t2 = trechos(ps[2], [m]);
    expect(t2.map((t) => [t.texto, !!t.marcacao])).toEqual([
      ["Art. 2º ", false],
      ["Segundo artigo.", true],
    ]);
    const hits = buscar(texto, "unico");
    expect(hits).toHaveLength(1);
    const t3 = trechos(ps[3], [m], hits);
    expect(t3.map((t) => [t.texto, !!t.marcacao, t.busca])).toEqual([
      ["Parágrafo ", true, false],
      ["único", true, true],
      [". Fim.", false, false],
    ]);
  });
});

describe("pdfParaTexto", () => {
  it("tira a numeração de linhas e junta frases quebradas, mantendo artigos e incisos", () => {
    const pag = [
      "CAPÍTULO VII\n1\nDOS OFICIAIS DE JUSTIÇA\n2\nArt. 994. O presente Capítulo dispõe sobre as regras aplicáveis aos Oficiais\nde Justiça, à expedição de mandados.\n3\nArt. 995. Para os fins deste Capítulo:\nI - Considera-se:\na) Diligência: atividade do Oficial de Justiça para o cumprimento dos atos\ndescritos no mandado;",
      "12\n§ 1º Ressalvado prazo diferente,\no mandado será devolvido.",
    ];
    expect(pdfParaTexto(pag).split("\n")).toEqual([
      "CAPÍTULO VII",
      "DOS OFICIAIS DE JUSTIÇA",
      "Art. 994. O presente Capítulo dispõe sobre as regras aplicáveis aos Oficiais de Justiça, à expedição de mandados.",
      "Art. 995. Para os fins deste Capítulo:",
      "I - Considera-se:",
      "a) Diligência: atividade do Oficial de Justiça para o cumprimento dos atos descritos no mandado;",
      "§ 1º Ressalvado prazo diferente, o mandado será devolvido.",
    ]);
  });
});
