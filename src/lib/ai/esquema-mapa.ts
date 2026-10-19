import { z } from "zod";

export const MapaGeradoSchema = z.object({
  titulo: z.string().describe("Título curto do mapa."),
  conteudo: z
    .string()
    .describe("Mapa mental: Markdown com '# Título' e listas '- ' aninhadas. Fluxograma: código Mermaid começando com 'flowchart TD'."),
});
export type MapaGerado = z.infer<typeof MapaGeradoSchema>;
