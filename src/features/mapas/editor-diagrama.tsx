"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Maximize2, PencilLine, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apagarMapa, salvarDiagrama } from "@/app/actions/mapas";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import type { Mapa } from "@/lib/data/mapas";
import { type ControleDesenho, Desenho, baixarImagem } from "./desenho";

export function EditorDiagrama({ mapa }: { mapa: Mapa }) {
  const router = useRouter();
  const formato = mapa.diagrama?.formato ?? "mapa";
  const [titulo, setTitulo] = useState(mapa.titulo);
  const [conteudo, setConteudo] = useState(mapa.diagrama?.conteudo ?? "");
  const [desenhado, setDesenhado] = useState(conteudo);
  const [editando, setEditando] = useState(false);
  const [salvo, setSalvo] = useState({ titulo: mapa.titulo, conteudo });
  const [ocupado, iniciar] = useTransition();
  const controle = useRef<ControleDesenho | null>(null);
  const sujo = titulo !== salvo.titulo || conteudo !== salvo.conteudo;

  // redesenha meio segundo depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setDesenhado(conteudo), 500);
    return () => clearTimeout(t);
  }, [conteudo]);

  const guardarControle = useCallback((c: ControleDesenho) => {
    controle.current = c;
  }, []);

  function salvar() {
    iniciar(async () => {
      const r = await salvarDiagrama(mapa.id, { titulo: titulo.trim() || mapa.titulo, formato, conteudo });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setSalvo({ titulo, conteudo });
      toast.success("Mapa salvo.");
    });
  }

  function apagar() {
    if (!window.confirm(`Apagar “${titulo}”?`)) return;
    iniciar(async () => {
      const r = await apagarMapa(mapa.id);
      if (!r.ok) toast.error(r.erro);
      else router.push("/mapas");
    });
  }

  async function baixar() {
    const svg = controle.current?.svg();
    if (!svg) return;
    const fundo = getComputedStyle(document.body).backgroundColor || "#ffffff";
    await baixarImagem(svg, titulo.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "mapa", fundo);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Link href="/mapas" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Mapas e esquemas
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Título"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="h-10 max-w-xl flex-1 border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-input"
          />
          <span className="text-sm text-muted-foreground">{formato === "mapa" ? "Mapa mental" : "Fluxograma"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={editando ? "secondary" : "outline"} onClick={() => setEditando((v) => !v)}>
            <PencilLine />
            {editando ? "Fechar texto" : "Editar texto"}
          </Button>
          {formato === "mapa" && (
            <Button size="sm" variant="outline" onClick={() => controle.current?.ajustar()}>
              <Maximize2 />
              Ajustar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={baixar}>
            <Download />
            Baixar imagem
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer />
            Imprimir ou PDF
          </Button>
          {sujo && (
            <Button size="sm" variant="highlight" disabled={ocupado} onClick={salvar}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={ocupado} onClick={apagar}>
            <Trash2 />
            Apagar
          </Button>
        </div>
      </header>

      <div className={editando ? "grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}>
        {editando && (
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label="Texto do mapa"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              spellCheck={false}
              className="min-h-[40dvh] font-mono text-[13px] leading-relaxed lg:h-[70dvh]"
            />
            <p className="text-xs text-muted-foreground">
              {formato === "mapa"
                ? "Cada “- ” é um ramo; dois espaços a mais descem um nível. **negrito** destaca."
                : "Sintaxe Mermaid: A[\"Etapa\"] --> B{\"Decisão?\"}; B -->|Sim| C[\"…\"]"}
            </p>
          </div>
        )}
        <Desenho formato={formato} conteudo={desenhado} onControle={guardarControle} className="h-[70dvh] min-h-[420px]" />
      </div>
      <p className="text-xs text-muted-foreground">Desenhado pela IA a partir do tópico ou do texto. Confira prazos e números antes de decorar.</p>
    </div>
  );
}
