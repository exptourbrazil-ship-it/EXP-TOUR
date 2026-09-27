"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ações de confirmar/rejeitar a proposta de conta bancária (destino do
// repasse). Confirmar troca a conta VIGENTE do fornecedor — por isso o
// texto deixa explícito o efeito e pede uma confirmação extra (confirm()),
// mesmo padrão de PropostaPromocaoClient.tsx.
export default function ContaBancariaAdminClient({ id, supplierId }: { id: string; supplierId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [formRecusa, setFormRecusa] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function confirmar() {
    if (
      !confirm(
        "Confirmar esta conta como o destino do repasse deste fornecedor? A conta confirmada anteriormente (se houver) deixa de valer. Confira os dados com atenção — isto é dinheiro.",
      )
    )
      return;
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/contas-bancarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmar", id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao confirmar.");
        return;
      }
      setOk("Conta confirmada como destino do repasse.");
      setTimeout(() => router.push(`/admin/fornecedores/${supplierId}`), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function rejeitar() {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/contas-bancarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "rejeitar", id, motivo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao recusar.");
        return;
      }
      setOk("Proposta recusada.");
      setTimeout(() => router.push("/admin/contas-bancarias"), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-1 font-serif text-lg text-brand">Decisão</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Confirmar só tem efeito depois deste clique — nada muda automaticamente. Verifique titular, banco e
        identificador com a escola por um canal já conhecido antes de confirmar.
      </p>
      {erro ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{erro}</div> : null}
      {ok ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">{ok}</div> : null}

      {!formRecusa ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={confirmar} disabled={ocupado} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {ocupado ? "Confirmando…" : "Confirmar conta"}
          </button>
          <button type="button" onClick={() => { setErro(null); setFormRecusa(true); }} disabled={ocupado} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60">
            Recusar proposta
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-neutral-600">Motivo da recusa (fica no histórico)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
            placeholder="Ex.: dados divergentes do que consta no contrato; confirmar por telefone com a escola…"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={rejeitar} disabled={ocupado || !motivo.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Confirmar recusa
            </button>
            <button type="button" onClick={() => setFormRecusa(false)} disabled={ocupado} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
