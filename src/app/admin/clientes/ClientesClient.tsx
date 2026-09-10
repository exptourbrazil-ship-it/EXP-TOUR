"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
export default function ClientesClient({
  clientes,
  podeGerir = false,
  modo = "ativos",
}: {
  clientes: ClienteCarteira[];
  podeGerir?: boolean;
  modo?: "ativos" | "arquivados";
}) {
  const [novoAberto, setNovoAberto] = useState(false);
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
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
          <h1 className="mt-1 font-serif text-3xl text-brand">
            {modo === "arquivados" ? "Clientes arquivados" : "Clientes"}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            {modo === "arquivados"
              ? "Clientes arquivados (ocultos da carteira). Abra um cliente para restaurar."
              : "Carteira de titulares e contratos, com progresso das parcelas e saldo em aberto por moeda."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {modo === "arquivados" ? (
            <Link href="/admin/clientes" className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-brand transition hover:bg-neutral-50">
              ← Ver ativos
            </Link>
          ) : (
            <>
              <Link href="/admin/clientes?arquivados=1" className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50">
                Arquivados
              </Link>
              {podeGerir ? (
                <button
                  onClick={() => setNovoAberto(true)}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90"
                >
                  + Novo cliente
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>

      {novoAberto ? <NovoClienteModal onFechar={() => setNovoAberto(false)} /> : null}

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

// Modal de cadastro de um novo cliente (titular). Cria so o titular; o contrato
// vem depois. Ao criar, navega direto para o Caso 360 do novo cliente.
function NovoClienteModal({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Informe o nome completo.");
      return;
    }
    if (cpf.replace(/\D/g, "").length !== 11) {
      setErro("Informe um CPF com 11 dígitos.");
      return;
    }
    setSalvando(true);
    try {
      const resp = await fetch("/api/admin/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: nome,
          cpf,
          email: email || null,
          telefone: telefone || null,
          data_inicio: dataInicio || null,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json.erro || "Não foi possível criar o cliente.");
      } else if (json.titularId) {
        router.push(`/admin/clientes/${json.titularId}`);
      } else {
        onFechar();
        router.refresh();
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !salvando && onFechar()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-serif text-lg text-brand">Novo cliente</h3>
          <button onClick={onFechar} className="text-sm text-neutral-400 hover:text-neutral-600">Fechar</button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Cadastro do titular (responsável). O contrato e as parcelas são adicionados depois, no cadastro do cliente.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Nome completo</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">CPF</span>
              <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Início do programa (opcional)</span>
              <input value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} type="date" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">E-mail (opcional — canal de acesso do cliente)</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="cliente@email.com" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Telefone (opcional)</span>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(11) 99999-9999" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onFechar} disabled={salvando} className="rounded-xl px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="rounded-xl bg-brand px-5 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-50">
            {salvando ? "Criando..." : "Criar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
