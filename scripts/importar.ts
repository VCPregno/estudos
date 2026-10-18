/**
 * Importação em lote de questões e flashcards a partir de CSV ou JSON.
 *
 *   npm run importar -- questoes  caminho/questoes.csv
 *   npm run importar -- flashcards caminho/flashcards.json
 *   npm run importar -- questoes  caminho/questoes.csv --dry-run   (só valida)
 *
 * Entra no Supabase com o SEU usuário (SUPABASE_EMAIL / SUPABASE_SENHA no
 * .env.local), então o RLS vale normalmente e nenhuma chave secreta é usada.
 * Linhas repetidas não duplicam: o "external_id" (ou um hash do conteúdo,
 * quando ele não vem no arquivo) é a chave de upsert.
 *
 * Formatos aceitos: veja scripts/exemplos/.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { z } from "zod";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// ---------------------------------------------------------------------------
// Esquemas de entrada
// ---------------------------------------------------------------------------

const texto = z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string());
const opcional = z.preprocess((v) => (v === "" || v === null ? undefined : typeof v === "string" ? v.trim() : v), z.string().optional());
const area = z.preprocess((v) => (v === "" || v == null ? "geral" : String(v).toLowerCase()), z.enum(["direito", "ti", "geral"]));

const QuestaoEntrada = z
  .object({
    external_id: opcional,
    carreira: area,
    banca: opcional,
    orgao: opcional,
    cargo: opcional,
    ano: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(1950).max(2100).optional()),
    disciplina: texto.pipe(z.string().min(1, "obrigatória")),
    assunto: opcional,
    tipo: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(["multipla_escolha", "certo_errado"]).optional()),
    enunciado: texto.pipe(z.string().min(5, "vazio ou curto demais")),
    alternativas: z.array(z.object({ letra: z.string(), texto: z.string() })).optional(),
    alt_a: opcional,
    alt_b: opcional,
    alt_c: opcional,
    alt_d: opcional,
    alt_e: opcional,
    gabarito: texto.pipe(z.string().min(1, "obrigatório")).transform((g) => g.toUpperCase()),
    comentario: opcional,
  })
  .transform((q) => {
    const alternativas =
      q.alternativas ??
      (["a", "b", "c", "d", "e"] as const)
        .map((l) => ({ letra: l.toUpperCase(), texto: q[`alt_${l}`] }))
        .filter((a): a is { letra: string; texto: string } => !!a.texto);
    const tipo = q.tipo ?? (alternativas.length === 0 ? "certo_errado" : "multipla_escolha");
    return { ...q, alternativas, tipo };
  })
  .superRefine((q, ctx) => {
    if (q.tipo === "certo_errado" && !["C", "E"].includes(q.gabarito))
      ctx.addIssue({ code: "custom", message: `gabarito "${q.gabarito}" inválido para certo/errado (use C ou E)` });
    if (q.tipo === "multipla_escolha" && !q.alternativas.some((a) => a.letra === q.gabarito))
      ctx.addIssue({ code: "custom", message: `gabarito "${q.gabarito}" não está entre as alternativas` });
  });

const FlashcardEntrada = z.object({
  external_id: opcional,
  disciplina: opcional,
  frente: texto.pipe(z.string().min(1, "obrigatória")),
  verso: texto.pipe(z.string().min(1, "obrigatório")),
  tags: z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(/[;,]/).map((t) => t.trim()) : []),
    z.array(z.string()),
  ),
});

// ---------------------------------------------------------------------------

function lerArquivo(caminho: string): Record<string, unknown>[] {
  const conteudo = readFileSync(caminho, "utf8").replace(/^﻿/, "");
  if (extname(caminho).toLowerCase() === ".json") {
    const json = JSON.parse(conteudo);
    if (!Array.isArray(json)) throw new Error("O JSON precisa ser uma lista de objetos.");
    return json;
  }
  const r = Papa.parse<Record<string, string>>(conteudo, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (r.errors.length) throw new Error(`CSV inválido na linha ${r.errors[0].row! + 2}: ${r.errors[0].message}`);
  return r.data;
}

function hash(...partes: string[]) {
  return "h:" + createHash("sha1").update(partes.join("\u0000")).digest("hex").slice(0, 20);
}

function validar<T>(linhas: Record<string, unknown>[], schema: z.ZodType<T>) {
  const ok: T[] = [];
  const erros: string[] = [];
  linhas.forEach((linha, i) => {
    const r = schema.safeParse(linha);
    if (r.success) ok.push(r.data);
    else erros.push(`linha ${i + 2}: ${r.error.issues.map((e) => `${e.path.join(".") || ""} ${e.message}`.trim()).join("; ")}`);
  });
  return { ok, erros };
}

async function conectar() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.SUPABASE_EMAIL;
  const senha = process.env.SUPABASE_SENHA;
  if (!url || !chave || !email || !senha) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_EMAIL e SUPABASE_SENHA no .env.local.");
  }
  const supabase = createClient(url, chave, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`Login falhou: ${error.message}`);
  return supabase;
}

async function idsDeDisciplinas(supabase: Awaited<ReturnType<typeof conectar>>, nomes: string[]) {
  const unicos = [...new Map(nomes.map((n) => [n.toLowerCase(), n])).values()];
  const { data: existentes, error } = await supabase.from("disciplinas").select("id, nome");
  if (error) throw error;
  const mapa = new Map((existentes ?? []).map((d) => [d.nome.toLowerCase(), d.id as string]));
  const faltando = unicos.filter((n) => !mapa.has(n.toLowerCase()));
  if (faltando.length) {
    const { data, error: e2 } = await supabase.from("disciplinas").insert(faltando.map((nome) => ({ nome }))).select("id, nome");
    if (e2) throw e2;
    data!.forEach((d) => mapa.set(d.nome.toLowerCase(), d.id));
    console.log(`  ${faltando.length} disciplina(s) nova(s): ${faltando.join(", ")}`);
  }
  return mapa;
}

async function emLotes<T>(itens: T[], tamanho: number, fn: (lote: T[]) => Promise<void>) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await fn(itens.slice(i, i + tamanho));
    process.stdout.write(`\r  ${Math.min(i + tamanho, itens.length)}/${itens.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  const [tipo, caminho, ...flags] = process.argv.slice(2);
  const simulacao = flags.includes("--dry-run");
  if (!["questoes", "flashcards"].includes(tipo ?? "") || !caminho) {
    console.log("Uso: npm run importar -- <questoes|flashcards> <arquivo.csv|arquivo.json> [--dry-run]");
    process.exit(1);
  }

  const linhas = lerArquivo(caminho);
  const { ok, erros } = tipo === "questoes" ? validar(linhas, QuestaoEntrada) : validar(linhas, FlashcardEntrada);
  console.log(`${linhas.length} linha(s) lida(s), ${ok.length} válida(s), ${erros.length} com erro.`);
  erros.slice(0, 20).forEach((e) => console.log(`  ✗ ${e}`));
  if (erros.length > 20) console.log(`  ... e mais ${erros.length - 20}`);
  if (simulacao || ok.length === 0) {
    if (simulacao) console.log("Simulação: nada foi gravado.");
    return;
  }

  const supabase = await conectar();

  if (tipo === "questoes") {
    const qs = ok as z.infer<typeof QuestaoEntrada>[];
    const disc = await idsDeDisciplinas(supabase, qs.map((q) => q.disciplina));
    const registros = qs.map((q) => ({
      external_id: q.external_id ?? hash(q.enunciado, q.gabarito),
      carreira: q.carreira,
      banca: q.banca ?? null,
      orgao: q.orgao ?? null,
      cargo: q.cargo ?? null,
      ano: q.ano ?? null,
      disciplina_id: disc.get(q.disciplina.toLowerCase())!,
      assunto: q.assunto ?? null,
      tipo: q.tipo,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      gabarito: q.gabarito,
      comentario: q.comentario ?? null,
    }));
    await emLotes(registros, 500, async (lote) => {
      const { error } = await supabase.from("questoes").upsert(lote, { onConflict: "user_id,external_id" });
      if (error) throw error;
    });
  } else {
    const fs = ok as z.infer<typeof FlashcardEntrada>[];
    const disc = await idsDeDisciplinas(supabase, fs.map((f) => f.disciplina).filter((d): d is string => !!d));
    const registros = fs.map((f) => ({
      external_id: f.external_id ?? hash(f.frente, f.verso),
      disciplina_id: f.disciplina ? disc.get(f.disciplina.toLowerCase())! : null,
      frente: f.frente,
      verso: f.verso,
      tags: f.tags,
    }));
    // ignoreDuplicates: reimportar não reseta o progresso de repetição espaçada
    await emLotes(registros, 500, async (lote) => {
      const { error } = await supabase.from("flashcards").upsert(lote, { onConflict: "user_id,external_id", ignoreDuplicates: true });
      if (error) throw error;
    });
  }
  console.log("Importação concluída.");
}

main().catch((e) => {
  console.error(`Erro: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
