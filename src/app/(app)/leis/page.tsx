import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Leis secas" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Leis secas"
      descricao="Leitor limpo de legislação com marcações coloridas e notas por trecho."
      pronto="tabelas leis e lei_marcacoes (marcações por posição no texto)."
    />
  );
}
