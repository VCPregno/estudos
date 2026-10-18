import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Banco de questões" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Banco de questões"
      descricao="Filtros por carreira, banca, disciplina e assunto, com o comentário logo depois de responder e o tutor Pontes para explicar o erro."
      pronto="tabelas questoes e respostas_questoes, índice de busca em português e o importador em lote (npm run importar)."
    />
  );
}
