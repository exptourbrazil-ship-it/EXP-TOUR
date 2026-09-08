"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TabelaPrecoLista } from "@/lib/price-template-admin-service";
import { resumoTabelasPreco } from "@/lib/preco-template";
import { normalizarBusca } from "@/lib/clientes";

const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", expired: "Expirado" };
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-neutral-100 text-neutral-400",
};
const BASE_LABEL: Record<string, string> = {
  duration: "Duração",
  quantity: "Quantidade",
  fixed: "Fixo",
  per_person: "Por pessoa",
};

const FILTROS = [
  { k: "", label: "Todas" },
  { k: "active", label: "Ativas" },
  { k: "draft", label: "Rascunhos" },
  { k: "expired", label: "Expiradas" },
];

// Lista de tabelas de preço: indicadores de topo, filtro por status, busca
// (nome/campus/moeda, sem acento) e badge de status. Preserva o marcador
// "price list" (gerida) e o link Ver/Editar. Client-side sobre a lista já
// carregada no servidor.
export default function TabelasPrecoListClient({ tabelas }: { tabelas: TabelaPrecoLista[] }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");

  const resumo = useMemo(() => resumoTabelasPreco(tabelas), [tabelas]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return tabelas.filter((t) => {
      if (status && t.status !== status) return false;
      if (!termo) return true;
      return normalizarBusca([t.name, t.campusName, t.currency].filter(Boolean).join(" ")).includes(termo);
    });
  }, [tabelas, busca, status]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Tabelas" valor={String(resumo.total)} legenda="no total" />
        <CardIndicador
          titulo="Ativas"
          valor={String(resumo.ativas)}
          legenda="valendo na cotação"
          tom={resumo.ativas > 0 ? "sucesso" : undefined}
        />
        <CardIndicador titulo="Rascunhos" valor={String(resumo.rascunhos)} legenda="não publicadas" />
        <CardIndicador titulo="Expiradas" valor={String(resumo.expiradas)} legenda="fora de vigência" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const ativo = status === f.k;
          return (
            <button
              key={f.k || "todas"}
              type="button"
              onClick={() => setStatus(f.k)}
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
        placeholder="Buscar por nome, campus ou moeda"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />

      {tabelas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma tabela cadastrada.</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma tabela para o filtro/busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2">Base</th>
                <th className="px-4 py-2">Moeda</th>
                <th className="px-4 py-2">Faixas</th>
                <th className="px-4 py-2">Produtos</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {filtradas.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">
                    {t.name}
                    {t.gerida ? (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                        price list
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{t.campusName ?? "—"}</td>
                  <td className="px-4 py-2">{BASE_LABEL[t.priceBasis] ?? t.priceBasis}</td>
                  <td className="px-4 py-2">{t.currency}</td>
                  <td className="px-4 py-2">{t.faixas}</td>
                  <td className="px-4 py-2">{t.produtos}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/tabelas/${t.id}`} className="text-brand-golddark hover:underline">
                      {t.gerida ? "Ver →" : "Editar →"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-400">
        {filtradas.length} de {tabelas.length} tabela(s).
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
  tom?: "sucesso";
}) {
  const corValor = tom === "sucesso" ? "text-emerald-700" : "text-brand";
  const corBorda = tom === "sucesso" ? "border-emerald-200" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
