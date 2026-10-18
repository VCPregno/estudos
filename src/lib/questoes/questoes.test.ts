import { describe, expect, it } from "vitest";
import type { ProvaExtraida } from "@/lib/ai/esquema-prova";
import { blocosDeTexto, idExterno, montarClassificacao, nomeDaProva, prepararQuestoes } from ".";

const disciplinas = [
  { id: "d-port", nome: "Língua Portuguesa" },
  { id: "d-ti", nome: "Tecnologia da Informação" },
];
const topicos = [
  { id: "t-bd", disciplinaId: "d-ti", parentId: null, titulo: "Banco de Dados", ordem: 2 },
  { id: "t-sql", disciplinaId: "d-ti", parentId: "t-bd", titulo: "SQL", ordem: 1 },
  { id: "t-eng", disciplinaId: "d-ti", parentId: null, titulo: "Engenharia de Software", ordem: 1 },
  { id: "t-crase", disciplinaId: "d-port", parentId: null, titulo: "Crase", ordem: 1 },
  { id: "t-orfao", disciplinaId: "d-outra", parentId: null, titulo: "Fora do edital", ordem: 1 },
];

describe("montarClassificacao", () => {
  it("lista disciplinas e tópicos em ordem de edital, com o caminho do pai", () => {
    const c = montarClassificacao(disciplinas, topicos);
    expect(c.texto.split("\n")).toEqual([
      "D1 | Língua Portuguesa",
      "D2 | Tecnologia da Informação",
      "T1 | D1 | Crase",
      "T2 | D2 | Engenharia de Software",
      "T3 | D2 | Banco de Dados",
      "T4 | D2 | Banco de Dados > SQL",
    ]);
    expect(c.topicos.get("T4")).toEqual({ topicoId: "t-sql", disciplinaId: "d-ti" });
    expect(c.disciplinas.get("D1")).toBe("d-port");
  });
});

describe("prepararQuestoes", () => {
  const c = montarClassificacao(disciplinas, topicos);
  const base: ProvaExtraida = {
    prova: { banca: "FCC", orgao: "TRT-15", cargo: "Analista Judiciário TI", ano: 2025 },
    gabarito_oficial: true,
    textos: [{ id: "t1", texto: "  Era uma vez.  " }],
    questoes: [
      {
        numero: 2,
        texto_apoio: null,
        enunciado: "SELECT?",
        alternativas: [{ letra: "a)", texto: " x " }],
        gabarito: "c",
        anulada: false,
        disciplina: "D1", // errado de propósito: o tópico manda
        topico: "t4",
        depende_de_imagem: false,
      },
      {
        numero: 1,
        texto_apoio: "T1",
        enunciado: "Sobre o texto",
        alternativas: [],
        gabarito: "anulada",
        anulada: true,
        disciplina: "D1",
        topico: "T99",
        depende_de_imagem: false,
      },
      { numero: 2, texto_apoio: null, enunciado: "duplicada", alternativas: [], gabarito: "A", anulada: false, disciplina: null, topico: null, depende_de_imagem: false },
    ],
    observacoes: null,
  };

  it("ordena, remove duplicadas, troca chaves por ids e normaliza letras", () => {
    const qs = prepararQuestoes(base, c);
    expect(qs.map((q) => q.numero)).toEqual([1, 2]);
    expect(qs[0]).toMatchObject({ textoApoio: "Era uma vez.", gabarito: null, anulada: true, disciplinaId: "d-port", topicoId: null });
    expect(qs[1]).toMatchObject({ gabarito: "C", disciplinaId: "d-ti", topicoId: "t-sql", alternativas: [{ letra: "A", texto: "x" }] });
  });
});

describe("nomes e ids", () => {
  it("monta o nome da prova e um id estável", () => {
    const nome = nomeDaProva({ banca: "FCC", ano: 2025, orgao: "TRT-15", cargo: "Analista Judiciário – TI" });
    expect(nome).toBe("FCC · 2025 · TRT-15 · Analista Judiciário – TI");
    expect(idExterno(nome, 7)).toBe("fcc-2025-trt-15-analista-judiciario-ti#7");
  });
});

describe("blocosDeTexto", () => {
  it("separa parágrafos, código e tabelas", () => {
    const t = "Considere o código:\n```\nfor i in x:\n    print(i)\n```\nE a tabela:\n| id | nome |\n|---|---|\n| 1 | Ana |\n\nQual a saída?";
    expect(blocosDeTexto(t)).toEqual([
      { tipo: "texto", texto: "Considere o código:" },
      { tipo: "codigo", texto: "for i in x:\n    print(i)" },
      { tipo: "texto", texto: "E a tabela:" },
      { tipo: "tabela", linhas: [["id", "nome"], ["1", "Ana"]] },
      { tipo: "texto", texto: "Qual a saída?" },
    ]);
  });
});
