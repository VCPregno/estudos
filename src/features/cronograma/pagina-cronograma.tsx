"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Pencil, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type DiaSemana, maxData, projetarAgenda, sequenciaDoCiclo } from "@/lib/ciclo";
import type { DadosCronograma } from "@/lib/data/cronograma";
import { formatarData, formatarDuracao } from "@/lib/utils";
import { WizardCronograma } from "./wizard-cronograma";

const DIAS: { dia: DiaSemana; curto: string }[] = [
  { dia: 1, curto: "Seg" },
  { dia: 2, curto: "Ter" },
  { dia: 3, curto: "Qua" },
  { dia: 4, curto: "Qui" },
  { dia: 5, curto: "Sex" },
  { dia: 6, curto: "Sáb" },
  { dia: 0, curto: "Dom" },
];

export function PaginaCronograma({ dados }: { dados: DadosCronograma }) {
  const [editando, setEditando] = useState(!dados.atual);

  if (editando || !dados.atual) {
    return <WizardCronograma dados={dados} onCancelar={dados.atual ? () => setEditando(false) : undefined} />;
  }
  return <ResumoCronograma dados={dados} onEditar={() => setEditando(true)} />;
}

function ResumoCronograma({ dados, onEditar }: { dados: DadosCronograma; onEditar: () => void }) {
  const atual = dados.atual!;
  const edital = dados.editais.find((e) => e.id === atual.editalId);
  const cfg = atual.config;
  const nomes = new Map(edital?.disciplinas.map((d) => [d.id, d]) ?? []);
  const disciplinas = atual.disciplinas.map((d) => ({
    ...d,
    nome: nomes.get(d.id)?.nome ?? "Disciplina",
    cor: nomes.get(d.id)?.cor ?? 1,
  }));
  const totalSemana = (Object.values(cfg.minutosPorDia) as number[]).reduce((a, b) => a + b, 0);

  const fim = useMemo(() => {
    if (!edital) return null;
    return projetarAgenda({
      config: cfg,
      disciplinas,
      topicos: edital.topicos,
      revisoesPendentes: [],
      hoje: maxData(dados.hoje, cfg.dataInicio),
      horizonteDias: 1460,
    }).conclusaoTeoria;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  const sequencia = sequenciaDoCiclo(disciplinas);

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Cronograma ativo</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{atual.nome}</h1>
          {edital && <p className="mt-1 text-muted-foreground">{edital.nome}</p>}
        </div>
        <Button variant="outline" onClick={onEditar}>
          <Pencil />
          Refazer cronograma
        </Button>
      </div>

      <dl className="mt-8 grid gap-x-6 gap-y-5 rounded-xl border bg-card p-5 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Modo</dt>
          <dd className="mt-1 flex items-center gap-2 font-semibold">
            {cfg.modo === "dinamico" ? <Shuffle className="size-4 text-highlight-ink" /> : <CalendarCheck className="size-4 text-highlight-ink" />}
            {cfg.modo === "dinamico" ? "Ciclo dinâmico" : "Cronograma fixo"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Por semana</dt>
          <dd className="tabular mt-1 font-semibold">
            {formatarDuracao(totalSemana * 60)}, blocos de {cfg.duracaoBlocoMin} min
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Teoria termina em</dt>
          <dd className="mt-1 font-semibold">{fim ? formatarData.longa(fim) : "Sem previsão"}</dd>
        </div>
      </dl>

      <section className="mt-8" aria-labelledby="semana">
        <h2 id="semana" className="mb-3 font-semibold">
          Semana
        </h2>
        <ol className="grid grid-cols-7 gap-1.5">
          {DIAS.map(({ dia, curto }) => (
            <li key={dia} className="rounded-lg border bg-card px-1 py-2 text-center">
              <span className="block text-xs text-muted-foreground">{curto}</span>
              <span className="tabular mt-0.5 block text-sm font-semibold">
                {cfg.minutosPorDia[dia] ? formatarDuracao(cfg.minutosPorDia[dia] * 60) : "–"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="ordem">
        <h2 id="ordem" className="mb-3 font-semibold">
          Ordem e peso
        </h2>
        <ol className="flex flex-col gap-1.5">
          {disciplinas.map((d, i) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="tabular w-5 text-muted-foreground">{i + 1}</span>
              <span aria-hidden className="h-5 w-1 rounded-full" style={{ background: `var(--disc-${d.cor})` }} />
              <span className="min-w-0 flex-1 truncate">{d.nome}</span>
              <span className="text-muted-foreground">{d.ativo ? `peso ${d.peso}` : "fora do ciclo"}</span>
            </li>
          ))}
        </ol>
        {sequencia.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Cada volta do ciclo tem {sequencia.length} blocos.</p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="revisoes">
        <h2 id="revisoes" className="mb-2 font-semibold">
          Revisões
        </h2>
        <p className="text-sm text-muted-foreground">
          {cfg.revisoes.habilitadas
            ? `Depois de ${cfg.revisoes.intervalos.join(", ")} dias, ${cfg.revisoes.minutosPorRevisao} min cada, em ${
                cfg.revisoes.diasPermitidos.length === 7
                  ? "qualquer dia"
                  : DIAS.filter((d) => cfg.revisoes.diasPermitidos.includes(d.dia))
                      .map((d) => d.curto.toLowerCase())
                      .join(", ")
              }.`
            : "Desligadas."}
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild variant="highlight">
          <Link href="/">Ir para Meu Dia</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/ementa">Ver ementa</Link>
        </Button>
      </div>
    </div>
  );
}
