import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Página de módulo ainda não construído: diz o que vai existir e o que já está pronto no banco. */
export function EmConstrucao({ titulo, descricao, pronto }: { titulo: string; descricao: string; pronto: string }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-3 text-muted-foreground">{descricao}</p>
      <p className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Já pronto no banco: </span>
        {pronto}
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Voltar para Meu Dia</Link>
      </Button>
    </div>
  );
}
