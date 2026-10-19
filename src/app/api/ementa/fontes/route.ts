import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDeErro, obterProvedor } from "@/lib/ai/provedores";
import { supabaseConfigurado } from "@/lib/env";
import { usuarioAtual } from "@/lib/supabase/server";

// ~300 tópicos em lotes paralelos levam de 20 a 60 segundos.
export const maxDuration = 120;

const Corpo = z.object({ editalId: z.uuid(), refazer: z.boolean().optional() });
const LOTE = 70;

/**
 * POST /api/ementa/fontes — a IA classifica cada tópico do edital pelo tipo de
 * fonte (norma, guia, matéria clássica, do órgão) e diz onde estudar.
 * Por padrão só classifica os tópicos que ainda não têm tipo.
 */
export async function POST(request: Request) {
  if (!supabaseConfigurado()) return NextResponse.json({ erro: "Precisa do Supabase configurado." }, { status: 400 });
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = Corpo.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });

  let provedor;
  try {
    provedor = obterProvedor();
  } catch (e) {
    const { mensagem, status } = mensagemDeErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }

  const [{ data: edital }, { data: topicos }] = await Promise.all([
    supabase.from("editais").select("nome, banca, cargo").eq("id", corpo.data.editalId).single(),
    supabase.from("topicos_ementa").select("id, parent_id, titulo, tipo_fonte, disciplinas(nome)").eq("edital_id", corpo.data.editalId),
  ]);
  if (!edital || !topicos) return NextResponse.json({ erro: "Edital não encontrado." }, { status: 404 });

  const porId = new Map(topicos.map((t) => [t.id, t]));
  const alvo = topicos.filter((t) => corpo.data.refazer || !t.tipo_fonte);
  if (!alvo.length) return NextResponse.json({ classificados: 0, total: topicos.length });

  const itens = alvo.map((t, i) => {
    const pai = t.parent_id ? porId.get(t.parent_id) : null;
    return {
      id: t.id,
      chave: `T${i + 1}`,
      disciplina: (t.disciplinas as unknown as { nome: string } | null)?.nome ?? "",
      titulo: pai ? `${pai.titulo} > ${t.titulo}` : t.titulo,
    };
  });
  const porChave = new Map(itens.map((i) => [i.chave, i.id]));
  const contexto = [edital.banca, edital.nome, edital.cargo].filter(Boolean).join(" · ");

  const lotes: (typeof itens)[] = [];
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));

  // Cada lote é independente: o que der certo é salvo mesmo se outro falhar.
  const resultados = await Promise.allSettled(
    lotes.map((l) => provedor.classificarFontes({ contexto, itens: l.map(({ chave, disciplina, titulo }) => ({ chave, disciplina, titulo })) })),
  );
  const ok = resultados.flatMap((r) => (r.status === "fulfilled" ? r.value.itens : []));
  const falha = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (!ok.length && falha) {
    const { mensagem, status } = mensagemDeErro(falha.reason);
    return NextResponse.json({ erro: mensagem }, { status });
  }

  const linhas = ok
    .map((x) => ({ id: porChave.get(x.chave.trim().toUpperCase()), tipo: x.tipo, fonte: x.fonte }))
    .filter((x): x is { id: string; tipo: (typeof x)["tipo"]; fonte: string } => !!x.id);
  const { data, error } = await supabase.rpc("definir_fontes", { p_itens: linhas });
  if (error) return NextResponse.json({ erro: `Não deu para salvar: ${error.message}` }, { status: 500 });
  return NextResponse.json({ classificados: data ?? linhas.length, faltam: alvo.length - linhas.length, total: topicos.length });
}
