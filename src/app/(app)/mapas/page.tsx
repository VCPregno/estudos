import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Mapas e esquemas" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Mapas e esquemas"
      descricao="Seus mapas mentais em PDF ou imagem organizados em Disciplina e Assunto, com espaço para diagramas em React Flow."
      pronto="tabela mapas (com coluna diagrama para nós e arestas do React Flow) e o bucket privado mapas."
    />
  );
}
