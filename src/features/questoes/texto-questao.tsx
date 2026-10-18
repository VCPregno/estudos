import { Fragment } from "react";
import { blocosDeTexto } from "@/lib/questoes";
import { cn } from "@/lib/utils";

/** Enunciado ou texto de apoio: parágrafos, blocos de código e tabelas. */
export function TextoQuestao({ texto, className }: { texto: string; className?: string }) {
  const blocos = blocosDeTexto(texto);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {blocos.map((b, i) => {
        if (b.tipo === "codigo") {
          return (
            <pre key={i} className="overflow-x-auto rounded-md bg-muted px-3.5 py-3 font-mono text-[13px] leading-relaxed">
              <code>{b.texto}</code>
            </pre>
          );
        }
        if (b.tipo === "tabela") {
          const [cab, ...linhas] = b.linhas;
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-auto border-collapse text-sm">
                {cab && (
                  <thead>
                    <tr>
                      {cab.map((c, j) => (
                        <th key={j} className="border px-3 py-1.5 text-left font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {linhas.map((l, j) => (
                    <tr key={j}>
                      {l.map((c, k) => (
                        <td key={k} className="border px-3 py-1.5">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {b.texto}
          </p>
        );
      })}
    </div>
  );
}

/** Texto do tutor: parágrafos e **negrito**, nada além disso. */
export function TextoSimples({ texto }: { texto: string }) {
  const paragrafos = texto
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      {paragrafos.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p
            .replace(/^#+\s*/gm, "")
            .split(/(\*\*[^*]+\*\*)/g)
            .map((parte, j) =>
              parte.startsWith("**") && parte.endsWith("**") ? (
                <strong key={j} className="font-semibold">
                  {parte.slice(2, -2)}
                </strong>
              ) : (
                <Fragment key={j}>{parte}</Fragment>
              ),
            )}
        </p>
      ))}
    </div>
  );
}
