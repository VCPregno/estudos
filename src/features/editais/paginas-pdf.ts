"use client";

import { PDFDocument } from "pdf-lib";

/** "45-80, 92, 95-96" → índices 0-based [44..79, 91, 94, 95]. Lança erro com mensagem amigável. */
export function interpretarIntervalo(texto: string, totalPaginas: number): number[] {
  const indices = new Set<number>();
  for (const parte of texto.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = parte.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`Não entendi "${parte}". Use números e intervalos, como 45-80, 92.`);
    const ini = Number(m[1]);
    const fim = m[2] ? Number(m[2]) : ini;
    if (ini < 1 || fim > totalPaginas || ini > fim) {
      throw new Error(`O intervalo ${parte} não existe: o PDF tem ${totalPaginas} páginas.`);
    }
    for (let p = ini; p <= fim; p++) indices.add(p - 1);
  }
  return [...indices].sort((a, b) => a - b);
}

export async function contarPaginas(bytes: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Gera um PDF só com as páginas pedidas (economiza tokens e cabe nos limites da IA). */
export async function recortarPaginas(bytes: ArrayBuffer, indices: number[]): Promise<Uint8Array<ArrayBuffer>> {
  const origem = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const novo = await PDFDocument.create();
  const paginas = await novo.copyPages(origem, indices);
  paginas.forEach((p) => novo.addPage(p));
  return (await novo.save()) as Uint8Array<ArrayBuffer>;
}
