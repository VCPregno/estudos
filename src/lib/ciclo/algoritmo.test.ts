import { describe, expect, it } from "vitest";
import {
  calcularRitmo,
  estimarConclusao,
  gerarPlanoFixo,
  itensAtrasados,
  montarFilaTeoria,
  projetarAgenda,
  registrarEstudoNoCiclo,
  sequenciaDoCiclo,
} from "./algoritmo";
import { diaDaSemana, proximoDiaPermitido, somarDias } from "./datas";
import type { ConfigCiclo, DisciplinaCiclo, TopicoCiclo } from "./tipos";

// 2026-10-19 é segunda-feira
const SEGUNDA = "2026-10-19";

function config(parcial: Partial<ConfigCiclo> = {}): ConfigCiclo {
  return {
    modo: "dinamico",
    dataInicio: SEGUNDA,
    minutosPorDia: { 0: 0, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60 },
    duracaoBlocoMin: 60,
    fragmentoMinimoMin: 20,
    revisoes: {
      habilitadas: false,
      intervalos: [1, 7, 14, 30, 90],
      diasPermitidos: [0, 1, 2, 3, 4, 5, 6],
      minutosPorRevisao: 15,
      limiteDoDia: 0.5,
    },
    ...parcial,
  };
}

const disciplinas: DisciplinaCiclo[] = [
  { id: "const", nome: "Constitucional", peso: 3, ordem: 0 },
  { id: "adm", nome: "Administrativo", peso: 2, ordem: 1 },
  { id: "port", nome: "Português", peso: 1, ordem: 2 },
];

function topicos(disciplinaId: string, n: number, extra: Partial<TopicoCiclo> = {}): TopicoCiclo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${disciplinaId}-${i + 1}`,
    disciplinaId,
    titulo: `${disciplinaId} tópico ${i + 1}`,
    ordem: i,
    minutosEstimados: null,
    minutosEstudados: 0,
    teoriaConcluida: false,
    ...extra,
  }));
}

describe("datas", () => {
  it("dia da semana e próximo dia permitido", () => {
    expect(diaDaSemana(SEGUNDA)).toBe(1);
    expect(diaDaSemana("2026-10-18")).toBe(0);
    expect(proximoDiaPermitido("2026-10-24", [1, 3, 5])).toBe("2026-10-26"); // sábado → segunda
    expect(somarDias("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("sequenciaDoCiclo", () => {
  it("respeita pesos e prioridade, intercalando", () => {
    const seq = sequenciaDoCiclo(disciplinas);
    expect(seq).toHaveLength(6);
    expect(seq.filter((d) => d === "const")).toHaveLength(3);
    expect(seq.filter((d) => d === "adm")).toHaveLength(2);
    expect(seq.filter((d) => d === "port")).toHaveLength(1);
    expect(seq[0]).toBe("const");
    // nunca três iguais seguidos e nenhuma repetição colada na volta
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it("ignora disciplinas inativas", () => {
    const seq = sequenciaDoCiclo([...disciplinas, { id: "x", nome: "X", peso: 5, ordem: 9, ativo: false }]);
    expect(seq).not.toContain("x");
  });
});

describe("montarFilaTeoria", () => {
  it("cobre todos os minutos restantes e mantém a ordem dos tópicos", () => {
    const tops = [...topicos("const", 3), ...topicos("adm", 2), ...topicos("port", 1)];
    const fila = montarFilaTeoria(disciplinas, tops, config());
    expect(fila.reduce((s, p) => s + p.minutos, 0)).toBe(6 * 60);
    const ordemConst = fila.filter((p) => p.disciplinaId === "const").map((p) => p.topicoId);
    expect(ordemConst).toEqual(["const-1", "const-2", "const-3"]);
  });

  it("disciplina esgotada sai do rodízio", () => {
    const tops = [...topicos("const", 5), ...topicos("port", 1)];
    const fila = montarFilaTeoria(disciplinas, tops, config());
    expect(fila.filter((p) => p.disciplinaId === "port")).toHaveLength(1);
    expect(fila.at(-1)!.disciplinaId).toBe("const");
  });

  it("ignora tópicos concluídos e desconta minutos já estudados", () => {
    const tops = [
      ...topicos("const", 1, { teoriaConcluida: true }),
      { ...topicos("adm", 1)[0], minutosEstimados: 90, minutosEstudados: 50 },
    ];
    const fila = montarFilaTeoria(disciplinas, tops, config());
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ topicoId: "adm-1", minutos: 40, concluiTopico: true });
  });

  it("tópico com tempo estourado mas não marcado continua com um fragmento", () => {
    const tops = [{ ...topicos("const", 1)[0], minutosEstudados: 75 }];
    expect(montarFilaTeoria(disciplinas, tops, config())[0].minutos).toBe(20);
  });

  it("retoma da posição salva e desconta o que já foi feito no turno", () => {
    const tops = [...topicos("const", 3), ...topicos("adm", 2), ...topicos("port", 1)];
    const seq = sequenciaDoCiclo(disciplinas);
    const fila = montarFilaTeoria(disciplinas, tops, config(), { posicao: 1, minutosNoTurno: 30 });
    expect(fila[0].disciplinaId).toBe(seq[1]);
    expect(fila[0].minutos).toBe(30);
    expect(fila[0].turno).toBe(1);
  });
});

describe("projetarAgenda", () => {
  const tops = [...topicos("const", 3), ...topicos("adm", 2), ...topicos("port", 1)];

  it("1h por dia de segunda a sábado: 6 blocos terminam no sábado; domingo é folga", () => {
    const p = projetarAgenda({ config: config(), disciplinas, topicos: tops, revisoesPendentes: [], hoje: SEGUNDA });
    expect(p.conclusaoTeoria).toBe("2026-10-24");
    expect(p.dias.every((d) => d.itens.length === 1)).toBe(true);
    expect(p.horizonteAtingido).toBe(false);
  });

  it("começando no domingo, o primeiro dia fica vazio", () => {
    const p = projetarAgenda({
      config: config({ dataInicio: "2026-10-18" }),
      disciplinas,
      topicos: tops,
      revisoesPendentes: [],
      hoje: "2026-10-18",
    });
    expect(p.dias[0].itens).toHaveLength(0);
    expect(p.conclusaoTeoria).toBe("2026-10-24");
  });

  it("90 min/dia: blocos de 60 são divididos entre dias e marcados como continuação", () => {
    const cfg = config({ minutosPorDia: { 0: 0, 1: 90, 2: 90, 3: 90, 4: 90, 5: 90, 6: 90 } });
    const p = projetarAgenda({ config: cfg, disciplinas, topicos: tops, revisoesPendentes: [], hoje: SEGUNDA });
    expect(p.dias[0].itens.map((i) => i.minutos)).toEqual([60, 30]);
    const segundoDia = p.dias[1].itens[0];
    expect(segundoDia).toMatchObject({ tipo: "teoria", minutos: 30, continuacao: true, concluiTopico: true });
    expect(p.conclusaoTeoria).toBe("2026-10-22"); // 360 min / 90 = 4 dias
  });

  it("dinâmico: pular dias apenas empurra a fila, na mesma ordem", () => {
    const base = { config: config(), disciplinas, topicos: tops, revisoesPendentes: [] };
    const naSegunda = projetarAgenda({ ...base, hoje: SEGUNDA });
    const naQuinta = projetarAgenda({ ...base, hoje: "2026-10-22" });
    const sequencia = (p: typeof naSegunda) => p.dias.flatMap((d) => d.itens.map((i) => i.topicoId));
    expect(sequencia(naQuinta)).toEqual(sequencia(naSegunda));
    expect(naQuinta.dias[0].data).toBe("2026-10-22");
    expect(naQuinta.conclusaoTeoria).toBe("2026-10-28"); // qui, sex, sáb, (dom folga), seg, ter, qua
  });

  it("revisões projetadas caem só nos dias permitidos", () => {
    const cfg = config({
      revisoes: { ...config().revisoes, habilitadas: true, intervalos: [1, 7], diasPermitidos: [1, 3, 5] },
    });
    const p = projetarAgenda({ config: cfg, disciplinas, topicos: topicos("const", 1), revisoesPendentes: [], hoje: SEGUNDA });
    const revisoes = p.dias.flatMap((d) => d.itens.filter((i) => i.tipo === "revisao").map(() => d));
    expect(revisoes.map((d) => d.data)).toEqual(["2026-10-21", "2026-10-26"]); // 20/10 (ter) → qua; 26/10 (seg)
    expect(revisoes.every((d) => [1, 3, 5].includes(d.diaSemana))).toBe(true);
    expect(p.conclusaoRevisoes).toBe("2026-10-26");
  });

  it("revisão vencida no banco aparece hoje marcada como atrasada", () => {
    const cfg = config({ revisoes: { ...config().revisoes, habilitadas: true } });
    const p = projetarAgenda({
      config: cfg,
      disciplinas,
      topicos: tops,
      revisoesPendentes: [{ id: "r1", topicoId: "x", disciplinaId: "adm", numero: 2, dataAlvo: "2026-10-10" }],
      hoje: SEGUNDA,
    });
    const primeiro = p.dias[0].itens[0];
    expect(primeiro).toMatchObject({ tipo: "revisao", revisaoId: "r1", atrasadaDesde: "2026-10-10" });
    expect(p.dias[0].itens[1]).toMatchObject({ tipo: "teoria", minutos: 45 });
  });

  it("acúmulo de revisões respeita o teto do dia e não trava a teoria", () => {
    const cfg = config({ revisoes: { ...config().revisoes, habilitadas: true } });
    const pendentes = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      topicoId: `t${i}`,
      disciplinaId: "adm",
      numero: 1,
      dataAlvo: "2026-10-01",
    }));
    const p = projetarAgenda({ config: cfg, disciplinas, topicos: tops, revisoesPendentes: pendentes, hoje: SEGUNDA });
    const hoje = p.dias[0];
    expect(hoje.itens.filter((i) => i.tipo === "revisao")).toHaveLength(2); // 50% de 60 min
    expect(hoje.itens.filter((i) => i.tipo === "teoria").reduce((s, i) => s + i.minutos, 0)).toBe(30);
  });

  it("sem nenhum minuto disponível na semana devolve semCapacidade", () => {
    const cfg = config({ minutosPorDia: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } });
    const p = projetarAgenda({ config: cfg, disciplinas, topicos: tops, revisoesPendentes: [], hoje: SEGUNDA });
    expect(p.semCapacidade).toBe(true);
    expect(p.conclusaoTeoria).toBeNull();
  });

  it("desconta o que já foi estudado hoje da capacidade do dia", () => {
    const p = projetarAgenda({ config: config(), disciplinas, topicos: tops, revisoesPendentes: [], hoje: SEGUNDA, minutosJaEstudadosHoje: 40 });
    expect(p.dias[0].capacidadeMin).toBe(20);
    expect(p.dias[0].itens[0].minutos).toBe(20);
    expect(p.dias[1].capacidadeMin).toBe(60);
  });

  it("respeita o horizonte máximo", () => {
    const muitos = topicos("const", 500);
    const p = projetarAgenda({ config: config(), disciplinas, topicos: muitos, revisoesPendentes: [], hoje: SEGUNDA, horizonteDias: 30 });
    expect(p.dias).toHaveLength(30);
    expect(p.horizonteAtingido).toBe(true);
    expect(p.conclusaoTeoria).toBeNull();
  });
});

describe("ritmo e conclusão", () => {
  const tops = [...topicos("const", 12), ...topicos("adm", 8), ...topicos("port", 4)];
  const cfg = config({ dataInicio: "2026-10-01" });

  it("ritmo é realizado / disponível na janela", () => {
    const minutos: Record<string, number> = {};
    for (let i = 1; i <= 14; i++) minutos[somarDias(SEGUNDA, -i)] = 30;
    // 14 dias: 12 com 60 min disponíveis (2 domingos) = 720; estudou 14 × 30 = 420
    expect(calcularRitmo({ config: cfg, minutosPorData: minutos, hoje: SEGUNDA })).toBeCloseTo(420 / 720);
  });

  it("histórico curto devolve null", () => {
    expect(calcularRitmo({ config: config({ dataInicio: "2026-10-17" }), minutosPorData: {}, hoje: SEGUNDA })).toBeNull();
  });

  it("rendendo metade, a conclusão fica mais distante", () => {
    const minutos: Record<string, number> = {};
    for (let i = 1; i <= 14; i++) {
      const d = somarDias(SEGUNDA, -i);
      minutos[d] = diaDaSemana(d) === 0 ? 0 : 30;
    }
    const est = estimarConclusao(
      { config: cfg, disciplinas, topicos: tops, revisoesPendentes: [], hoje: SEGUNDA },
      minutos,
    );
    expect(est.ritmo).toBeCloseTo(0.5);
    expect(est.noPlano).toBe("2026-11-14"); // 24 blocos, 6 por semana → 4º sábado
    expect(est.noRitmoAtual! > est.noPlano!).toBe(true);
  });
});

describe("registrarEstudoNoCiclo", () => {
  const tops = [...topicos("const", 3), ...topicos("adm", 2), ...topicos("port", 1)];
  const fila = montarFilaTeoria(disciplinas, tops, config());

  it("turno completo avança a posição", () => {
    expect(registrarEstudoNoCiclo({ posicao: 0, minutosNoTurno: 0 }, { turno: 0, minutos: 55 }, fila)).toEqual({
      posicao: 1,
      minutosNoTurno: 0,
    });
  });

  it("turno parcial acumula minutos", () => {
    expect(registrarEstudoNoCiclo({ posicao: 0, minutosNoTurno: 0 }, { turno: 0, minutos: 25 }, fila)).toEqual({
      posicao: 0,
      minutosNoTurno: 25,
    });
  });

  it("depois de avançar, a próxima fila começa na disciplina seguinte", () => {
    const estado = registrarEstudoNoCiclo({ posicao: 0, minutosNoTurno: 0 }, { turno: 0, minutos: 60 }, fila);
    const topsDepois = tops.map((t) => (t.id === "const-1" ? { ...t, teoriaConcluida: true } : t));
    const nova = montarFilaTeoria(disciplinas, topsDepois, config(), estado);
    expect(nova[0].disciplinaId).toBe(sequenciaDoCiclo(disciplinas)[1]);
  });

  it("estudar um turno antigo não mexe na posição", () => {
    const estado = { posicao: 3, minutosNoTurno: 10 };
    expect(registrarEstudoNoCiclo(estado, { turno: 1, minutos: 60 }, fila)).toBe(estado);
  });
});

describe("modo fixo", () => {
  it("gera a partir da data de início e marca atrasados", () => {
    const tops = [...topicos("const", 3), ...topicos("adm", 2), ...topicos("port", 1)];
    const plano = gerarPlanoFixo({ config: config({ modo: "fixo" }), disciplinas, topicos: tops, revisoesPendentes: [] });
    expect(plano.dias[0].data).toBe(SEGUNDA);
    const itens = plano.dias.map((d) => ({ data: d.data, status: d.data === SEGUNDA ? "concluido" : "pendente" }));
    expect(itensAtrasados(itens, "2026-10-22").map((i) => i.data)).toEqual(["2026-10-20", "2026-10-21"]);
  });
});
