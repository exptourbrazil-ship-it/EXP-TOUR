"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DadosFinanceiros, ParcelaLista } from "@/lib/admin-financeiro";
import { fmtMoeda, fmtBRL, fmtData, fmtPorMoeda } from "@/lib/formato";

// Status efetivo: 'pago' manda; senao, vencido vira 'atrasado'.
function statusEfetivo(p: ParcelaLista, hojeISO: string): "pago" | "atrasado" | "pendente" {
  if (p.status === "pago") return "pago";
  if (p.vencimento < hojeISO) return "atrasado";
  return "pendente";
}

const BADGE: Record<string, string> = {
  pago: "bg-brand/10 text-brand",
  atrasado: "bg-red-100 text-red-700",
  pendente: "bg-amber-100 text-amber-800",
};

// Rotulo legivel do status (evita exibir o slug cru), alinhado ao padrao de
// Quotes. Vermelho no atrasado e permitido no admin.
const STATUS_LABEL: Record<string, string> = {
  pago: "Pago",
  atrasado: "Atrasado",
  pendente: "Pendente",
};

type FiltroStatus = "todos" | "pendente" | "atrasado" | "pago";

export default function FinanceiroClient({ dados }: { dados: DadosFinanceiros }) {
  const { hojeISO, metricas, parcelas } = dados;

  const [status, setStatus] = useState<FiltroStatus>("todos");
  const [moeda, setMoeda] = useState("todas");
  const [destino, setDestino] = useState("todos");
  const [busca, setBusca] = useState("");

  // Opcoes de moeda/destino derivadas dos dados (distintos, ordenados).
  const moedas = useMemo(
    () => Array.from(new Set(parcelas.map((p) => p.moeda))).sort(),
    [parcelas]
  );
  const destinos = useMemo(
    () =>
      Array.from(new Set(parcelas.map((p) => p.pais_destino).filter(Boolean) as string[])).sort(),
    [parcelas]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");
    return parcelas.filter((p) => {
      if (status !== "todos" && statusEfetivo(p, hojeISO) !== status) return false;
      if (moeda !== "todas" && p.moeda !== moeda) return false;
      if (destino !== "todos" && p.pais_destino !== destino) return false;
      if (termo) {
        const nome = (p.titular_nome || "").toLowerCase();
        const estudante = (p.estudante_nome || "").toLowerCase();
        const cpf = (p.titular_cpf || "").replace(/\D/g, "");
        const casaTexto = nome.includes(termo) || estudante.includes(termo);
        const casaCpf = termoDigitos.length > 0 && cpf.includes(termoDigitos);
        if (!casaTexto && !casaCpf) return false;
      }
      return true;
    });
  }, [parcelas, status, moeda, destino, busca, hojeISO]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Financeiro</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Recebido em BRL (do ledger de pagamentos) e valores em aberto agrupados por moeda do
          programa — moedas diferentes não são somadas.
        </p>
      </header>

      {/* Cards de métrica */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Recebido no mês" destaque={fmtBRL(metricas.recebidoMesBRL)} legenda="em BRL, pagamentos confirmados" />
        <Card
          titulo="A receber"
          destaque={fmtPorMoeda(metricas.aReceber.porMoeda)}
          legenda={`${metricas.aReceber.count} parcela(s) em aberto`}
        />
        <Card
          titulo="Em atraso"
          destaque={fmtPorMoeda(metricas.emAtraso.porMoeda)}
          legenda={`${metricas.emAtraso.count} parcela(s) vencida(s)`}
          tom="alerta"
        />
        <Card
          titulo="Vencendo em 7 dias"
          destaque={fmtPorMoeda(metricas.vencendo7d.porMoeda)}
          legenda={`${metricas.vencendo7d.count} parcela(s)`}
        />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo rotulo="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as FiltroStatus)} className={selectClasse}>
            <option value="todos">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="atrasado">Atrasado</option>
            <option value="pago">Pago</option>
          </select>
        </Campo>
        <Campo rotulo="Moeda">
          <select value={moeda} onChange={(e) => setMoeda(e.target.value)} className={selectClasse}>
            <option value="todas">Todas</option>
            {moedas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
        {destinos.length > 0 ? (
          <Campo rotulo="Destino">
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className={selectClasse}>
              <option value="todos">Todos</option>
              {destinos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Campo>
        ) : null}
        <Campo rotulo="Buscar (nome, estudante ou CPF)" larga>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: Maria ou 12345678900"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </Campo>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Destino</th>
              <th className="px-4 py-3 font-medium">Parcela</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((p) => {
              const st = statusEfetivo(p, hojeISO);
              return (
                <tr key={p.id} className="border-b border-neutral-100 last:border-0 hover:bg-brand-cream/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand">{p.titular_nome || "(sem nome)"}</div>
                    {p.titular_cpf ? (
                      <div className="text-xs text-neutral-400">{p.titular_cpf}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {p.estudante_nome ? <div>{p.estudante_nome}</div> : null}
                    <div className="text-xs text-neutral-400">{p.pais_destino || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div>#{p.numero}</div>
                    <div className="text-xs text-neutral-400">{p.descricao}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{fmtData(p.vencimento)}</td>
                  <td className="px-4 py-3 text-right font-medium text-brand">
                    {fmtMoeda(Number(p.valor_atual) || 0, p.moeda)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${BADGE[st]}`}
                    >
                      {STATUS_LABEL[st] ?? st}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.titular_id ? (
                      <Link
                        href={`/admin/clientes/${p.titular_id}?aba=financeiro`}
                        className="whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-cream/50"
                      >
                        Abrir caso
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Nenhuma parcela para os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        {filtradas.length} de {parcelas.length} parcela(s).
      </p>
    </div>
  );
}

const selectClasse = "rounded-xl border border-neutral-300 px-3 py-2 text-sm";

function Campo({ rotulo, larga, children }: { rotulo: string; larga?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${larga ? "min-w-[240px] flex-1" : ""}`}>
      <span className="text-xs font-medium text-neutral-500">{rotulo}</span>
      {children}
    </label>
  );
}

function Card({
  titulo,
  destaque,
  legenda,
  tom,
}: {
  titulo: string;
  destaque: string;
  legenda: string;
  tom?: "alerta";
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${
        tom === "alerta" ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p
        className={`mt-2 font-serif text-xl ${
          tom === "alerta" ? "text-red-700" : "text-brand"
        }`}
      >
        {destaque}
      </p>
      <p className="mt-1 text-xs text-neutral-400">{legenda}</p>
    </div>
  );
}
