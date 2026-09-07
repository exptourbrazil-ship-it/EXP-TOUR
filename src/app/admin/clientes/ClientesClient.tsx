"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClienteCarteira } from "@/lib/clientes";
import { normalizarBusca, resumoCarteira } from "@/lib/clientes";
import { fmtPorMoeda, fmtData } from "@/lib/formato";

// Colunas ordenáveis. O saldo não entra (multi-moeda não tem ordem única).
type Ordem = "nome" | "contratos" | "atraso" | "inicio";
type Dir = "asc" | "desc";

// Carteira de clientes: uma linha por titular, com contratos, progresso das
// parcelas, saldo em aberto por moeda e atraso. Indicadores de topo, busca
// (nome/estudante/CPF, sem acento), filtros (destino, "só com atraso") e
// ordenação por coluna. Tudo client-side sobre a lista já carregada.
export default function ClientesClient({ clientes }: { clientes: ClienteCarteira[] }) {
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState("todos");
  const [soAtraso, setSoAtraso] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("nome");
  const [dir, setDir] = useState<Dir>("asc");

  // Indicadores de topo: sempre sobre a carteira COMPLETA (não a filtrada).
  const resumo = useMemo(() => resumoCarteira(clientes), [clientes]);

  const destinos = useMemo(
    () => Array.from(new Set(clientes.flatMap((c) => c.destinos))).sort(),
    [clientes]
  );

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    const termoDigitos = busca.replace(/\D/g, "");
    const lista = clientes.filter((c) => {
      if (destino !== "todos" && !c.destinos.includes(destino)) return false;
      if (soAtraso && c.emAtraso === 0) return false;
      if (termo || termoDigitos) {
        const nome = normalizarBusca(c.nome);
        const estudantes = normalizarBusca(c.estudantes.join(" "));
        const cpf = (c.cpf || "").replace(/\D/g, "");
        const casaTexto = !!termo && (nome.includes(termo) || estudantes.includes(termo));
        const casaCpf = termoDigitos.length > 0 && cpf.includes(termoDigitos);
        if (!casaTexto && !casaCpf) return false;
      }
      return true;
    });

    const fator = dir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      let cmp = 0;
      if (ordem === "nome") cmp = (a.nome || "").localeCompare(b.nome || "", "pt-BR");
      else if (ordem === "contratos") cmp = a.numContratos - b.numContratos;
      else if (ordem === "atraso") cmp = a.emAtraso - b.emAtraso;
      else if (ordem === "inicio") cmp = (a.data_inicio || "").localeCompare(b.data_inicio || "");
      if (cmp === 0) cmp = (a.nome || "").localeCompare(b.nome || "", "pt-BR"); // desempate estável
      return cmp * fator;
    });
  }, [clientes, busca, destino, soAtraso, ordem, dir]);

  // Alterna a ordenação de uma coluna: 1º clique asc, 2º desc.
  function ordenarPor(col: Ordem) {
    if (ordem === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setOrdem(col);
      setDir(col === "nome" ? "asc" : "desc"); // números/atraso começam do maior
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Clientes</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Carteira de titulares e contratos, com progresso das parcelas e saldo em aberto por moeda.
        </p>
      </header>

      {/* Indicadores de topo (carteira completa) */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Clientes" valor={String(resumo.total)} legenda="na carteira" />
        <CardIndicador
          titulo="Com atraso"
          valor={String(resumo.comAtraso)}
          legenda="ao menos 1 parcela vencida"
          tom={resumo.comAtraso > 0 ? "alerta" : undefined}
        />
        <CardIndicador
          titulo="Processo ativo"
          valor={String(resumo.comProcessoAtivo)}
          legenda="exceção em aberto"
          tom={resumo.comProcessoAtivo > 0 ? "atencao" : undefined}
        />
        <CardIndicador
          titulo="Saldo em aberto"
          valor={
            Object.keys(resumo.saldoPorMoeda).length > 0 ? fmtPorMoeda(resumo.saldoPorMoeda) : "—"
          }
          legenda="total por moeda"
        />
      </div>

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
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <ThOrdenavel rotulo="Cliente" col="nome" ordem={ordem} dir={dir} onClick={ordenarPor} />
              <th className="px-4 py-3 font-medium">Estudante / Destino</th>
              <ThOrdenavel rotulo="Contratos" col="contratos" ordem={ordem} dir={dir} onClick={ordenarPor} />
              <th className="px-4 py-3 font-medium">Parcelas</th>
              <th className="px-4 py-3 text-right font-medium">Saldo em aberto</th>
              <ThOrdenavel rotulo="Atraso" col="atraso" ordem={ordem} dir={dir} onClick={ordenarPor} />
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-brand-cream/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-brand">{c.nome || "(sem nome)"}</span>
                    {c.processosAtivos > 0 ? (
                      <span
                        title={`${c.processosAtivos} processo(s) de exceção ativo(s)`}
                        aria-label={`${c.processosAtivos} processo(s) de exceção ativo(s)`}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-semibold text-brand-golddark"
                      >
                        <span aria-hidden>⚑</span> processo
                      </span>
                    ) : null}
                  </div>
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
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/clientes/${c.id}`}
                    className="inline-block rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-cream/40"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-500">
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

// Cabeçalho de coluna ordenável: mostra a seta da direção quando ativo.
function ThOrdenavel({
  rotulo,
  col,
  ordem,
  dir,
  onClick,
}: {
  rotulo: string;
  col: Ordem;
  ordem: Ordem;
  dir: Dir;
  onClick: (col: Ordem) => void;
}) {
  const ativo = ordem === col;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onClick(col)}
        aria-sort={ativo ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={"inline-flex items-center gap-1 " + (ativo ? "text-brand" : "hover:text-brand")}
      >
        {rotulo}
        <span aria-hidden className={ativo ? "opacity-100" : "opacity-30"}>
          {ativo ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
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
  tom?: "alerta" | "atencao";
}) {
  const corValor =
    tom === "alerta" ? "text-red-700" : tom === "atencao" ? "text-brand-golddark" : "text-brand";
  const corBorda =
    tom === "alerta" ? "border-red-200" : tom === "atencao" ? "border-brand-gold/40" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
