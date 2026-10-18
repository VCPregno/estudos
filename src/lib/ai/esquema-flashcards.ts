import { z } from "zod";

export const FlashcardsGeradosSchema = z.object({
  cards: z.array(
    z.object({
      frente: z.string().describe("Pergunta objetiva."),
      verso: z.string().describe("Resposta curta."),
    }),
  ),
});

export type FlashcardsGerados = z.infer<typeof FlashcardsGeradosSchema>;
