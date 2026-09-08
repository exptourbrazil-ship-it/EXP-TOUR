"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizarBusca } from "@/lib/clientes";

type Fornecedor = { id: string; display_name: string };

// Seletor de fornecedor com busca (typeahead) para a Disponibilidade. Substitui
// o <select> simples: com muitas escolas, digitar filtra a lista sem acento.
// Ao escolher, navega para ?supplier=<id> (o servidor recarrega os dados).
export default function FornecedorPicker({
  suppliers,
  value,
}: {
  suppliers: Fornecedor[];
  value: string | null;
}) {
  const router = useRouter();
  const selecionado = suppliers.find((s) => s.id === value) ?? null;
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return suppliers.slice(0, 50);
    return suppliers.filter((s) => normalizarBusca(s.display_name).includes(termo)).slice(0, 50);
  }, [suppliers, busca]);

  function escolher(id: string) {
    setAberto(false);
    setBusca("");
    router.push(`/admin/disponibilidade?supplier=${encodeURIComponent(id)}`);
  }

  return (
    <div className="relative mb-6 max-w-md">
      <label className="mb-1 block text-xs font-medium text-neutral-500">Fornecedor</label>
      <input
        type="text"
        value={aberto ? busca : selecionado?.display_name ?? ""}
        placeholder={selecionado ? selecionado.display_name : "Buscar escola…"}
        onFocus={() => {
          setAberto(true);
          setBusca("");
        }}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onBlur={() => {
          // Atraso para o clique numa opção registrar antes de fechar.
          blurTimer.current = setTimeout(() => setAberto(false), 150);
        }}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        role="combobox"
        aria-expanded={aberto}
        aria-controls="lista-fornecedores"
        autoComplete="off"
      />
      {aberto ? (
        <ul
          id="lista-fornecedores"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg"
          onMouseDown={() => {
            // Evita o blur fechar a lista antes do clique.
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-neutral-500">Nenhuma escola para a busca.</li>
          ) : (
            filtrados.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => escolher(s.id)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                    s.id === value ? "font-medium text-brand" : "text-neutral-700"
                  }`}
                >
                  {s.display_name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
