"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Card da Area do Cliente: ADITIVO DE COMPRA (E3) aguardando aceite eletronico
// (Fatia E). O acrescimo em si e cobrado no cronograma de parcelas; aqui o
// cliente apenas CONSENTE com a alteracao de escopo e o valor. O servidor
// revalida posse e estado.

type Proposta = { id: string; termoConteudo: string | null };

export default function AditivoPropostaClient({ proposta }: { proposta: Proposta }) {
  const router = useRouter();
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aceito, setAceito] = useState(false);

  async function aceitar() {
    setErro(null);
    setAceitando(true);
    try {
      const res = await fetch("/api/aditivo/aceitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alteracaoId: proposta.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Não foi possível registrar o aceite.");
        return;
      }
      setAceito(true);
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setAceitando(false);
    }
  }

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-[#c9a35e]/40 bg-[#fdf8ef] p-5">
      <h2 className="mb-1 font-serif text-xl text-[#042f1b]">Aditivo de compra</h2>
      <p className="mb-3 text-sm text-[#042f1b]/80">
        Há uma alteração no seu programa com um acréscimo a pagar. Revise o termo abaixo e, se estiver
        de acordo, confirme o aceite. O valor entra no seu cronograma de parcelas (nada é debitado
        aqui).
      </p>

      {proposta.termoConteudo ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[#c9a35e]/30 bg-white p-3 text-xs text-[#042f1b]">
          {proposta.termoConteudo}
        </pre>
      ) : null}

      {aceito ? (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
          ✓ Aceite registrado. O novo cronograma será aplicado pela nossa equipe.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={aceitar}
            disabled={aceitando}
            className="rounded-lg bg-[#042f1b] px-5 py-2.5 text-sm font-medium text-[#c9a35e] hover:opacity-90 disabled:opacity-50"
          >
            {aceitando ? "Registrando…" : "Aceitar o aditivo"}
          </button>
          {erro ? <span className="text-xs text-amber-700">{erro}</span> : null}
        </div>
      )}
    </div>
  );
}
