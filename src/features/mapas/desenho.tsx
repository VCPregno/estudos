"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { FormatoDiagrama } from "@/lib/mapas";
import { cn } from "@/lib/utils";

export interface ControleDesenho {
  ajustar: () => void;
  svg: () => SVGSVGElement | null;
}

/**
 * Desenha o mapa mental (markmap) ou o fluxograma (mermaid) a partir do texto.
 * As bibliotecas só carregam no navegador e só nesta tela.
 */
export function Desenho({
  formato,
  conteudo,
  className,
  onControle,
}: {
  formato: FormatoDiagrama;
  conteudo: string;
  className?: string;
  onControle?: (c: ControleDesenho) => void;
}) {
  const { resolvedTheme } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<{ setData: (d: unknown) => void; fit: () => Promise<void> | void; destroy?: () => void } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // ---- mapa mental ----
  useEffect(() => {
    if (formato !== "mapa" || !svgRef.current) return;
    let vivo = true;
    (async () => {
      const [{ Transformer }, { Markmap }] = await Promise.all([import("markmap-lib"), import("markmap-view")]);
      if (!vivo || !svgRef.current) return;
      const { root } = new Transformer().transform(conteudo);
      if (!mmRef.current) {
        mmRef.current = Markmap.create(svgRef.current, { duration: 250, maxWidth: 280, paddingX: 10, spacingVertical: 10, initialExpandLevel: -1 }, root) as never;
      } else {
        mmRef.current.setData(root);
      }
      await mmRef.current!.fit();
      setErro(null);
    })().catch((e) => vivo && setErro(String(e?.message ?? e)));
    return () => {
      vivo = false;
    };
  }, [formato, conteudo]);

  useEffect(
    () => () => {
      mmRef.current?.destroy?.();
      mmRef.current = null;
    },
    [],
  );

  // ---- fluxograma ----
  useEffect(() => {
    if (formato !== "fluxo" || !caixaRef.current) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        // cores do próprio app (claro/escuro)
        const css = getComputedStyle(document.documentElement);
        const v = (n: string) => css.getPropertyValue(n).trim();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            darkMode: resolvedTheme === "dark",
            background: v("--card"),
            primaryColor: v("--muted"),
            primaryTextColor: v("--foreground"),
            primaryBorderColor: v("--muted-foreground"),
            secondaryColor: v("--accent"),
            tertiaryColor: v("--card"),
            lineColor: v("--muted-foreground"),
            textColor: v("--foreground"),
            edgeLabelBackground: v("--card"),
            fontFamily: getComputedStyle(document.body).fontFamily,
            fontSize: "15px",
          },
          flowchart: { htmlLabels: false, curve: "basis", padding: 12 },
        });
        const { svg } = await mermaid.render(`fluxo-${Math.random().toString(36).slice(2)}`, conteudo);
        if (!vivo || !caixaRef.current) return;
        caixaRef.current.innerHTML = svg; // mermaid já limita a largura ao tamanho natural
        setErro(null);
      } catch (e) {
        if (vivo) setErro((e as Error).message?.split("\n")[0] ?? "O fluxograma tem um erro de sintaxe.");
      }
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [formato, conteudo, resolvedTheme]);

  useEffect(() => {
    onControle?.({
      ajustar: () => void mmRef.current?.fit(),
      svg: () => (formato === "mapa" ? svgRef.current : (caixaRef.current?.querySelector("svg") ?? null)),
    });
  }, [formato, onControle]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-card", className)} data-imprimir>
      {formato === "mapa" ? (
        <svg
          ref={svgRef}
          className="size-full text-foreground"
          // inline vence o estilo que o markmap injeta no próprio svg
          style={{ ["--markmap-text-color" as string]: "var(--foreground)", ["--markmap-a-color" as string]: "var(--foreground)" }}
        />
      ) : (
        <div ref={caixaRef} className="flex size-full items-start justify-center overflow-auto p-4" />
      )}
      {erro && (
        <p className="absolute inset-x-3 bottom-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          Não deu para desenhar: {erro}
        </p>
      )}
    </div>
  );
}

/** Baixa o desenho como PNG; se o navegador não deixar (rótulos em HTML), baixa SVG. */
export async function baixarImagem(svg: SVGSVGElement, nome: string, fundo: string) {
  const alvo = (svg.querySelector(":scope > g") as SVGGElement | null) ?? svg;
  const bb = alvo.getBBox();
  const pad = 24;
  const w = Math.ceil(bb.width + pad * 2);
  const h = Math.ceil(bb.height + pad * 2);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelector(":scope > g")?.removeAttribute("transform");
  clone.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${w} ${h}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.style.color = getComputedStyle(svg).color;
  const xml = new XMLSerializer().serializeToString(clone);
  const baixar = (href: string, ext: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = `${nome}.${ext}`;
    a.click();
  };
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    const url = canvas.toDataURL("image/png");
    baixar(url, "png");
  } catch {
    baixar(URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" })), "svg");
  }
}
