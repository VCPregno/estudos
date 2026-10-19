"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { REGUAS_REDACAO, REGUA_DISCURSIVA, type TipoTexto } from "@/lib/redacao";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Reduz a foto (celular tira 4000 px) para caber rápido na IA sem perder a letra. */
async function reduzirImagem(file: File, maxLado = 2200): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Não deu para ler a imagem."))), "image/jpeg", 0.88));
}

interface Foto {
  id: string;
  file: File;
  url: string;
}

function Segmentado<T extends string>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: { id: T; rotulo: string }[]; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div className="flex gap-1 self-start rounded-lg bg-muted p-1" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground", valor === o.id && "bg-card font-medium text-foreground shadow-sm")}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function NovaRedacao({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoTexto>("redacao");
  const [banca, setBanca] = useState("Vunesp");
  const regua = tipo === "discursiva" ? REGUA_DISCURSIVA : (REGUAS_REDACAO.find((r) => r.id === banca) ?? REGUAS_REDACAO[0]);
  const [notaMaxima, setNotaMaxima] = useState(regua.notaMaxima);
  const [notaMinima, setNotaMinima] = useState<number | null>(regua.notaMinima);
  const [linhas, setLinhas] = useState<[number, number]>(regua.linhas);
  const [criterios, setCriterios] = useState(regua.criterios);
  const [tema, setTema] = useState("");
  const [modo, setModo] = useState<"foto" | "texto">("foto");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const galeria = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  // troca de banca ou tipo aplica a régua correspondente
  function aplicar(tipoNovo: TipoTexto, bancaNova: string) {
    const r = tipoNovo === "discursiva" ? REGUA_DISCURSIVA : (REGUAS_REDACAO.find((x) => x.id === bancaNova) ?? REGUAS_REDACAO[0]);
    setTipo(tipoNovo);
    setBanca(bancaNova);
    setNotaMaxima(r.notaMaxima);
    setNotaMinima(r.notaMinima);
    setLinhas(r.linhas);
    setCriterios(r.criterios);
  }

  // libera as miniaturas só quando a tela sai (cada remoção libera a sua)
  const fotosRef = useRef<Foto[]>([]);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  function adicionar(files: FileList | null) {
    if (!files) return;
    const novas = [...files]
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 6 - fotos.length)
      .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setFotos((fs) => [...fs, ...novas]);
  }

  async function sugerir() {
    setSugerindo(true);
    try {
      const r = await fetch("/api/redacao/tema", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ banca }) });
      const j = await r.json().catch(() => ({ erro: "Resposta inválida." }));
      if (!r.ok) throw new Error(j.erro);
      const motivadores = (j.textos_motivadores as string[]).map((t, i) => `Texto ${i + 1}: ${t}`).join("\n\n");
      setTema(`${j.tema}${motivadores ? `\n\n${motivadores}` : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSugerindo(false);
    }
  }

  async function corrigir() {
    setEnviando(true);
    try {
      let imagens: string[] | undefined;
      if (modo === "foto") {
        const supabase = criarClienteNavegador();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
        imagens = [];
        for (const f of fotos) {
          const blob = await reduzirImagem(f.file);
          const caminho = `${auth.user.id}/redacoes/${crypto.randomUUID()}.jpg`;
          const { error } = await supabase.storage.from("mapas").upload(caminho, blob, { contentType: "image/jpeg" });
          if (error) throw new Error(`Falha no envio da foto: ${error.message}`);
          imagens.push(caminho);
        }
      }
      const r = await fetch("/api/redacao/corrigir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo,
          banca,
          tema,
          notaMaxima,
          notaMinima,
          linhasMin: linhas[0] || null,
          linhasMax: linhas[1] || null,
          criterios,
          texto: modo === "texto" ? texto : undefined,
          imagens,
        }),
      });
      const j = await r.json().catch(() => ({ erro: "A correção demorou demais. Tente de novo." }));
      if (!r.ok) throw new Error(j.erro);
      router.push(`/redacao/${j.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setEnviando(false);
    }
  }

  const pronto = tema.trim().length >= 5 && (modo === "foto" ? fotos.length > 0 : texto.trim().length >= 50);

  if (enviando) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-14 text-center" aria-live="polite">
        <Loader2 className="size-8 animate-spin text-highlight-ink" />
        <h2 className="text-xl font-semibold">{modo === "foto" ? "Lendo a sua letra e corrigindo" : "Corrigindo"}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">O Campos aplica a régua da {banca}, critério por critério. Leva de 30 segundos a 1 minuto e meio.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="nova" className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:p-6">
      <h2 id="nova" className="text-lg font-semibold tracking-tight">
        Nova correção
      </h2>

      <div className="flex flex-wrap items-end gap-4">
        <Segmentado
          rotulo="Tipo"
          valor={tipo}
          onChange={(t) => aplicar(t, banca)}
          opcoes={[
            { id: "redacao", rotulo: "Redação" },
            { id: "discursiva", rotulo: "Questão discursiva" },
          ]}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Banca</span>
          <select value={banca} onChange={(e) => aplicar(tipo, e.target.value)} className="h-9 rounded-md border bg-card px-2.5 text-sm">
            {REGUAS_REDACAO.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="tema">{tipo === "redacao" ? "Tema e textos de apoio" : "Enunciado da questão"}</Label>
          {tipo === "redacao" && (
            <Button size="sm" variant="ghost" disabled={sugerindo || demo} onClick={sugerir}>
              {sugerindo ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Sugerir tema
            </Button>
          )}
        </div>
        <Textarea
          id="tema"
          rows={4}
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          placeholder={tipo === "redacao" ? "Cole a proposta da prova ou peça uma sugestão." : "Cole o enunciado completo da questão."}
        />
        {tipo === "redacao" && tema.includes("Texto 1:") && <p className="text-xs text-muted-foreground">Tema e textos de apoio escritos pela IA, no estilo da banca.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Segmentado
          rotulo="Como enviar"
          valor={modo}
          onChange={setModo}
          opcoes={[
            { id: "foto", rotulo: "Foto da folha" },
            { id: "texto", rotulo: "Digitar" },
          ]}
        />
        {modo === "foto" ? (
          <div className="flex flex-col gap-3">
            {fotos.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <li key={f.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={`Página ${i + 1}`} className="h-28 w-20 rounded-md border object-cover" />
                    <button
                      type="button"
                      aria-label={`Remover página ${i + 1}`}
                      onClick={() => {
                        URL.revokeObjectURL(f.url);
                        setFotos((fs) => fs.filter((x) => x.id !== f.id));
                      }}
                      className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border bg-card shadow"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => camera.current?.click()} disabled={fotos.length >= 6} className="md:hidden">
                <Camera />
                Tirar foto
              </Button>
              <Button variant="outline" onClick={() => galeria.current?.click()} disabled={fotos.length >= 6}>
                <ImagePlus />
                {fotos.length ? "Adicionar página" : "Escolher foto"}
              </Button>
            </div>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => adicionar(e.target.files)} />
            <input ref={galeria} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => adicionar(e.target.files)} />
            <p className="text-xs text-muted-foreground">Foto de cima, com boa luz e a folha inteira. Até 6 páginas, na ordem.</p>
          </div>
        ) : (
          <Textarea aria-label="Texto da redação" rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite ou cole o texto, com a paragrafação." />
        )}
      </div>

      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-2.5 text-sm">
          Régua da correção: nota até {notaMaxima}
          {notaMinima !== null ? `, mínimo ${notaMinima}` : ""}, {linhas[0]} a {linhas[1]} linhas
        </summary>
        <div className="flex flex-col gap-3 border-t px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Nota máxima
              <Input type="number" min={1} value={notaMaxima} onChange={(e) => setNotaMaxima(Number(e.target.value) || 1)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Mínimo para passar
              <Input type="number" min={0} value={notaMinima ?? ""} onChange={(e) => setNotaMinima(e.target.value === "" ? null : Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Linhas mínimas
              <Input type="number" min={0} value={linhas[0]} onChange={(e) => setLinhas([Number(e.target.value) || 0, linhas[1]])} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Linhas máximas
              <Input type="number" min={0} value={linhas[1]} onChange={(e) => setLinhas([linhas[0], Number(e.target.value) || 0])} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Critérios (cole os do edital, se tiver)
            <Textarea rows={6} value={criterios} onChange={(e) => setCriterios(e.target.value)} className="text-sm text-foreground" />
          </label>
          {regua.aviso && <p className="text-xs text-muted-foreground">{regua.aviso}</p>}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="highlight" size="lg" disabled={!pronto || demo} onClick={corrigir}>
          Corrigir
        </Button>
        {demo && <span className="text-xs text-muted-foreground">A correção precisa do Supabase configurado.</span>}
      </div>
    </section>
  );
}
