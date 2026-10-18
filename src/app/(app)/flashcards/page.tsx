import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Flashcards" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Flashcards"
      descricao="Repetição espaçada com Errei, Difícil, Bom e Fácil, separando memória de curto prazo (aprendendo) e de longo prazo (revisão)."
      pronto="tabelas flashcards (estado, etapa, facilidade, intervalo, vencimento) e flashcard_revisoes, que alimenta a ofensiva."
    />
  );
}
