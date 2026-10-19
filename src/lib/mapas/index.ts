/** Limpa o que a IA devolve: tira cercas de código e garante o cabeçalho certo. */
export function limparConteudo(formato: "mapa" | "fluxo", bruto: string, titulo: string): string {
  let t = bruto.trim().replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  if (formato === "fluxo") {
    if (!/^(flowchart|graph)\s/i.test(t)) t = `flowchart TD\n${t}`;
    return t;
  }
  if (!t.startsWith("# ")) t = `# ${titulo}\n${t}`;
  return t;
}

export type FormatoDiagrama = "mapa" | "fluxo";
export interface Diagrama {
  formato: FormatoDiagrama;
  conteudo: string;
}
