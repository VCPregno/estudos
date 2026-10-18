import { describe, expect, it } from "vitest";
import { type CardAgenda, avaliar, cardNovo, previsoes } from "./agendador";

const AGORA = new Date("2026-10-19T12:00:00Z");
const min = (r: { vencimento: Date }) => Math.round((r.vencimento.getTime() - AGORA.getTime()) / 60_000);
const dias = (r: { vencimento: Date }) => Math.round((r.vencimento.getTime() - AGORA.getTime()) / 86_400_000);

describe("agendador", () => {
  it("card novo anda pelas etapas de 1 e 10 minutos e gradua em 1 dia", () => {
    const a = avaliar(cardNovo(), 3, AGORA);
    expect(a).toMatchObject({ estado: "aprendendo", etapa: 1 });
    expect(min(a)).toBe(10);
    const b = avaliar(a, 3, AGORA);
    expect(b).toMatchObject({ estado: "revisao", intervaloDias: 1 });
    expect(dias(b)).toBe(1);
  });

  it("Errei volta para a primeira etapa; Fácil gradua direto em 4 dias", () => {
    expect(min(avaliar(cardNovo(), 1, AGORA))).toBe(1);
    expect(min(avaliar(cardNovo(), 2, AGORA))).toBe(6); // média de 1 e 10 (arredondado)
    const f = avaliar(cardNovo(), 4, AGORA);
    expect(f.estado).toBe("revisao");
    expect(dias(f)).toBe(4);
  });

  it("em revisão, Bom multiplica pela facilidade e Fácil cresce mais", () => {
    const card: CardAgenda = { estado: "revisao", etapa: 0, intervaloDias: 10, facilidade: 2.5, repeticoes: 5, lapsos: 0 };
    expect(avaliar(card, 3, AGORA).intervaloDias).toBe(25);
    expect(avaliar(card, 2, AGORA)).toMatchObject({ intervaloDias: 12, facilidade: 2.35 });
    expect(avaliar(card, 4, AGORA)).toMatchObject({ intervaloDias: 34, facilidade: 2.65 });
  });

  it("errar um card maduro cria lapso, reduz a facilidade e reaprende em 10 minutos", () => {
    const card: CardAgenda = { estado: "revisao", etapa: 0, intervaloDias: 40, facilidade: 2.5, repeticoes: 8, lapsos: 1 };
    const r = avaliar(card, 1, AGORA);
    expect(r).toMatchObject({ estado: "reaprendendo", lapsos: 2, facilidade: 2.3, intervaloDias: 10 });
    expect(min(r)).toBe(10);
    const volta = avaliar(r, 3, AGORA);
    expect(volta).toMatchObject({ estado: "revisao", intervaloDias: 10 });
  });

  it("facilidade nunca passa do mínimo e o intervalo tem teto", () => {
    const card: CardAgenda = { estado: "revisao", etapa: 0, intervaloDias: 300, facilidade: 1.35, repeticoes: 20, lapsos: 6 };
    expect(avaliar(card, 2, AGORA).facilidade).toBe(1.3);
    expect(avaliar({ ...card, facilidade: 3 }, 4, AGORA).intervaloDias).toBe(365);
  });

  it("mostra a previsão dos botões", () => {
    expect(previsoes(cardNovo(), AGORA)).toEqual({ 1: "1 min", 2: "6 min", 3: "10 min", 4: "4 d" });
  });
});
