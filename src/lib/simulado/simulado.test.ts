import { describe, expect, it } from "vitest";
import { corrigirSimulado, tempoSugeridoMin } from ".";

const q = (marcada: string | null, gabarito: string, disciplina: string, anulada = false) => ({
  questaoId: crypto.randomUUID(),
  marcada,
  gabarito,
  anulada,
  disciplina,
});

describe("corrigirSimulado", () => {
  const itens = [q("A", "A", "TI"), q("B", "C", "TI"), q(null, "D", "Português"), q("E", "X", "Português", true)];

  it("conta acertos, erros, brancos e anuladas, e agrupa por disciplina", () => {
    const r = corrigirSimulado(itens);
    expect(r).toMatchObject({ total: 4, acertos: 2, erros: 1, emBranco: 1, nota: 50 });
    expect(r.porDisciplina).toEqual([
      { disciplina: "TI", total: 2, acertos: 1 },
      { disciplina: "Português", total: 2, acertos: 1 },
    ]);
    expect(r.itens[2]).toMatchObject({ marcada: null, acertou: false });
  });

  it("com penalidade, cada erro anula um acerto", () => {
    expect(corrigirSimulado(itens, true).nota).toBe(25);
    expect(corrigirSimulado([q("B", "A", "TI")], true).nota).toBe(0);
  });

  it("sugere 3 minutos por questão, no mínimo 10", () => {
    expect(tempoSugeridoMin(60)).toBe(180);
    expect(tempoSugeridoMin(2)).toBe(10);
  });
});
