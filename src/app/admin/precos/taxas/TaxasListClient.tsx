"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaxaLista } from "@/lib/fee-admin-service";
import { resumoTaxas } from "@/lib/fee";
import { normalizarBusca } from "@/lib/clientes";

const TIPO: Record<string, string> = {
  registration: "Matrícula",
  material: "Material",
  bank: "Bancária",
  placement: "Colocação",
  service: "Serviço",
  courier: "Courier",
  courier_of_documents: "Courier docs",
  custom: "Personalizada",
};
const KIND: Record<string, string> = {
  program: "Programa",
  accommodation: "Acomodação",
  insurance: "Seguro",
  other: "Complementar",
  package: "Pacote",
};

const FILTROS = [
  { k: "", label: "Todas" },
  { k: "obrigatorias", label: "Obrigatórias" },
  { k: "opcionais", label: "Opcionais" },
];

// Lista de taxas: indicadores de topo, filtro por obrigatoriedade, busca
// (nome/campus/tipo, sem acento) e badges (obrigatória/opcional, price list).
// Client-side sobre a lista já carregada no servidor.
export default function TaxasListClient({ taxas }: { taxas: TaxaLista[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");

  const resumo = useMemo(() => resumoTaxas(taxas), [taxas]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return taxas.filter((t) => {
      if (filtro === "obrigatorias" && !t.isMandatory) return false;
      if (filtro === "opcionais" && t.isMandatory) return false;
      if (!termo) return true;
      return normalizarBusca([t.name, t.campusName, TIPO[t.feeType] ?? t.feeType].filter(Boolean).join(" ")).includes(termo);
    });
  }, [taxas, busca, filtro]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Taxas" valor={String(resumo.total)} legenda="no total" />
        <CardIndicador titulo="Obrigatórias" valor={String(resumo.obrigatorias)} legenda="sempre cobradas" />
        <CardIndicador titulo="Opcionais" valor={String(resumo.opcionais)} legenda="conforme escolha" />
        <CardIndicador titulo="De price list" valor={String(resumo.geridas)} legenda="só leitura" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.k;
          return (
            <button
              key={f.k || "todas"}
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
        placeholder="Buscar por nome, campus ou tipo"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />

      {taxas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma taxa cadastrada.</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma taxa para o filtro/busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Aplica a</th>
                <th className="px-4 py-2">Campus</th>
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
                    {!t.isMandatory ? <span className="ml-2 text-xs text-neutral-400">(opcional)</span> : null}
                  </td>
                  <td className="px-4 py-2">{TIPO[t.feeType] ?? t.feeType}</td>
                  <td className="px-4 py-2">
                    {t.modo === "fixo" ? `${t.currency ?? ""} ${t.amount != null ? t.amount.toFixed(2) : ""}` : "tabela"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {t.appliesToKinds.length ? t.appliesToKinds.map((k) => KIND[k] ?? k).join(", ") : "—"}
                    {t.produtos > 0 ? ` · ${t.produtos} produto(s)` : ""}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{t.campusName ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/taxas/${t.id}`} className="text-brand-golddark hover:underline">
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
        {filtradas.length} de {taxas.length} taxa(s).
      </p>
    </>
  );
}

function CardIndicador({ titulo, valor, legenda }: { titulo: string; valor: string; legenda?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className="mt-2 font-serif text-xl text-brand">{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
