"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, CalendarCheck, GripVertical, Loader2, Minus, Plus, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { salvarCronograma } from "@/app/actions/cronograma";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label } from "@/components/ui/primitives";
import {
  type ConfigCiclo,
  type DataISO,
  type DiaSemana,
  diferencaEmDias,
  maxData,
  projetarAgenda,
  sequenciaDoCiclo,
} from "@/lib/ciclo";
import type { CronogramaAtual, DadosCronograma, EditalOpcao } from "@/lib/data/cronograma";
import { cn, formatarData, formatarDuracao } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Estado
// -----------------------------------------------------------------------------

interface DisciplinaWizard {
  id: string;
  nome: string;
  cor: number;
  topicos: number;
  peso: number;
  ativo: boolean;
}

interface EstadoWizard {
  editalId: string | null;
  nome: string;
  modo: "dinamico" | "fixo";
  dataInicio: DataISO;
  disciplinas: DisciplinaWizard[];
  minutosPorDia: number[]; // índice = dia da semana (0 = domingo)
  duracaoBlocoMin: number;
  revisoes: { habilitadas: boolean; intervalos: number[]; diasPermitidos: number[]; minutosPorRevisao: number };
}

const DIAS_EXIBICAO: { dia: DiaSemana; curto: string; longo: string }[] = [
  { dia: 1, curto: "Seg", longo: "Segunda" },
  { dia: 2, curto: "Ter", longo: "Terça" },
  { dia: 3, curto: "Qua", longo: "Quarta" },
  { dia: 4, curto: "Qui", longo: "Quinta" },
  { dia: 5, curto: "Sex", longo: "Sexta" },
  { dia: 6, curto: "Sáb", longo: "Sábado" },
  { dia: 0, curto: "Dom", longo: "Domingo" },
];

const INTERVALOS_OPCOES = [1, 3, 7, 14, 30, 60, 90, 180];
const BLOCOS = [30, 45, 60, 90, 120];

const PASSOS = ["Edital", "Modo", "Disciplinas", "Semana", "Revisões", "Resumo"] as const;

function pesoInicial(peso: number | null) {
  return Math.min(5, Math.max(1, Math.round(peso ?? 1)));
}

function disciplinasDoEdital(edital: EditalOpcao, atual: CronogramaAtual | null): DisciplinaWizard[] {
  const contagem = new Map<string, number>();
  edital.topicos.forEach((t) => contagem.set(t.disciplinaId, (contagem.get(t.disciplinaId) ?? 0) + 1));
  const base = edital.disciplinas.map((d) => ({
    id: d.id,
    nome: d.nome,
    cor: d.cor,
    topicos: contagem.get(d.id) ?? 0,
    peso: pesoInicial(d.pesoEdital),
    ativo: true,
  }));
  if (!atual || atual.editalId !== edital.id) return base;
  // reaproveita ordem, peso e inclusão do cronograma atual
  const salvo = new Map(atual.disciplinas.map((d) => [d.id, d]));
  return base
    .map((d) => (salvo.has(d.id) ? { ...d, peso: salvo.get(d.id)!.peso, ativo: salvo.get(d.id)!.ativo } : d))
    .sort((a, b) => (salvo.get(a.id)?.ordem ?? 999) - (salvo.get(b.id)?.ordem ?? 999));
}

function estadoInicial(dados: DadosCronograma): EstadoWizard {
  const atual = dados.atual;
  const edital = dados.editais.find((e) => e.id === atual?.editalId) ?? dados.editais[0] ?? null;
  const cfg = atual?.config;
  return {
    editalId: edital?.id ?? null,
    nome: atual?.nome ?? (edital ? `Ciclo ${edital.nome}`.slice(0, 120) : "Meu ciclo"),
    modo: cfg?.modo ?? "dinamico",
    dataInicio: dados.hoje,
    disciplinas: edital ? disciplinasDoEdital(edital, atual) : [],
    minutosPorDia: cfg ? [0, 1, 2, 3, 4, 5, 6].map((d) => cfg.minutosPorDia[d as DiaSemana] ?? 0) : [0, 60, 60, 60, 60, 60, 120],
    duracaoBlocoMin: cfg?.duracaoBlocoMin ?? 60,
    revisoes: cfg
      ? {
          habilitadas: cfg.revisoes.habilitadas,
          intervalos: cfg.revisoes.intervalos,
          diasPermitidos: cfg.revisoes.diasPermitidos,
          minutosPorRevisao: cfg.revisoes.minutosPorRevisao,
        }
      : { habilitadas: true, intervalos: [1, 7, 14, 30, 90], diasPermitidos: [0, 1, 2, 3, 4, 5, 6], minutosPorRevisao: 15 },
  };
}

function paraConfig(s: EstadoWizard): ConfigCiclo {
  return {
    modo: s.modo,
    dataInicio: s.dataInicio,
    minutosPorDia: Object.fromEntries(s.minutosPorDia.map((m, i) => [i, m])) as Record<DiaSemana, number>,
    duracaoBlocoMin: s.duracaoBlocoMin,
    fragmentoMinimoMin: 20,
    revisoes: {
      habilitadas: s.revisoes.habilitadas,
      intervalos: [...s.revisoes.intervalos].sort((a, b) => a - b),
      diasPermitidos: s.revisoes.diasPermitidos as DiaSemana[],
      minutosPorRevisao: s.revisoes.minutosPorRevisao,
      limiteDoDia: 0.5,
    },
  };
}

const minutos = (m: number) => (m === 0 ? "Folga" : formatarDuracao(m * 60));

// -----------------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------------

export function WizardCronograma({ dados, onCancelar }: { dados: DadosCronograma; onCancelar?: () => void }) {
  const router = useRouter();
  const [s, setS] = useState<EstadoWizard>(() => estadoInicial(dados));
  const [passo, setPasso] = useState(0);
  const [salvando, startTransition] = useTransition();

  const edital = dados.editais.find((e) => e.id === s.editalId) ?? null;
  const set = <K extends keyof EstadoWizard>(k: K, v: EstadoWizard[K]) => setS((atual) => ({ ...atual, [k]: v }));

  const previa = useMemo(() => {
    if (!edital) return null;
    const config = paraConfig(s);
    const disciplinas = s.disciplinas.map((d, i) => ({ id: d.id, nome: d.nome, peso: d.peso, ordem: i, ativo: d.ativo }));
    const projecao = projetarAgenda({
      config,
      disciplinas,
      topicos: edital.topicos,
      revisoesPendentes: [],
      hoje: maxData(dados.hoje, s.dataInicio),
      horizonteDias: 1460,
    });
    return { projecao, sequencia: sequenciaDoCiclo(disciplinas) };
  }, [s, edital, dados.hoje]);

  const erroDoPasso = (p: number): string | null => {
    if (p === 0 && !edital) return "Escolha um edital.";
    if (p === 1 && !s.nome.trim()) return "Dê um nome ao cronograma.";
    if (p === 2 && !s.disciplinas.some((d) => d.ativo)) return "Inclua pelo menos uma disciplina.";
    if (p === 3 && s.minutosPorDia.every((m) => m === 0)) return "Reserve tempo em pelo menos um dia.";
    if (p === 4 && s.revisoes.habilitadas && (!s.revisoes.intervalos.length || !s.revisoes.diasPermitidos.length))
      return "Escolha ao menos um intervalo e um dia para as revisões.";
    return null;
  };

  function avancar() {
    const erro = erroDoPasso(passo);
    if (erro) {
      toast.error(erro);
      return;
    }
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  }

  function salvar() {
    startTransition(async () => {
      const r = await salvarCronograma({
        editalId: s.editalId,
        nome: s.nome,
        modo: s.modo,
        dataInicio: s.dataInicio,
        disciplinas: s.disciplinas.map(({ id, peso, ativo }) => ({ id, peso, ativo })),
        minutosPorDia: s.minutosPorDia,
        duracaoBlocoMin: s.duracaoBlocoMin,
        revisoes: s.revisoes,
      });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      if (r.demo) {
        toast("Modo demonstração: o cronograma não foi gravado.");
        return;
      }
      toast.success(r.itensFixos ? `Cronograma criado com ${r.itensFixos} blocos agendados.` : "Cronograma criado. Bons estudos!");
      router.push("/");
    });
  }

  if (dados.editais.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Cronograma</h1>
        <p className="mt-3 text-muted-foreground">
          O cronograma é montado em cima da ementa de um edital. Importe um edital primeiro e volte aqui.
        </p>
        <Button asChild variant="highlight" className="mt-6">
          <Link href="/editais/importar">Importar edital</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <ol className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-3 text-sm" aria-label="Etapas do cronograma">
        {PASSOS.map((rotulo, i) => (
          <li key={rotulo} className="flex items-center gap-2" aria-current={i === passo ? "step" : undefined}>
            <button
              type="button"
              disabled={i > passo}
              onClick={() => setPasso(i)}
              className={cn(
                "grid size-6 place-items-center rounded-full border text-xs tabular outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                i < passo && "border-foreground bg-foreground text-background",
                i === passo && "border-highlight bg-highlight font-semibold text-highlight-foreground",
                i > passo && "text-muted-foreground",
              )}
              aria-label={`Etapa ${i + 1}: ${rotulo}`}
            >
              {i + 1}
            </button>
            <span className={cn("hidden md:inline", i === passo ? "text-foreground" : "text-muted-foreground")}>{rotulo}</span>
            {i < PASSOS.length - 1 && <span aria-hidden className="h-px w-4 bg-border md:w-6" />}
          </li>
        ))}
      </ol>

      {passo === 0 && <PassoEdital dados={dados} s={s} setS={setS} />}
      {passo === 1 && <PassoModo s={s} set={set} hoje={dados.hoje} />}
      {passo === 2 && <PassoDisciplinas s={s} set={set} sequencia={previa?.sequencia ?? []} />}
      {passo === 3 && <PassoSemana s={s} set={set} />}
      {passo === 4 && <PassoRevisoes s={s} set={set} />}
      {passo === 5 && previa && edital && <PassoResumo s={s} edital={edital} previa={previa} hoje={dados.hoje} />}

      <div className="sticky bottom-20 z-10 mt-8 flex items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 backdrop-blur md:bottom-4">
        <div className="flex gap-2">
          {passo > 0 ? (
            <Button variant="ghost" onClick={() => setPasso((p) => p - 1)} disabled={salvando}>
              <ArrowLeft />
              Voltar
            </Button>
          ) : (
            onCancelar && (
              <Button variant="ghost" onClick={onCancelar}>
                Cancelar
              </Button>
            )
          )}
        </div>
        {passo < PASSOS.length - 1 ? (
          <Button onClick={avancar}>
            Continuar
            <ArrowRight />
          </Button>
        ) : (
          <Button variant="highlight" size="lg" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
            Salvar e começar
          </Button>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Passos
// -----------------------------------------------------------------------------

type SetCampo = <K extends keyof EstadoWizard>(k: K, v: EstadoWizard[K]) => void;

function Titulo({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{titulo}</h1>
      {children && <p className="mt-2 max-w-prose text-muted-foreground">{children}</p>}
    </div>
  );
}

function PassoEdital({
  dados,
  s,
  setS,
}: {
  dados: DadosCronograma;
  s: EstadoWizard;
  setS: React.Dispatch<React.SetStateAction<EstadoWizard>>;
}) {
  return (
    <section>
      <Titulo titulo="Para qual edital?">O ciclo usa as disciplinas e os tópicos da ementa desse edital.</Titulo>
      <div role="radiogroup" aria-label="Edital" className="flex flex-col gap-2">
        {dados.editais.map((e) => {
          const selecionado = e.id === s.editalId;
          return (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={selecionado}
              onClick={() =>
                setS((atual) => ({
                  ...atual,
                  editalId: e.id,
                  nome: atual.editalId === e.id ? atual.nome : `Ciclo ${e.nome}`.slice(0, 120),
                  disciplinas: disciplinasDoEdital(e, dados.atual),
                }))
              }
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card p-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                selecionado && "border-highlight shadow-[inset_3px_0_0_var(--highlight)]",
              )}
            >
              <span
                aria-hidden
                className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border", selecionado && "border-highlight")}
              >
                {selecionado && <span className="size-2 rounded-full bg-highlight" />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{e.nome}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {[
                    e.banca,
                    `${e.disciplinas.length} disciplinas`,
                    `${e.topicos.length} tópicos`,
                    e.dataProva ? `prova em ${formatarData.longa(e.dataProva)}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <Link href="/editais/importar" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">
        Importar outro edital
      </Link>
    </section>
  );
}

function PassoModo({ s, set, hoje }: { s: EstadoWizard; set: SetCampo; hoje: DataISO }) {
  const opcoes = [
    {
      valor: "dinamico" as const,
      titulo: "Ciclo dinâmico",
      selo: "Recomendado",
      icone: Shuffle,
      texto:
        "Você estuda a próxima disciplina da fila, seja qual for o dia. Se um dia passar sem estudo, nada atrasa: a fila inteira só anda pra frente.",
    },
    {
      valor: "fixo" as const,
      titulo: "Cronograma fixo",
      selo: null,
      icone: CalendarCheck,
      texto: "Cada bloco ganha uma data. O que não for feito no dia continua aparecendo como atrasado até você fazer.",
    },
  ];
  return (
    <section>
      <Titulo titulo="Como o cronograma deve se comportar?" />
      <div role="radiogroup" aria-label="Modo" className="grid gap-3 sm:grid-cols-2">
        {opcoes.map(({ valor, titulo, selo, icone: Icone, texto }) => {
          const selecionado = s.modo === valor;
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={selecionado}
              onClick={() => set("modo", valor)}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                selecionado && "border-highlight shadow-[inset_0_3px_0_var(--highlight)]",
              )}
            >
              <span className="flex items-center gap-2">
                <Icone className={cn("size-5", selecionado ? "text-highlight-ink" : "text-muted-foreground")} />
                <span className="font-semibold">{titulo}</span>
                {selo && <span className="rounded-full bg-highlight/15 px-2 py-0.5 text-xs text-highlight-ink">{selo}</span>}
              </span>
              <span className="text-sm text-muted-foreground">{texto}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_200px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="nome-cronograma">Nome do cronograma</Label>
          <Input id="nome-cronograma" value={s.nome} maxLength={120} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="inicio">Começa em</Label>
          <Input id="inicio" type="date" min={hoje} value={s.dataInicio} onChange={(e) => set("dataInicio", e.target.value || hoje)} />
        </div>
      </div>
    </section>
  );
}

function LinhaDisciplina({ d, onChange }: { d: DisciplinaWizard; onChange: (d: DisciplinaWizard) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-2 pr-3",
        isDragging && "relative z-10 shadow-lg ring-1 ring-highlight/60",
        !d.ativo && "opacity-55",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Arrastar ${d.nome}`}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        checked={d.ativo}
        onCheckedChange={(v) => onChange({ ...d, ativo: v === true })}
        aria-label={`Incluir ${d.nome} no ciclo`}
      />
      <span aria-hidden className="ml-1 h-7 w-1 shrink-0 rounded-full" style={{ background: `var(--disc-${d.cor})` }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{d.nome}</span>
        <span className="text-xs text-muted-foreground">{d.topicos} tópicos</span>
      </span>
      <span className="flex items-center gap-1" role="group" aria-label={`Peso de ${d.nome}`}>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Diminuir peso"
          disabled={d.peso <= 1 || !d.ativo}
          onClick={() => onChange({ ...d, peso: d.peso - 1 })}
        >
          <Minus />
        </Button>
        <span className="tabular w-6 text-center text-sm font-semibold">{d.peso}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Aumentar peso"
          disabled={d.peso >= 5 || !d.ativo}
          onClick={() => onChange({ ...d, peso: d.peso + 1 })}
        >
          <Plus />
        </Button>
      </span>
    </li>
  );
}

function PassoDisciplinas({ s, set, sequencia }: { s: EstadoWizard; set: SetCampo; sequencia: string[] }) {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const porId = new Map(s.disciplinas.map((d) => [d.id, d]));

  function aoSoltar(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const de = s.disciplinas.findIndex((d) => d.id === e.active.id);
    const para = s.disciplinas.findIndex((d) => d.id === e.over!.id);
    set("disciplinas", arrayMove(s.disciplinas, de, para));
  }

  return (
    <section>
      <Titulo titulo="Ordem e peso das disciplinas">
        Arraste para definir a prioridade: a primeira da lista abre cada volta do ciclo. O peso é quantos blocos a
        disciplina recebe por volta.
      </Titulo>
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={s.disciplinas.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-1.5">
            {s.disciplinas.map((d) => (
              <LinhaDisciplina
                key={d.id}
                d={d}
                onChange={(nova) => set("disciplinas", s.disciplinas.map((x) => (x.id === nova.id ? nova : x)))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {sequencia.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm text-muted-foreground">Uma volta do ciclo fica assim:</p>
          <ol className="flex flex-wrap gap-1.5">
            {sequencia.map((id, i) => {
              const d = porId.get(id)!;
              return (
                <li
                  key={`${id}-${i}`}
                  className="flex items-center gap-1.5 rounded-full border bg-card py-1 pr-2.5 pl-1.5 text-xs"
                  title={d.nome}
                >
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: `var(--disc-${d.cor})` }} />
                  <span className="max-w-36 truncate">{d.nome}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function PassoSemana({ s, set }: { s: EstadoWizard; set: SetCampo }) {
  const total = s.minutosPorDia.reduce((a, b) => a + b, 0);
  return (
    <section>
      <Titulo titulo="Quanto tempo por dia?">
        Conte só o tempo líquido de estudo. Dá pra mudar depois, e o ciclo se ajusta sozinho.
      </Titulo>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {DIAS_EXIBICAO.map(({ dia, longo }) => {
          const valor = s.minutosPorDia[dia];
          return (
            <li key={dia} className="grid grid-cols-[84px_1fr_64px] items-center gap-3 px-4 py-3">
              <label htmlFor={`dia-${dia}`} className="text-sm font-medium">
                {longo}
              </label>
              <input
                id={`dia-${dia}`}
                type="range"
                min={0}
                max={480}
                step={15}
                value={valor}
                onChange={(e) => {
                  const novo = [...s.minutosPorDia];
                  novo[dia] = Number(e.target.value);
                  set("minutosPorDia", novo);
                }}
                className="w-full accent-[var(--highlight)]"
                aria-valuetext={minutos(valor)}
              />
              <span className={cn("tabular text-right text-sm", valor === 0 ? "text-muted-foreground" : "font-semibold")}>
                {minutos(valor)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        Total na semana: <span className="tabular font-semibold text-foreground">{formatarDuracao(total * 60)}</span>
      </p>

      <fieldset className="mt-8">
        <legend className="mb-1 font-medium">Duração de cada bloco</legend>
        <p className="mb-3 text-sm text-muted-foreground">
          Quanto tempo cada disciplina recebe por vez antes de passar para a próxima do ciclo.
        </p>
        <div className="flex flex-wrap gap-2">
          {BLOCOS.map((b) => (
            <Button
              key={b}
              variant={s.duracaoBlocoMin === b ? "default" : "outline"}
              size="sm"
              aria-pressed={s.duracaoBlocoMin === b}
              onClick={() => set("duracaoBlocoMin", b)}
            >
              {formatarDuracao(b * 60)}
            </Button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function PassoRevisoes({ s, set }: { s: EstadoWizard; set: SetCampo }) {
  const r = s.revisoes;
  const atualizar = (parcial: Partial<EstadoWizard["revisoes"]>) => set("revisoes", { ...r, ...parcial });
  const alternar = (lista: number[], v: number) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <section>
      <Titulo titulo="Revisões espaçadas">
        Quando você conclui a teoria de um tópico, as revisões são agendadas automaticamente nesses intervalos.
      </Titulo>
      <label className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <Checkbox checked={r.habilitadas} onCheckedChange={(v) => atualizar({ habilitadas: v === true })} />
        <span>
          <span className="block font-medium">Agendar revisões</span>
          <span className="text-sm text-muted-foreground">Elas entram no seu dia antes da teoria, ocupando no máximo metade dele.</span>
        </span>
      </label>

      <div className={cn("mt-6 flex flex-col gap-6", !r.habilitadas && "pointer-events-none opacity-50")} aria-disabled={!r.habilitadas}>
        <fieldset>
          <legend className="mb-3 font-medium">Revisar depois de quantos dias</legend>
          <div className="flex flex-wrap gap-2">
            {INTERVALOS_OPCOES.map((i) => {
              const ativo = r.intervalos.includes(i);
              return (
                <Button
                  key={i}
                  size="sm"
                  variant={ativo ? "default" : "outline"}
                  aria-pressed={ativo}
                  onClick={() => atualizar({ intervalos: alternar(r.intervalos, i) })}
                  className="tabular"
                >
                  {i} {i === 1 ? "dia" : "dias"}
                </Button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 font-medium">Em quais dias as revisões podem cair</legend>
          <p className="mb-3 text-sm text-muted-foreground">Se a data cair num dia desmarcado, ela passa para o próximo dia permitido.</p>
          <div className="flex flex-wrap gap-2">
            {DIAS_EXIBICAO.map(({ dia, curto }) => {
              const ativo = r.diasPermitidos.includes(dia);
              return (
                <Button
                  key={dia}
                  size="sm"
                  variant={ativo ? "default" : "outline"}
                  aria-pressed={ativo}
                  onClick={() => atualizar({ diasPermitidos: alternar(r.diasPermitidos, dia) })}
                  className="w-14"
                >
                  {curto}
                </Button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-medium">Tempo de cada revisão</legend>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30].map((m) => (
              <Button
                key={m}
                size="sm"
                variant={r.minutosPorRevisao === m ? "default" : "outline"}
                aria-pressed={r.minutosPorRevisao === m}
                onClick={() => atualizar({ minutosPorRevisao: m })}
              >
                {m} min
              </Button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function PassoResumo({
  s,
  edital,
  previa,
  hoje,
}: {
  s: EstadoWizard;
  edital: EditalOpcao;
  previa: { projecao: ReturnType<typeof projetarAgenda>; sequencia: string[] };
  hoje: DataISO;
}) {
  const { projecao } = previa;
  const disc = new Map(s.disciplinas.map((d) => [d.id, d]));
  const top = new Map(edital.topicos.map((t) => [t.id, t.titulo]));
  const semana = projecao.dias.slice(0, 7);
  const fim = projecao.conclusaoTeoria;
  const passaDaProva = !!(fim && edital.dataProva && fim > edital.dataProva);
  const totalSemana = s.minutosPorDia.reduce((a, b) => a + b, 0);

  return (
    <section>
      <Titulo titulo="Confira antes de salvar" />
      <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Teoria termina em</dt>
          <dd className={cn("mt-0.5 text-lg font-semibold", passaDaProva && "text-destructive")}>
            {fim ? formatarData.longa(fim) : projecao.semCapacidade ? "Sem tempo reservado" : "Mais de 4 anos"}
          </dd>
          {fim && <dd className="tabular text-xs text-muted-foreground">daqui a {diferencaEmDias(fim, hoje)} dias</dd>}
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Teoria pela frente</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold">{formatarDuracao(projecao.minutosTeoriaRestantes * 60)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Por semana</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold">{formatarDuracao(totalSemana * 60)}</dd>
        </div>
      </dl>

      {passaDaProva && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Nesse ritmo a teoria termina depois da prova ({formatarData.longa(edital.dataProva!)}). Volte e aumente as horas, ou
          desmarque disciplinas de menor peso.
        </p>
      )}

      <p className="mt-6 mb-2 text-sm text-muted-foreground">
        Seus primeiros dias{s.modo === "fixo" ? " (as datas ficam fixas)" : ""}:
      </p>
      <ol className="flex flex-col divide-y rounded-xl border bg-card">
        {semana.map((dia) => (
          <li key={dia.data} className="grid grid-cols-[88px_1fr] gap-3 px-4 py-3">
            <span className="text-sm">
              <span className="block font-medium capitalize">{formatarData.semanaCurta(dia.data)}</span>
              <span className="tabular text-xs text-muted-foreground">{formatarData.curta(dia.data)}</span>
            </span>
            {dia.itens.length === 0 ? (
              <span className="self-center text-sm text-muted-foreground">Folga</span>
            ) : (
              <ul className="flex min-w-0 flex-col gap-1">
                {dia.itens.map((item, i) => {
                  const d = disc.get(item.disciplinaId);
                  return (
                    <li key={i} className="flex min-w-0 items-center gap-2 text-sm">
                      <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ background: `var(--disc-${d?.cor ?? 1})` }} />
                      {item.tipo === "revisao" && <RotateCcw className="size-3.5 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate">{top.get(item.topicoId) ?? "Tópico"}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">{item.minutos} min</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
