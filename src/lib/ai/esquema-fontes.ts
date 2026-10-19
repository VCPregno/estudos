import { z } from "zod";

export const TipoFonte = z.enum(["norma", "guia", "classica", "orgao"]);
export type TipoFonte = z.infer<typeof TipoFonte>;

export const FontesClassificadasSchema = z.object({
  itens: z.array(
    z.object({
      chave: z.string().describe("A chave do tópico, exatamente como veio na lista (ex.: 'T12')."),
      tipo: TipoFonte,
      fonte: z.string().describe("Onde estudar, em até 120 caracteres. Sem links."),
    }),
  ),
});

export type FontesClassificadas = z.infer<typeof FontesClassificadasSchema>;
