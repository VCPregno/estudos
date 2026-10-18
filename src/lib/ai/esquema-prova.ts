import { z } from "zod";

/**
 * Formato que a IA devolve ao ler o caderno de uma prova (e, se houver, o
 * gabarito). Disciplinas e tópicos chegam como chaves curtas ("D3", "T41")
 * da lista que mandamos no prompt; o servidor troca pelas ids reais.
 */

export const AlternativaSchema = z.object({
  letra: z.string().describe("Letra da alternativa, maiúscula: A, B, C, D ou E."),
  texto: z.string().describe("Texto da alternativa, fiel ao caderno."),
});

export const QuestaoExtraidaSchema = z.object({
  numero: z.number().describe("Número da questão no caderno."),
  texto_apoio: z
    .string()
    .nullable()
    .describe("Id de um item de 'textos' quando a questão depende de um texto compartilhado (ex.: 't1'). null se não depender."),
  enunciado: z
    .string()
    .describe("Enunciado completo, fiel ao caderno. Código-fonte e comandos entre ``` e ```; tabelas em linhas com | separando colunas."),
  alternativas: z.array(AlternativaSchema).describe("Alternativas na ordem do caderno."),
  gabarito: z.string().nullable().describe("Letra correta. Do gabarito oficial quando enviado; senão, a sua melhor resposta."),
  anulada: z.boolean().describe("true se o gabarito oficial marcar a questão como anulada."),
  disciplina: z.string().nullable().describe("Chave da disciplina da lista enviada (ex.: 'D2'). null se nenhuma servir."),
  topico: z.string().nullable().describe("Chave do tópico mais específico da lista enviada (ex.: 'T41'). null se nenhum servir."),
  depende_de_imagem: z
    .boolean()
    .describe("true se a questão depende de figura, gráfico ou diagrama que não deu para transcrever em texto."),
});

export const ProvaExtraidaSchema = z.object({
  prova: z.object({
    banca: z.string().nullable(),
    orgao: z.string().nullable().describe("Órgão, curto: 'TRT-15', 'TRF-3', 'TJ-SP'."),
    cargo: z.string().nullable(),
    ano: z.number().nullable(),
  }),
  gabarito_oficial: z.boolean().describe("true se um gabarito oficial foi enviado e usado; false se os gabaritos são respostas suas."),
  textos: z
    .array(z.object({ id: z.string().describe("Id curto: t1, t2..."), texto: z.string().describe("Texto integral, fiel ao caderno.") }))
    .describe("Textos usados por mais de uma questão (comuns em Língua Portuguesa e Inglês)."),
  questoes: z.array(QuestaoExtraidaSchema),
  observacoes: z
    .string()
    .nullable()
    .describe("Avisos curtos: questões ilegíveis, páginas faltando, divergência entre caderno e gabarito."),
});

export type ProvaExtraida = z.infer<typeof ProvaExtraidaSchema>;
export type QuestaoExtraida = z.infer<typeof QuestaoExtraidaSchema>;
