import { describe, expect, it } from "vitest";
import { limparConteudo } from ".";

describe("limparConteudo", () => {
  it("tira cercas e garante flowchart no fluxo", () => {
    expect(limparConteudo("fluxo", "```mermaid\nA-->B\n```", "x")).toBe("flowchart TD\nA-->B");
    expect(limparConteudo("fluxo", "graph LR\nA-->B", "x")).toBe("graph LR\nA-->B");
  });
  it("garante o título no mapa mental", () => {
    expect(limparConteudo("mapa", "- a\n  - b", "Atos")).toBe("# Atos\n- a\n  - b");
    expect(limparConteudo("mapa", "```markdown\n# T\n- a\n```", "x")).toBe("# T\n- a");
  });
});
