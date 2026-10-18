import { describe, expect, it } from "vitest";
import { entradaDemo } from "./demo";
import { type EntradaPainel, montarPainel } from "./painel";

const HOJE = "2026-10-21"; // quarta-feira

function entradaFixa(): EntradaPainel {
  const e = entradaDemo(HOJE);
  const c = e.ciclo!;
  return {
    ...e,
    temEdital: true,
    ciclo: {
      ...c,
      config: { ...c.config, modo: "fixo" },
      revisoes: [{ id: "r1", topicoId: "const-1", disciplinaId: "const", numero: 2, dataAlvo: "2026-10-19" }],
      itensFixos: [
        { id: "i1", data: "2026-10-20", disciplinaId: "const", topicoId: "const-5", minutos: 60 },
        { id: "i2", data: HOJE, disciplinaId: "trab", topicoId: "trab-5", minutos: 60 },
        { id: "i3", data: "2026-10-22", disciplinaId: "adm", topicoId: "adm-4", minutos: 60 },
      ],
      ultimaDataFixa: "2027-01-30",
    },
  };
}

describe("montarPainel", () => {
  it("modo dinâmico (demonstração) monta a sessão de hoje e a semana", () => {
    const d = montarPainel(entradaDemo(HOJE));
    expect(d.sessaoHoje!.itens.length).toBeGreaterThan(0);
    expect(d.agendaSemana).toHaveLength(7);
    expect(d.agendaSemana.find((x) => x.ehHoje)!.data).toBe(HOJE);
    expect(d.ciclo!.fatias.some((f) => f.atual)).toBe(true);
    expect(d.temEdital).toBe(true);
  });

  it("modo fixo: atrasados e revisões vencidas entram hoje, o resto fica no dia planejado", () => {
    const d = montarPainel(entradaFixa());
    const hoje = d.sessaoHoje!.itens;
    expect(hoje.map((i) => i.chave)).toEqual(["r-r1", "f-i1", "f-i2"]);
    expect(hoje[0]).toMatchObject({ tipo: "revisao", atrasadaDesde: "2026-10-19" });
    expect(hoje[1]).toMatchObject({ tipo: "teoria", cronogramaItemId: "i1", atrasadaDesde: "2026-10-20" });
    expect(hoje[2]).toMatchObject({ cronogramaItemId: "i2", atrasadaDesde: null });

    const quinta = d.agendaSemana.find((x) => x.data === "2026-10-22")!;
    expect(quinta.itens.map((i) => i.cronogramaItemId)).toEqual(["i3"]);
  });

  it("modo fixo: conclusão no plano é a data do último item e o anel não marca turno", () => {
    const d = montarPainel(entradaFixa());
    expect(d.edital!.conclusaoPlano).toBe("2027-01-30");
    expect(d.ciclo!.modo).toBe("fixo");
    expect(d.ciclo!.fatias.every((f) => !f.atual && f.progresso === 0)).toBe(true);
  });

  it("sem ciclo, informa se já existe edital", () => {
    const e = entradaDemo(HOJE);
    expect(montarPainel({ ...e, ciclo: null, temEdital: true }).temEdital).toBe(true);
    expect(montarPainel({ ...e, ciclo: null, temEdital: false }).temEdital).toBe(false);
  });
});
