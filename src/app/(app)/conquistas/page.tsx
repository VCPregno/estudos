import type { Metadata } from "next";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const metadata: Metadata = { title: "Minhas conquistas" };

export default function Page() {
  return (
    <EmConstrucao
      titulo="Minhas conquistas"
      descricao="Ofensiva diária, recorde e as conquistas desbloqueadas."
      pronto="catálogo de conquistas, função verificar_conquistas e calcular_ofensiva."
    />
  );
}
