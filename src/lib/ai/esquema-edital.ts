import { z } from "zod";

/**
 * Formato que a IA devolve ao ler o edital. É o mesmo formato que a função SQL
 * importar_edital() recebe, depois de revisado na tela.
 */

const Area = z.enum(["direito", "ti", "geral"]);

export const SubtopicoSchema = z.object({
  codigo: z.string().nullable().describe("Numeração no edital, ex.: '2.1'. null se não houver."),
  titulo: z.string().describe("Texto do subtópico, fiel ao edital, sem a numeração."),
});

export const TopicoSchema = z.object({
  codigo: z.string().nullable().describe("Numeração no edital, ex.: '2'. null se não houver."),
  titulo: z.string().describe("Texto do tópico, fiel ao edital, sem a numeração."),
  subtopicos: z.array(SubtopicoSchema).describe("Itens subordinados a este tópico. Lista vazia se não houver."),
});

export const DisciplinaSchema = z.object({
  nome: z.string().describe("Nome da disciplina como aparece no conteúdo programático, ex.: 'Direito Constitucional'."),
  area: Area.describe("direito para disciplinas jurídicas, ti para tecnologia da informação, geral para as demais."),
  peso: z.number().nullable().describe("Peso da disciplina na prova, se o edital informar."),
  qtd_questoes: z.number().nullable().describe("Número de questões da disciplina na prova, se o edital informar."),
  topicos: z.array(TopicoSchema),
});

export const EditalExtraidoSchema = z.object({
  edital: z.object({
    nome: z.string().describe("Nome curto do concurso, ex.: 'TRT 2ª Região — Analista Judiciário'."),
    orgao: z.string().nullable(),
    banca: z.string().nullable().describe("Banca organizadora, ex.: 'FCC', 'Cebraspe', 'FGV'."),
    cargo: z.string().nullable(),
    carreira: Area,
    ano: z.number().nullable(),
    data_prova: z.string().nullable().describe("Data da prova objetiva no formato AAAA-MM-DD, se constar."),
  }),
  disciplinas: z.array(DisciplinaSchema),
  observacoes: z
    .string()
    .nullable()
    .describe("Avisos curtos para quem vai revisar: trechos ilegíveis, cargos ignorados, conteúdo que parece faltar."),
});

export type EditalExtraido = z.infer<typeof EditalExtraidoSchema>;
export type DisciplinaExtraida = z.infer<typeof DisciplinaSchema>;
