/**
 * Dados de demonstração (sem Supabase configurado). Tudo é gerado relativo a
 * "hoje" e passa pelo mesmo algoritmo do ciclo que os dados reais.
 */

import { type DataISO, type RevisaoPendente, type TopicoCiclo, somarDias } from "@/lib/ciclo";
import type { DisciplinaPainel, EntradaPainel, ProgressoDia } from "./painel";

const EMENTA: { id: string; nome: string; peso: number; topicos: string[] }[] = [
  {
    id: "const",
    nome: "Direito Constitucional",
    peso: 3,
    topicos: [
      "Princípios fundamentais",
      "Direitos e garantias fundamentais",
      "Direitos sociais",
      "Nacionalidade e direitos políticos",
      "Organização do Estado",
      "Administração Pública (arts. 37 a 41)",
      "Poder Legislativo e processo legislativo",
      "Poder Executivo",
      "Poder Judiciário",
      "Funções essenciais à Justiça",
      "Controle de constitucionalidade",
    ],
  },
  {
    id: "trab",
    nome: "Direito do Trabalho",
    peso: 3,
    topicos: [
      "Princípios e fontes do Direito do Trabalho",
      "Relação de emprego",
      "Contrato individual de trabalho",
      "Jornada de trabalho",
      "Remuneração e salário",
      "Férias",
      "Alteração, suspensão e interrupção do contrato",
      "Extinção do contrato e verbas rescisórias",
      "Estabilidade e garantias de emprego",
      "FGTS",
    ],
  },
  {
    id: "proc",
    nome: "Processo do Trabalho",
    peso: 2,
    topicos: [
      "Organização da Justiça do Trabalho",
      "Competência",
      "Partes e procuradores",
      "Atos, termos e prazos processuais",
      "Petição inicial e resposta do réu",
      "Provas",
      "Sentença e coisa julgada",
      "Recursos",
      "Execução",
    ],
  },
  {
    id: "adm",
    nome: "Direito Administrativo",
    peso: 2,
    topicos: [
      "Princípios da Administração Pública",
      "Organização administrativa",
      "Poderes administrativos",
      "Atos administrativos",
      "Licitações (Lei 14.133/2021)",
      "Contratos administrativos",
      "Agentes públicos e Lei 8.112/1990",
      "Improbidade administrativa",
      "Responsabilidade civil do Estado",
    ],
  },
  {
    id: "port",
    nome: "Língua Portuguesa",
    peso: 1,
    topicos: [
      "Compreensão e interpretação de textos",
      "Ortografia e acentuação",
      "Classes de palavras",
      "Concordância verbal e nominal",
      "Regência e crase",
      "Pontuação",
      "Colocação pronominal",
    ],
  },
];

/** gerador pseudoaleatório determinístico (mesmos números a cada render) */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function entradaDemo(hoje: DataISO): EntradaPainel {
  const rand = aleatorio(42);

  const disciplinas: DisciplinaPainel[] = EMENTA.map((d, i) => ({
    id: d.id,
    nome: d.nome,
    peso: d.peso,
    ordem: i,
    cor: i + 1,
  }));

  const concluidosPorDisciplina: Record<string, number> = { const: 4, trab: 4, proc: 2, adm: 3, port: 2 };
  const topicos: TopicoCiclo[] = EMENTA.flatMap((d) =>
    d.topicos.map((titulo, i) => ({
      id: `${d.id}-${i + 1}`,
      disciplinaId: d.id,
      titulo,
      ordem: i,
      minutosEstimados: d.id === "port" ? 60 : 90,
      minutosEstudados: i < concluidosPorDisciplina[d.id] ? 90 : i === concluidosPorDisciplina[d.id] ? 30 : 0,
      teoriaConcluida: i < concluidosPorDisciplina[d.id],
    })),
  );

  // revisões pendentes dos tópicos concluídos: uma atrasada, algumas para hoje e o resto adiante
  const revisoes: RevisaoPendente[] = [
    { id: "rev-1", topicoId: "const-2", disciplinaId: "const", numero: 3, dataAlvo: somarDias(hoje, -3) },
    { id: "rev-2", topicoId: "trab-4", disciplinaId: "trab", numero: 1, dataAlvo: hoje },
    { id: "rev-3", topicoId: "adm-3", disciplinaId: "adm", numero: 2, dataAlvo: hoje },
    { id: "rev-4", topicoId: "proc-2", disciplinaId: "proc", numero: 2, dataAlvo: somarDias(hoje, 2) },
    { id: "rev-5", topicoId: "const-4", disciplinaId: "const", numero: 1, dataAlvo: somarDias(hoje, 3) },
    { id: "rev-6", topicoId: "port-2", disciplinaId: "port", numero: 3, dataAlvo: somarDias(hoje, 5) },
  ];

  // 21 dias de histórico; ofensiva contínua nos últimos 12
  const progresso: ProgressoDia[] = [];
  for (let i = 20; i >= 0; i--) {
    const dia = somarDias(hoje, -i);
    const ativo = i <= 12 || rand() > 0.45;
    if (!ativo) continue;
    const questoes = i === 0 ? 14 : Math.round(12 + rand() * 30);
    const taxa = 0.58 + rand() * 0.27;
    progresso.push({
      dia,
      segundos: i === 0 ? 35 * 60 : Math.round((50 + rand() * 80) * 60),
      questoes,
      certas: Math.round(questoes * taxa),
      flashcards: Math.round(rand() * 40),
    });
  }

  return {
    modo: "demo",
    hoje,
    ofensiva: { atual: 13, recorde: 21, ativoHoje: true },
    metaDiariaMin: 120,
    progresso,
    flashcardsDevidos: 37,
    ciclo: {
      cronogramaId: "demo",
      config: {
        modo: "dinamico",
        dataInicio: somarDias(hoje, -40),
        minutosPorDia: { 0: 120, 1: 90, 2: 90, 3: 90, 4: 90, 5: 90, 6: 180 },
        duracaoBlocoMin: 60,
        fragmentoMinimoMin: 20,
        revisoes: {
          habilitadas: true,
          intervalos: [1, 7, 14, 30, 90],
          diasPermitidos: [0, 1, 2, 3, 4, 5, 6],
          minutosPorRevisao: 15,
          limiteDoDia: 0.5,
        },
      },
      estado: { posicao: 13, minutosNoTurno: 0 },
      disciplinas,
      topicos,
      revisoes,
      edital: {
        id: "demo",
        nome: "TRT 2ª Região — Analista Judiciário, Área Judiciária",
        banca: "FCC",
        dataProva: somarDias(hoje, 147),
      },
    },
  };
}
