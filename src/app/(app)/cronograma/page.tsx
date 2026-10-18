import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Cronograma" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Cronograma"
      descricao="Assistente de criação: edital, modo dinâmico ou fixo, ordem das disciplinas por arrastar, horas por dia da semana e revisões espaçadas."
      pronto="tabelas cronogramas, cronograma_disciplinas e cronograma_itens, além do algoritmo do ciclo dinâmico em src/lib/ciclo."
    />
  );
}
