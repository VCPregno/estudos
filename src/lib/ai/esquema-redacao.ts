import { z } from "zod";

export const CorrecaoRedacaoSchema = z.object({
  transcricao: z
    .string()
    .describe("O texto do candidato, fiel, com os erros originais. Trecho ilegível vira [ilegível]. Parágrafos separados por linha em branco."),
  linhas_estimadas: z.number().describe("Linhas que o texto ocupa: contadas na folha (foto) ou estimadas com ~70 caracteres por linha (digitado)."),
  fuga_ao_tema: z.boolean(),
  criterios: z.array(
    z.object({
      nome: z.string(),
      nota: z.number(),
      maximo: z.number(),
      comentario: z.string().describe("Por que essa nota, citando o texto. Duas a quatro frases."),
    }),
  ),
  erros: z.array(
    z.object({
      trecho: z.string().describe("O menor trecho exato da transcrição que contém o erro: em geral a própria palavra errada, no máximo três palavras."),
      correcao: z.string().describe("Como fica corrigido."),
      tipo: z.enum(["ortografia", "acentuacao", "pontuacao", "concordancia", "regencia", "crase", "coesao", "vocabulario", "estrutura", "argumentacao", "outro"]),
      explicacao: z.string().describe("A regra, em uma frase."),
    }),
  ),
  pontos_fortes: z
    .array(z.string())
    .describe("Só o que está de fato no texto do candidato. Não atribua a ele citações, artigos ou argumentos que ele não escreveu."),
  melhorias: z.array(z.string()).describe("O que fazer para subir a nota, do maior impacto para o menor."),
  paragrafo_modelo: z
    .object({ original: z.string(), reescrito: z.string() })
    .nullable()
    .describe("O parágrafo mais fraco e uma versão reescrita, mantendo a ideia do candidato."),
  resumo: z.string().describe("Avaliação geral em duas frases."),
});
export type CorrecaoRedacao = z.infer<typeof CorrecaoRedacaoSchema>;

export const TemaSugeridoSchema = z.object({
  tema: z.string(),
  textos_motivadores: z.array(z.string()).describe("Dois ou três textos curtos de apoio, escritos por você, sem citar fontes inventadas."),
});
export type TemaSugerido = z.infer<typeof TemaSugeridoSchema>;
