"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProdutoLista } from "@/lib/produto-admin-service";
import { resumoProdutos } from "@/lib/produto";
import { normalizarBusca } from "@/lib/clientes";

const KIND_LABEL: Record<string, string> = {
  program: "Programa",
  accommodation: "Acomodação",
  insurance: "Seguro",
  other: "Complementar",
  package: "Pacote",
};
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

const FILTROS = [
  { k: "", label: "Todos" },
  { k: "program", label: "Programas" },
  { k: "accommodation", label: "Acomodações" },
  { k: "insurance", label: "Seguros" },
  { k: "other", label: "Complementares" },
  { k: "package", label: "Pacotes" },
];

// Lista de produtos: indicadores de topo (sobre o catálogo completo), filtro por
// tipo, busca (nome/fornecedor/campus, sem acento) e badges de status/
// visibilidade. Client-side sobre a lista já carregada no servidor.
export default function ProdutosListClient({ produtos }: { produtos: ProdutoLista[] }) {
  const [busca, setBusca] = useState("");
  const [kind, setKind] = useState("");

  const resumo = useMemo(() => resumoProdutos(produtos), [produtos]);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return produtos.filter((p) => {
      if (kind && p.kind !== kind) return false;
      if (!termo) return true;
      return normalizarBusca([p.name, p.supplierName, p.campusName].filter(Boolean).join(" ")).includes(termo);
    });
  }, [produtos, busca, kind]);

  return (
    <>
      {/* Indicadores de topo */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Produtos" valor={String(resumo.total)} legenda="no catálogo" />
        <CardIndicador titulo="Ativos" valor={String(resumo.ativos)} legenda="status ativo" />
        <CardIndicador
          titulo="Cotáveis"
          valor={String(resumo.cotaveis)}
          legenda="visíveis na cotação"
          tom={resumo.cotaveis > 0 ? "atencao" : undefined}
        />
        <CardIndicador titulo="Tipos" valor={String(Object.keys(resumo.porTipo).length)} legenda="verticais com itens" />
      </div>

      {/* Filtro por tipo + busca */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const ativo = kind === f.k;
          const n = f.k ? resumo.porTipo[f.k] ?? 0 : resumo.total;
          return (
            <button
              key={f.k || "todos"}
              type="button"
              onClick={() => setKind(f.k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                ativo ? "bg-brand text-brand-cream" : "border border-neutral-300 bg-white text-brand hover:bg-neutral-50"
              }`}
            >
              {f.label}
              <span className={ativo ? "ml-1 opacity-80" : "ml-1 text-neutral-400"}>{n}</span>
            </button>
          );
        })}
      </div>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, fornecedor ou campus"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />

      {produtos.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum produto cadastrado.</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum produto para o filtro/busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Fornecedor / Campus</th>
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
                  <td className="px-4 py-2">{KIND_LABEL[p.kind] ?? p.kind}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {p.supplierName ?? "—"}
                    {p.campusName ? ` · ${p.campusName}` : ""}
                  </td>
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
                      Editar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-400">
        {filtrados.length} de {produtos.length} produto(s).
      </p>
    </>
  );
}

function CardIndicador({
  titulo,
  valor,
  legenda,
  tom,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  tom?: "atencao";
}) {
  const corValor = tom === "atencao" ? "text-brand-golddark" : "text-brand";
  const corBorda = tom === "atencao" ? "border-brand-gold/40" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
