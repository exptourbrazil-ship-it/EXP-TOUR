"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botão "Reabrir" de um item da aba Concluídas hoje: volta a tarefa para
// 'aberto' (some da lista de concluídas, reaparece na fila). Cliente porque
// muta e recarrega. A autorização (por papel) fica no servidor; aqui só
// enviamos a ação e a chave_dedupe.
export default function ReabrirBotao({ chaveDedupe }: { chaveDedupe: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(false);

  async function reabrir() {
    setOcupado(true);
    setErro(false);
    try {
      const resp = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reabrir", chaveDedupe }),
      });
      if (!resp.ok) setErro(true);
      else router.refresh();
    } catch {
      setErro(true);
    }
    setOcupado(false);
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        disabled={ocupado}
        onClick={reabrir}
        className="shrink-0 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-neutral-50 disabled:opacity-50"
      >
        {ocupado ? "…" : "Reabrir"}
      </button>
      {erro ? <span className="text-[10px] text-red-600">erro</span> : null}
    </div>
  );
}
