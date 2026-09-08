"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  resumoFornecedores,
  FORNECEDOR_STATUS_LABEL,
  FORNECEDOR_STATUS_BADGE,
} from "@/lib/fornecedor";
import { normalizarBusca } from "@/lib/clientes";

export type FornecedorLista = {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  status: string;
  preferido: boolean;
  temAcesso: boolean;
};

const FILTROS = [
  { k: "", label: "Todos" },
  { k: "connected", label: "Conectados" },
  { k: "acesso", label: "Com acesso" },
];

// Lista dos fornecedores JÁ cadastrados (complementa o sincronizador acima):
// indicadores, filtro, busca sem acento (nome/país) e badge de status. Só
// leitura — a edição/sync vive nas outras ações.
export default function FornecedoresAtuaisClient({ fornecedores }: { fornecedores: FornecedorLista[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");

  const resumo = useMemo(() => resumoFornecedores(fornecedores), [fornecedores]);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return fornecedores.filter((f) => {
      if (filtro === "connected" && f.status !== "connected") return false;
      if (filtro === "acesso" && !f.temAcesso) return false;
      if (!termo) return true;
      return normalizarBusca([f.name, f.country].filter(Boolean).join(" ")).includes(termo);
    });
  }, [fornecedores, busca, filtro]);

  if (fornecedores.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        Nenhum fornecedor cadastrado ainda. Sincronize acima para importar as escolas do Zoho.
      </p>
    );
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 font-serif text-lg text-brand">Fornecedores atuais</h2>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Fornecedores" valor={resumo.total} legenda="cadastrados" />
        <CardIndicador titulo="Conectados" valor={resumo.conectados} legenda="relação ativa" tom="sucesso" />
        <CardIndicador titulo="Com acesso" valor={resumo.comAcesso} legenda="usam o portal" />
        <CardIndicador titulo="Preferidos" valor={resumo.preferidos} legenda="marcados" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.k;
          return (
            <button
              key={f.k || "todos"}
              type="button"
              onClick={() => setFiltro(f.k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                ativo ? "bg-brand text-brand-cream" : "border border-neutral-300 bg-white text-brand hover:bg-neutral-50"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou país"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />

      {filtrados.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum fornecedor para o filtro/busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Escola</th>
                <th className="px-4 py-2">País</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Acesso</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {filtrados.map((f) => (
                <tr key={f.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">
                    {f.name}
                    {f.preferido ? <span className="ml-2 text-xs text-brand-golddark">★ preferido</span> : null}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{f.country ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FORNECEDOR_STATUS_BADGE[f.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {FORNECEDOR_STATUS_LABEL[f.status] ?? f.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{f.temAcesso ? "sim" : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {f.website ? (
                      <Link href={f.website} target="_blank" rel="noopener noreferrer" className="text-brand-golddark hover:underline">
                        Site →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-400">
        {filtrados.length} de {fornecedores.length} fornecedor(es).
      </p>
    </div>
  );
}

function CardIndicador({ titulo, valor, legenda, tom }: { titulo: string; valor: number; legenda?: string; tom?: "sucesso" }) {
  const corValor = tom === "sucesso" && valor > 0 ? "text-emerald-700" : "text-brand";
  const corBorda = tom === "sucesso" && valor > 0 ? "border-emerald-200" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
