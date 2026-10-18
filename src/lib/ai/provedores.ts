import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { type EditalExtraido, EditalExtraidoSchema } from "./esquema-edital";
import { type ProvaExtraida, ProvaExtraidaSchema } from "./esquema-prova";
import {
  type DadosQuestaoTutor,
  type OpcoesProva,
  SISTEMA_EDITAL,
  SISTEMA_PROVA,
  SISTEMA_TUTOR,
  instrucoesEdital,
  instrucoesProva,
  mensagemTutor,
} from "./prompts";

/**
 * Camada de IA com provedor trocável. Claude é o padrão (lê PDF nativamente e
 * garante o JSON pelo schema); Gemini é a alternativa, útil pelo nível gratuito.
 * Escolha com AI_PROVIDER=claude|gemini; sem a variável, usa o que tiver chave.
 */

export type NomeProvedor = "claude" | "gemini";

export interface Uso {
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

export interface ProvedorIA {
  nome: NomeProvedor;
  modeloEdital: string;
  modeloTutor: string;
  extrairEdital(pdfBase64: string, opcoes: { cargo?: string; paginas?: string }): Promise<{ resultado: EditalExtraido; uso: Uso }>;
  /** pdfs[0] = caderno; pdfs[1] = gabarito (opcional) */
  extrairProva(pdfsBase64: string[], opcoes: OpcoesProva): Promise<{ resultado: ProvaExtraida; uso: Uso }>;
  explicarQuestao(q: DadosQuestaoTutor): Promise<{ texto: string; uso: Uso }>;
}

export class ErroIA extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

// -----------------------------------------------------------------------------
// Claude
// -----------------------------------------------------------------------------

function provedorClaude(): ProvedorIA {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY
  const modeloEdital = modeloEditalDe("claude");
  const modeloTutor = process.env.CLAUDE_MODEL_TUTOR || "claude-haiku-5-5";

  return {
    nome: "claude",
    modeloEdital,
    modeloTutor,

    async extrairEdital(pdfBase64, opcoes) {
      // stream: editais grandes geram respostas longas, e requisições longas
      // sem streaming são recusadas pelo SDK.
      const stream = client.messages.stream({
        model: modeloEdital,
        max_tokens: 32000,
        system: SISTEMA_EDITAL,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: instrucoesEdital(opcoes) },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(EditalExtraidoSchema) },
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "max_tokens") {
        throw new ErroIA("O conteúdo programático é longo demais para uma leitura. Envie o edital em partes (intervalos de páginas menores).", 422);
      }
      if (!msg.parsed_output) throw new ErroIA("A IA não devolveu o conteúdo no formato esperado. Tente de novo.");
      return {
        resultado: msg.parsed_output,
        uso: { tokensEntrada: msg.usage.input_tokens, tokensSaida: msg.usage.output_tokens },
      };
    },

    async extrairProva(pdfs, opcoes) {
      const stream = client.messages.stream({
        model: modeloEdital,
        max_tokens: 64000,
        system: SISTEMA_PROVA,
        messages: [
          {
            role: "user",
            content: [
              ...pdfs.map((data) => ({ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } })),
              { type: "text", text: instrucoesProva(opcoes) },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(ProvaExtraidaSchema) },
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "max_tokens") {
        throw new ErroIA("A prova é longa demais para uma leitura só. Importe em partes, informando um intervalo de páginas.", 422);
      }
      if (!msg.parsed_output) throw new ErroIA("A IA não devolveu as questões no formato esperado. Tente de novo.");
      return { resultado: msg.parsed_output, uso: { tokensEntrada: msg.usage.input_tokens, tokensSaida: msg.usage.output_tokens } };
    },

    async explicarQuestao(q) {
      const msg = await client.messages.create({
        model: modeloTutor,
        max_tokens: 1500,
        system: SISTEMA_TUTOR,
        messages: [{ role: "user", content: mensagemTutor(q) }],
      });
      const texto = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { texto, uso: { tokensEntrada: msg.usage.input_tokens, tokensSaida: msg.usage.output_tokens } };
    },
  };
}

// -----------------------------------------------------------------------------
// Gemini
// -----------------------------------------------------------------------------

function provedorGemini(): ProvedorIA {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modeloEdital = modeloEditalDe("gemini");
  // O tutor precisa acertar o raciocínio; o lite fica de reserva para quando o
  // limite gratuito do modelo principal acabar.
  const modeloTutor = process.env.GEMINI_MODEL_TUTOR || "gemini-3.8-flash";
  const modeloTutorReserva = process.env.GEMINI_MODEL_TUTOR_RESERVA || "gemini-3.5-flash-lite";

  return {
    nome: "gemini",
    modeloEdital,
    modeloTutor,

    async extrairEdital(pdfBase64, opcoes) {
      const r = await ai.models.generateContent({
        model: modeloEdital,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: "application/pdf", data: pdfBase64 } }, { text: instrucoesEdital(opcoes) }],
          },
        ],
        config: {
          systemInstruction: SISTEMA_EDITAL,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(EditalExtraidoSchema),
          maxOutputTokens: 32000,
        },
      });
      let json: unknown;
      try {
        json = JSON.parse(r.text ?? "");
      } catch {
        throw new ErroIA("A IA devolveu uma resposta incompleta. Tente um intervalo de páginas menor.", 422);
      }
      const parsed = EditalExtraidoSchema.safeParse(json);
      if (!parsed.success) throw new ErroIA("A IA não devolveu o conteúdo no formato esperado. Tente de novo.");
      return {
        resultado: parsed.data,
        uso: {
          tokensEntrada: r.usageMetadata?.promptTokenCount ?? null,
          tokensSaida: r.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    },

    async extrairProva(pdfs, opcoes) {
      const r = await ai.models.generateContent({
        model: modeloEdital,
        contents: [
          {
            role: "user",
            parts: [...pdfs.map((data) => ({ inlineData: { mimeType: "application/pdf", data } })), { text: instrucoesProva(opcoes) }],
          },
        ],
        config: {
          systemInstruction: SISTEMA_PROVA,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(ProvaExtraidaSchema),
          maxOutputTokens: 65536,
        },
      });
      let json: unknown;
      try {
        json = JSON.parse(r.text ?? "");
      } catch {
        throw new ErroIA("A IA devolveu uma resposta incompleta. Importe a prova em partes, informando um intervalo de páginas.", 422);
      }
      const parsed = ProvaExtraidaSchema.safeParse(json);
      if (!parsed.success) throw new ErroIA("A IA não devolveu as questões no formato esperado. Tente de novo.");
      return {
        resultado: parsed.data,
        uso: { tokensEntrada: r.usageMetadata?.promptTokenCount ?? null, tokensSaida: r.usageMetadata?.candidatesTokenCount ?? null },
      };
    },

    async explicarQuestao(q) {
      const pedir = (model: string) =>
        ai.models.generateContent({
          model,
          contents: mensagemTutor(q),
          config: { systemInstruction: SISTEMA_TUTOR, maxOutputTokens: 4000 },
        });
      let r;
      try {
        r = await pedir(modeloTutor);
      } catch (e) {
        if (!limiteAtingido(e) || modeloTutorReserva === modeloTutor) throw e;
        r = await pedir(modeloTutorReserva);
      }
      return {
        texto: r.text ?? "",
        uso: {
          tokensEntrada: r.usageMetadata?.promptTokenCount ?? null,
          tokensSaida: r.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    },
  };
}

// -----------------------------------------------------------------------------

function limiteAtingido(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

export function modeloEditalDe(nome: NomeProvedor): string {
  return nome === "claude"
    ? process.env.CLAUDE_MODEL_EDITAL || "claude-sonnet-5-5"
    : process.env.GEMINI_MODEL_EDITAL || "gemini-3.8-flash";
}

export function provedorConfigurado(): NomeProvedor | null {
  const escolhido = process.env.AI_PROVIDER as NomeProvedor | undefined;
  if (escolhido === "claude") return process.env.ANTHROPIC_API_KEY ? "claude" : null;
  if (escolhido === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function obterProvedor(): ProvedorIA {
  const nome = provedorConfigurado();
  if (!nome) {
    throw new ErroIA(
      "Nenhuma IA configurada. Defina ANTHROPIC_API_KEY (Claude) ou GEMINI_API_KEY (Gemini) no .env.local e reinicie o servidor.",
      503,
    );
  }
  return nome === "claude" ? provedorClaude() : provedorGemini();
}

/** Converte erros dos SDKs em mensagens que dizem o que fazer. */
export function mensagemDeErro(e: unknown): { mensagem: string; status: number } {
  if (e instanceof ErroIA) return { mensagem: e.message, status: e.status };
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return { mensagem: "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY.", status: 502 };
    if (e.status === 429) return { mensagem: "Limite de uso da API atingido. Espere um pouco e tente de novo.", status: 429 };
    if (e.status === 413 || /too large|pages/i.test(e.message))
      return { mensagem: "PDF grande demais para a IA. Envie só as páginas do conteúdo programático.", status: 413 };
    return { mensagem: `Erro da API da Anthropic: ${e.message}`, status: 502 };
  }
  if (limiteAtingido(e)) {
    return { mensagem: "O limite gratuito da IA acabou por agora. Espere alguns minutos (ou até amanhã) e tente de novo.", status: 429 };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { mensagem: `Falha ao consultar a IA: ${msg}`, status: 502 };
}
