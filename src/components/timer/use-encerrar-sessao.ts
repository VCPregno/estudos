"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { concluirTeoria, salvarSessao } from "@/app/actions/sessoes";
import { formatarDuracao } from "@/lib/utils";
import { useSessaoTimer } from "@/stores/sessao-timer";

/** Relógio que só "anda" enquanto `ativo` for true. */
export function useAgora(ativo: boolean) {
  // começa em 0 e só lê o relógio no efeito: nada de Date.now() durante o prerender
  const [agora, setAgora] = useState(0);
  useEffect(() => {
    const tique = () => setAgora(Date.now());
    const primeiro = setTimeout(tique, 0);
    const id = ativo ? setInterval(tique, 1000) : undefined;
    return () => {
      clearTimeout(primeiro);
      clearInterval(id);
    };
  }, [ativo]);
  return agora;
}

/** O store persiste no localStorage: espera hidratar para não piscar valores errados. */
const semAssinatura = () => () => {};

export function useHidratado() {
  return useSyncExternalStore(
    semAssinatura,
    () => true, // no navegador
    () => false, // no servidor / prerender
  );
}

export function useEncerrarSessao() {
  const encerrar = useSessaoTimer((s) => s.encerrar);
  const [salvando, startTransition] = useTransition();

  function encerrarESalvar() {
    const sessao = encerrar();
    if (!sessao) return;
    startTransition(async () => {
      const r = await salvarSessao(sessao);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      if (sessao.segundosLiquidos < 60) {
        toast("Sessão com menos de 1 minuto não foi registrada.");
        return;
      }
      const duracao = formatarDuracao(sessao.segundosLiquidos);
      const { topicoId, tipo } = sessao.contexto;
      toast.success(r.demo ? `${duracao} de estudo. No modo demonstração nada é gravado.` : `${duracao} registrados.`, {
        description: sessao.contexto.rotulo,
        action:
          tipo === "teoria" && topicoId
            ? {
                label: "Concluí a teoria",
                onClick: async () => {
                  const c = await concluirTeoria(topicoId);
                  if (c.ok) toast.success("Teoria concluída. As revisões foram agendadas.");
                  else toast.error(c.erro ?? "Não deu para concluir.");
                },
              }
            : undefined,
      });
      for (const c of r.conquistas) toast(`Conquista: ${c.titulo}`, { description: c.descricao });
    });
  }

  return { encerrarESalvar, salvando };
}
