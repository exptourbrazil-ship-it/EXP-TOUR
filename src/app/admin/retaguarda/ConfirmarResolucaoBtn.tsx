"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botão de confirmação (ack) da resolução de um achado ALTO. POSTa o id e
// atualiza a página. A decisão passa por pessoa — o botão só existe para quem
// tem a capacidade casos.gerir (a rota reforça no servidor).
export default function ConfirmarResolucaoBtn({ id }: { id: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/retaguarda/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErro(j?.error || "Falha ao confirmar");
        setEnviando(false);
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de rede");
      setEnviando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="rounded-lg bg-cta px-3 py-1 text-xs font-semibold text-brand-cream disabled:opacity-60"
      >
        {enviando ? "Confirmando…" : "Confirmar resolução"}
      </button>
      {erro ? <span className="text-[11px] text-red-600">{erro}</span> : null}
    </span>
  );
}
