import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Ementa" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Ementa"
      descricao="Tabela expansível de matérias e tópicos com teoria, marcadores da 1ª à 6ª revisão e aproveitamento nas questões."
      pronto="view v_ementa, que já devolve teoria concluída, revisões feitas, próxima revisão e % de acerto por tópico."
    />
  );
}
