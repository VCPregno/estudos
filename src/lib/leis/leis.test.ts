import { describe, expect, it } from "vitest";
import { buscar, htmlParaTexto, normalizarTexto, paragrafos, trechos } from ".";

describe("htmlParaTexto", () => {
  it("tira o texto riscado, tags e entidades, um parágrafo por linha", () => {
    const html = `<html><head><title>L9784</title><style>p{}</style></head><body>
      <p align="center"><b>LEI N&ordm; 9.784, DE 29 DE JANEIRO DE 1999.</b></p>
      <p><a name="art1"></a>Art. 1<sup>o</sup> Esta Lei estabelece normas b&aacute;sicas&nbsp;sobre o processo.</p>
      <p><strike>Art. 2&ordm; Texto antigo.</strike></p>
      <p>Art. 2&ordm; A Administração obedecerá aos princípios da legalidade, <strike>velho</strike>finalidade.<br>
      Parágrafo único. Nos processos…</p>
      <!-- comentário -->
    </body></html>`;
    const r = htmlParaTexto(html);
    expect(r.titulo).toBe("L9784");
    expect(r.texto.split("\n")).toEqual([
      "LEI Nº 9.784, DE 29 DE JANEIRO DE 1999.",
      "Art. 1o Esta Lei estabelece normas básicas sobre o processo.",
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
