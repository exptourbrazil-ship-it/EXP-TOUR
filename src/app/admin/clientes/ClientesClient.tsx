"use client";

import { useMemo, useState } from "react";
import type { ClienteCarteira } from "@/lib/clientes";
import { fmtPorMoeda, fmtData } from "@/lib/formato";

// Carteira de clientes: uma linha por titular, com contratos, progresso das
// parcelas, saldo em aberto por moeda e atraso. Filtros no cliente (busca por
// nome/CPF, destino e "só com atraso").
export default function ClientesClient({ clientes }: { clientes: ClienteCarteira[] }) {
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState("todos");
  const [soAtraso, setSoAtraso] = useState(false);

  const destinos = useMemo(
    () => Array.from(new Set(clientes.flatMap((c) => c.destinos))).sort(),
    [clientes]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");
    return clientes.filter((c) => {
      if (destino !== "todos" && !c.destinos.includes(destino)) return false;
      if (soAtraso && c.emAtraso === 0) return false;
      if (termo) {
        const nome = (c.nome || "").toLowerCase();
        const estudantes = c.estudantes.join(" ").toLowerCase();
        const cpf = (c.cpf || "").replace(/\D/g, "");
        const casaTexto = nome.includes(termo) || estudantes.includes(termo);
        const casaCpf = termoDigitos.length > 0 && cpf.includes(termoDigitos);
        if (!casaTexto && !casaCpf) return false;
      }
      return true;
    });
  }, [clientes, busca, destino, soAtraso]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Clientes</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Carteira de titulares e contratos, com progresso das parcelas e saldo em aberto por moeda.
        </p>
      </header>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Buscar (nome, estudante ou CPF)</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: Maria ou 12345678900"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        {destinos.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Destino</span>
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              {destinos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm text-brand">
          <input type="checkbox" checked={soAtraso} onChange={(e) => setSoAtraso(e.target.checked)} />
          Só com atraso
        </label>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estudante / Destino</th>
              <th className="px-4 py-3 font-medium">Contratos</th>
              <th className="px-4 py-3 font-medium">Parcelas</th>
              <th className="px-4 py-3 text-right font-medium">Saldo em aberto</th>
              <th className="px-4 py-3 font-medium">Atraso</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-brand-cream/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-brand">{c.nome || "(sem nome)"}</div>
                  <div className="text-xs text-neutral-400">
                    {c.cpf || "—"}
                    {c.telefone ? ` · ${c.telefone}` : ""}
                  </div>
                  {c.data_inicio ? (
                    <div className="text-xs text-neutral-400">início {fmtData(c.data_inicio)}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {c.estudantes.length > 0 ? <div>{c.estudantes.join(", ")}</div> : null}
                  <div className="text-xs text-neutral-400">
                    {c.destinos.length > 0 ? c.destinos.join(", ") : "—"}
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-600">{c.numContratos}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {c.parcelasTotal > 0 ? (
                    <span>
                      {c.parcelasPagas}/{c.parcelasTotal} pagas
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-brand">
                  {fmtPorMoeda(c.saldoPorMoeda)}
                </td>
                <td className="px-4 py-3">
                  {c.emAtraso > 0 ? (
                    <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                      {c.emAtraso} parcela(s)
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">em dia</span>
                  )}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Nenhum cliente para os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        {filtrados.length} de {clientes.length} cliente(s).
      </p>
    </div>
  );
}
