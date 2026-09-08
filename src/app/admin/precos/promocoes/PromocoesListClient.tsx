"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PromocaoLista } from "@/lib/promocao-admin-service";
import { resumoPromocoes } from "@/lib/promocao";
import { normalizarBusca } from "@/lib/clientes";

const TIPO: Record<string, string> = {
  percent_off: "Desconto %",
  fixed_off: "Desconto fixo",
  free_units: "Unidades grátis",
  waive_fee: "Isentar taxa",
  free_product: "Produto grátis",
  override_price: "Preço promocional",
};
const APLICA: Record<string, string> = {
  tuition: "Curso",
  accommodation: "Acomodação",
  insurance: "Seguro",
  fees: "Taxas",
  specific_fee: "Taxa específica",
  total: "Total",
  specific_product: "Produto específico",
};
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", expired: "Expirado" };
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-neutral-100 text-neutral-400",
};

const FILTROS = [
  { k: "", label: "Todas" },
  { k: "active", label: "Ativas" },
  { k: "draft", label: "Rascunhos" },
  { k: "expired", label: "Expiradas" },
];

// Lista de promoções: indicadores de topo, filtro por status, busca
// (nome/fornecedor/campus, sem acento) e badge de status. Client-side sobre a
// lista já carregada no servidor.
export default function PromocoesListClient({ promocoes }: { promocoes: PromocaoLista[] }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");

  const resumo = useMemo(() => resumoPromocoes(promocoes), [promocoes]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return promocoes.filter((p) => {
      if (status && p.status !== status) return false;
      if (!termo) return true;
      return normalizarBusca([p.name, p.supplierName, p.campusName].filter(Boolean).join(" ")).includes(termo);
    });
  }, [promocoes, busca, status]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Promoções" valor={String(resumo.total)} legenda="no total" />
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
        placeholder="Buscar por nome, fornecedor ou campus"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />

      {promocoes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma promoção cadastrada.</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma promoção para o filtro/busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Aplica a</th>
                <th className="px-4 py-2">Fornecedor</th>
                <th className="px-4 py-2">Prio.</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {filtradas.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">
                    {p.name}
                    {p.isStackable ? <span className="ml-2 text-xs text-neutral-400">(empilhável)</span> : null}
                    {p.segmentos > 0 ? (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                        {p.segmentos} seg.
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {TIPO[p.promoType] ?? p.promoType}
                    {p.value != null ? ` · ${p.value}` : ""}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{APLICA[p.appliesTo] ?? p.appliesTo}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {p.supplierName ?? "—"}
                    {p.campusName ? ` · ${p.campusName}` : ""}
                  </td>
                  <td className="px-4 py-2">{p.priority}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/promocoes/${p.id}`} className="text-brand-golddark hover:underline">
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
        {filtradas.length} de {promocoes.length} promoção(ões).
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
