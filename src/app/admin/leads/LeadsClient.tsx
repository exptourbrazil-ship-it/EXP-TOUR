"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LeadLista } from "@/lib/admin-leads";
import { STATUS_LEAD, STATUS_LEAD_LABEL, resumoLeads, type StatusLead } from "@/lib/leads";
import { normalizarBusca } from "@/lib/clientes";
import { fmtData } from "@/lib/formato";
import StatusBadge from "./StatusBadge";

// Fila de leads do orcamento: uma linha por lead, com contato, programa
// escolhido, origem e status. Indicadores por status no topo, busca
// (nome/estudante/CPF/e-mail) e filtro por status. Tudo client-side sobre a
// lista ja carregada no servidor.
export default function LeadsClient({ leads }: { leads: LeadLista[] }) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusLead | "todos" | "abertos">("abertos");

  const resumo = useMemo(() => resumoLeads(leads), [leads]);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    const termoDigitos = busca.replace(/\D/g, "");
    return leads.filter((l) => {
      if (filtroStatus === "abertos" && (l.status === "convertido" || l.status === "descartado")) return false;
      if (filtroStatus !== "todos" && filtroStatus !== "abertos" && l.status !== filtroStatus) return false;
      if (termo || termoDigitos) {
        const alvoTexto = normalizarBusca(`${l.nome} ${l.participanteNome ?? ""} ${l.email ?? ""} ${l.programaNome ?? ""} ${l.escola ?? ""}`);
        const cpf = (l.cpf || "").replace(/\D/g, "");
        const casaTexto = !!termo && alvoTexto.includes(termo);
        const casaCpf = termoDigitos.length > 0 && cpf.includes(termoDigitos);
        if (!casaTexto && !casaCpf) return false;
      }
      return true;
    });
  }, [leads, busca, filtroStatus]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Comercial</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Leads</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Pedidos de matrícula vindos do orçamento. Abra um lead para trabalhar o funil e, quando fechar,
          converter em cliente (conta na Área do Cliente) com a cotação.
        </p>
      </header>

      {/* Indicadores por status */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <CardIndicador titulo="Total" valor={String(resumo.total)} legenda="todos os leads" />
        {STATUS_LEAD.map((s) => (
          <CardIndicador
            key={s}
            titulo={STATUS_LEAD_LABEL[s]}
            valor={String(resumo[s])}
            legenda=" "
            tom={s === "novo" && resumo[s] > 0 ? "atencao" : undefined}
          />
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Buscar (nome, estudante, e-mail, CPF ou programa)</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: Maria, ETC ou 12345678900"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Status</span>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as StatusLead | "todos" | "abertos")}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="abertos">Abertos (não fechados)</option>
            <option value="todos">Todos</option>
            {STATUS_LEAD.map((s) => (
              <option key={s} value={s}>{STATUS_LEAD_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Programa escolhido</th>
              <th className="px-4 py-3 font-medium">Recebido</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((l) => (
              <tr key={l.id} className="border-b border-neutral-100 last:border-0 hover:bg-brand-cream/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-brand">{l.nome || "(sem nome)"}</span>
                    {l.temTitular ? (
                      <span
                        title="CPF já tem conta na Área do Cliente"
                        className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
                      >
                        cliente
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {l.email || "—"}
                    {l.telefone ? ` · ${l.telefone}` : ""}
                  </div>
                  {l.participanteNome ? (
                    <div className="text-xs text-neutral-400">participante: {l.participanteNome}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {l.programaNome ? <div>{l.programaNome}</div> : <span className="text-neutral-400">—</span>}
                  {l.escola ? <div className="text-xs text-neutral-400">{l.escola}</div> : null}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {fmtData((l.createdAt || "").slice(0, 10))}
                </td>
                <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leads/${l.id}`}
                    className="inline-block rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-cream/40"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Nenhum lead para os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        {filtrados.length} de {leads.length} lead(s).
      </p>
    </div>
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
    <div className={`rounded-2xl border bg-white p-3 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-1 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
