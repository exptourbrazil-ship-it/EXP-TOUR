"use client";

import type { ReactNode } from "react";

// Modal de confirmação de arquivamento (soft-delete). Presentacional: quem usa
// controla o estado. Mostra o que acontece, avisos informativos e o erro do
// servidor (ex.: "é item de um pacote em uso").
export default function ArquivarModal({
  titulo,
  children,
  avisos = [],
  erro,
  carregando,
  executando,
  rotuloConfirmar = "Arquivar",
  rotuloExecutando = "Arquivando…",
  classeConfirmar = "bg-red-700",
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  children: ReactNode;
  avisos?: string[];
  erro?: string | null;
  carregando?: boolean;
  executando?: boolean;
  rotuloConfirmar?: string;
  rotuloExecutando?: string;
  classeConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="font-serif text-lg text-brand">{titulo}</h3>
        <div className="mt-2 space-y-2 text-sm text-neutral-700">{children}</div>
        {carregando ? <p className="mt-3 text-xs text-neutral-500">Verificando impacto…</p> : null}
        {avisos.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {avisos.map((a, i) => (
              <li key={i}>Atenção: {a}</li>
            ))}
          </ul>
        ) : null}
        {erro ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={executando} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} disabled={executando || carregando} className={`rounded-lg ${classeConfirmar} px-4 py-2 text-sm font-medium text-white disabled:opacity-60`}>
            {executando ? rotuloExecutando : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
