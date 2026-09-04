"use client";

import { useState } from "react";

// Abas da página unificada "Editar produto" (estilo Edvisor "Edit Program").
// Recebe cada seção já renderizada no servidor como um slot (React node) e só
// controla qual está visível — não conhece os dados. As seções em si (editor de
// informação, preços & taxas, elegibilidade, conteúdo) seguem sendo os mesmos
// componentes de sempre; aqui apenas as reunimos numa navegação por abas.
export type AbaProduto = { chave: string; label: string; conteudo: React.ReactNode };

export default function ProdutoTabs({ abas }: { abas: AbaProduto[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.chave ?? "");

  return (
    <div>
      <div role="tablist" aria-label="Seções do produto" className="mb-5 flex flex-wrap gap-1 border-b border-neutral-200">
        {abas.map((a) => {
          const sel = a.chave === ativa;
          return (
            <button
              key={a.chave}
              type="button"
              role="tab"
              aria-selected={sel}
              onClick={() => setAtiva(a.chave)}
              className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
                sel
                  ? "border-brand text-brand"
                  : "border-transparent text-neutral-500 hover:text-brand"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {abas.map((a) => (
        <div key={a.chave} role="tabpanel" hidden={a.chave !== ativa}>
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
