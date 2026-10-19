import { describe, expect, it } from "vitest";
import { type ErroRedacao, marcarErros, normalizarNotas } from ".";

const e = (trecho: string): ErroRedacao => ({ trecho, correcao: "x", tipo: "outro", explicacao: "" });

describe("marcarErros", () => {
  it("marca cada erro na ordem do texto, sem sobrepor, e ignora o que não acha", () => {
    const texto = "A muito tempo atras, haviam pessoas. Haviam outras.";
    const { pedacos, encontrados } = marcarErros(texto, [e("haviam"), e("A muito"), e("atras"), e("haviam"), e("inexistente")]);
    expect(pedacos.map((p) => [p.texto, p.erro])).toEqual([
      ["A muito", 1],
      [" tempo ", null],
      ["atras", 2],
      [", ", null],
      ["haviam", 0],
      [" pessoas. ", null],
      ["Haviam", 3],
      [" outras.", null],
    ]);
    expect([...encontrados].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("normalizarNotas", () => {
  it("reescala quando a IA usa outra soma e limita cada nota ao máximo", () => {
    const r = normalizarNotas(
      [
        { nota: 3.5, maximo: 4 },
        { nota: 4, maximo: 3 },
        { nota: 2, maximo: 3 },
      ],
      40,
    );
    expect(r.criterios.map((c) => c.maximo)).toEqual([16, 12, 12]);
    expect(r.criterios.map((c) => c.nota)).toEqual([14, 12, 8]);
    expect(r.total).toBe(34);
  });
});
