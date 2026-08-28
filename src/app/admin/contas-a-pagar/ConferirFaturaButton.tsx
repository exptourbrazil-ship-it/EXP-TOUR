"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Dispara a conferência (IA) da fatura de um caso sob demanda e recarrega a fila.
export default function ConferirFaturaButton({ contratoId, label = "Conferir fatura" }: { contratoId: string; label?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null as string | null);

  async function conferir() {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/contas-a-pagar/conferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao conferir.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Erro de rede.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        onClick={conferir}
        disabled={ocupado}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
      >
        {ocupado ? "Conferindo…" : label}
      </button>
      {erro ? <span className="ml-2 text-xs text-red-600">{erro}</span> : null}
    </span>
  );
}
