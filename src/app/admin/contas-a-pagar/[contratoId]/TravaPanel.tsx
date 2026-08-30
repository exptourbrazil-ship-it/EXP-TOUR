"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Painel da trava de remessa (Clausulas 2.5.2 / 8.4): a remessa esta bloqueada
// enquanto o arrependimento corre. Oferece marcar "processamento imediato" (a
// autorizacao EXPRESSA do cliente) para liberar antes. A enforcement real e no
// servidor (executarRepasse recusa) — este painel so opera a excecao.
export default function TravaPanel({
  contratoId,
  liberaEmISO,
}: {
  contratoId: string;
  liberaEmISO: string | null;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ate = liberaEmISO
    ? new Date(liberaEmISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;

  async function marcarImediato() {
    if (!confirm("Confirmar que o cliente autorizou o PROCESSAMENTO IMEDIATO? Isso libera a remessa antes do fim do prazo de arrependimento.")) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/admin/contratos/${contratoId}/processamento-imediato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imediato: true }),
      });
      const j = await r.json();
      if (j.ok) router.refresh();
      else setErro(j.error || "Falha ao liberar.");
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-1 font-serif text-lg text-amber-900">Remessa travada</h2>
      <p className="text-sm text-amber-900">
        O direito de arrependimento (7 dias) {ate ? <>está em curso até <b>{ate}</b></> : "está em curso"}. Enquanto
        isso, a Entrada <b>não é remetida</b> ao fornecedor (Cláusulas 2.5.2 / 8.4).
      </p>
      <p className="mt-2 text-sm text-amber-900">
        Se o cliente <b>autorizou expressamente</b> o processamento imediato, você pode liberar a remessa agora:
      </p>
      <button
        type="button"
        onClick={marcarImediato}
        disabled={salvando}
        className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {salvando ? "Liberando…" : "Marcar processamento imediato e liberar"}
      </button>
      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
    </div>
  );
}
