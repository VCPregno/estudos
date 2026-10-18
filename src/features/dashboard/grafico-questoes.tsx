"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@/lib/data/painel";
import { cn, formatarData } from "@/lib/utils";

type Ponto = DashboardData["serie14"][number];

function Dica({ active, payload }: { active?: boolean; payload?: { payload: Ponto }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const total = p.certas + p.erradas;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">
        {formatarData.semanaCurta(p.dia)}, {formatarData.curta(p.dia)}
      </p>
      {total === 0 ? (
        <p className="mt-1 text-muted-foreground">Sem questões</p>
      ) : (
        <div className="mt-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
          <span className="size-2 rounded-[2px] bg-chart-certas" />
          <span>Certas</span>
          <span className="tabular text-right">{p.certas}</span>
          <span className="size-2 rounded-[2px] bg-chart-erradas" />
          <span>Erradas</span>
          <span className="tabular text-right">{p.erradas}</span>
          <span />
          <span className="text-muted-foreground">Acerto</span>
          <span className="tabular text-right font-medium">{Math.round((100 * p.certas) / total)}%</span>
        </div>
      )}
    </div>
  );
}

export function GraficoQuestoes({ serie }: { serie: DashboardData["serie14"] }) {
  const [tabela, setTabela] = useState(false);
  const certas = serie.reduce((s, p) => s + p.certas, 0);
  const total = serie.reduce((s, p) => s + p.certas + p.erradas, 0);

  return (
    <section aria-labelledby="grafico-questoes" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="grafico-questoes" className="font-semibold tracking-tight">
            Acertos e erros, últimos 14 dias
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total === 0 ? "Nenhuma questão resolvida no período." : `${total} questões, ${Math.round((100 * certas) / total)}% de acerto`}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-chart-certas" /> Certas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-chart-erradas" /> Erradas
          </span>
          <button
            type="button"
            className="rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => setTabela((t) => !t)}
          >
            {tabela ? "Ver gráfico" : "Ver tabela"}
          </button>
        </div>
      </div>

      {tabela ? (
        <div className="mt-4 max-h-56 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Dia</th>
                <th className="py-1 text-right font-medium">Certas</th>
                <th className="py-1 text-right font-medium">Erradas</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {serie.map((p) => (
                <tr key={p.dia} className="border-t">
                  <td className="py-1">{formatarData.curta(p.dia)}</td>
                  <td className="py-1 text-right">{p.certas}</td>
                  <td className="py-1 text-right">{p.erradas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={cn("mt-4 h-56")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} barCategoryGap="28%" margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis
                dataKey="dia"
                tickFormatter={(d: string) => formatarData.curta(d).slice(0, 2)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval={0}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<Dica />} />
              <Bar dataKey="certas" stackId="q" fill="var(--chart-certas)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
              <Bar
                dataKey="erradas"
                stackId="q"
                fill="var(--chart-erradas)"
                stroke="var(--card)"
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
