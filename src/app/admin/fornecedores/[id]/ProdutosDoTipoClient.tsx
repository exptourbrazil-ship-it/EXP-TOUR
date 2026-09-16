"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProdutoLista } from "@/lib/produto-admin-service";
import { normalizarBusca } from "@/lib/clientes";

const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", inactive: "Inativo" };
const VIS_LABEL: Record<string, string> = { hidden: "Oculto", internal: "Interno", quotable: "Cotável", sellable: "Vendável" };
const SOURCE_LABEL: Record<string, string> = { internal: "Interno", supplier: "Fornecedor" };
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-red-100 text-red-700",
};
const VIS_BADGE: Record<string, string> = {
  hidden: "bg-neutral-100 text-neutral-400",
  internal: "bg-neutral-100 text-neutral-600",
  quotable: "bg-brand-gold/25 text-brand-golddark",
  sellable: "bg-emerald-100 text-emerald-700",
};

// Lista de produtos de UM tipo (Programas/Acomodação/Outros/Pacotes/Seguro) do
// fornecedor, no estilo Edvisor. Busca por nome/campus; abre o editor do produto
// (onde vivem preço, conteúdo, disponibilidade e promoções ligadas).
export default function ProdutosDoTipoClient({
  produtos,
  vazioLabel,
}: {
  produtos: ProdutoLista[];
  vazioLabel: string;
}) {
  const [busca, setBusca] = useState("");
  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return produtos;
    return produtos.filter((p) => normalizarBusca([p.name, p.campusName].filter(Boolean).join(" ")).includes(termo));
  }, [produtos, busca]);

  if (produtos.length === 0) {
    return <p className="text-sm text-neutral-500">{vazioLabel}</p>;
  }

  return (
    <>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou campus"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />
      {filtrados.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum item para a busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2">Fonte</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Visibilidade</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {filtrados.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">{p.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.campusName ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{SOURCE_LABEL[p.source] ?? p.source}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VIS_BADGE[p.visibility] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {VIS_LABEL[p.visibility] ?? p.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/produtos/${p.id}`} className="text-brand-golddark hover:underline">
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-400">
        {filtrados.length} de {produtos.length} item(ns).
      </p>
    </>
  );
}
