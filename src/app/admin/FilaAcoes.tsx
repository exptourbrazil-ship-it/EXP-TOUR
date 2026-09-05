"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botões de ação de um item da Fila do Dia: Assumir (vira dono), Concluir
// (some da fila) e Devolver (solta o dono). Cliente porque muta e recarrega.
// A autorização e o conteúdo da task ficam no servidor (rota /api/admin/tasks);
// aqui só enviamos a ação e a chave_dedupe do item.
export default function FilaAcoes({
  chaveDedupe,
  dono,
  usuarioAtual,
}: {
  chaveDedupe: string;
  dono?: string | null;
  usuarioAtual: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const minha = !!dono && dono === usuarioAtual;

  async function agir(acao: "assumir" | "concluir" | "devolver") {
    setOcupado(acao);
    setErro(false);
    try {
      const resp = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, chaveDedupe }),
      });
      if (!resp.ok) setErro(true);
      else router.refresh();
    } catch {
      setErro(true);
    }
    setOcupado(null);
  }

  const btn = "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {!dono ? (
        <button
          type="button"
          disabled={!!ocupado}
          onClick={() => agir("assumir")}
          className={`${btn} border border-neutral-300 bg-white text-brand hover:bg-neutral-50`}
        >
          {ocupado === "assumir" ? "…" : "Assumir"}
        </button>
      ) : null}
      {minha ? (
        <button type="button" disabled={!!ocupado} onClick={() => agir("devolver")} className={`${btn} text-neutral-500 hover:bg-neutral-100`}>
          {ocupado === "devolver" ? "…" : "Devolver"}
        </button>
      ) : null}
      <button
        type="button"
        disabled={!!ocupado}
        onClick={() => agir("concluir")}
        className={`${btn} border border-brand-gold/50 bg-brand-cream/60 text-brand-golddark hover:bg-brand-cream`}
      >
        {ocupado === "concluir" ? "…" : "Concluir"}
      </button>
      {erro ? <span className="text-[10px] text-red-600">erro</span> : null}
    </div>
  );
}
