"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ArquivarModal from "@/components/ArquivarModal";

// Botão "Restaurar" de um produto/taxa arquivado, com confirmação. Chama o POST
// de restauração e dá router.refresh() — permanece na aba Arquivados. O erro do
// servidor (ex.: campus arquivado) aparece no próprio modal.
export default function RestaurarBotao({
  titulo,
  descricao,
  url,
}: {
  titulo: string;
  descricao: ReactNode;
  url: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setExecutando(true);
    setErro(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErro(json?.error?.message ?? "Não foi possível restaurar.");
        return;
      }
      setAberto(false);
      router.refresh();
    } catch {
      setErro("Falha de rede ao restaurar.");
    } finally {
      setExecutando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
        className="text-xs font-medium text-brand hover:underline"
      >
        Restaurar
      </button>
      {aberto ? (
        <ArquivarModal
          titulo={titulo}
          erro={erro}
          executando={executando}
          rotuloConfirmar="Restaurar"
          rotuloExecutando="Restaurando…"
          classeConfirmar="bg-brand"
          onConfirmar={confirmar}
          onCancelar={() => setAberto(false)}
        >
          {descricao}
        </ArquivarModal>
      ) : null}
    </>
  );
}
