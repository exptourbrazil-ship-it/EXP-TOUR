"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ContratoLista } from "./page";
import { fmtMoeda, fmtPorMoeda } from "@/lib/formato";
import { normalizarBusca } from "@/lib/clientes";
import { resumoContratos } from "@/lib/contratos";
import { TIPOS_CANCELAMENTO, rotuloTipoCancelamento } from "@/lib/cancelamento";

const STATUS_BADGE: Record<string, string> = {
  rascunho: "bg-neutral-100 text-neutral-600",
  enviado: "bg-amber-100 text-amber-800",
  em_andamento: "bg-amber-100 text-amber-800",
  assinado: "bg-brand/10 text-brand",
  recusado: "bg-red-100 text-red-700",
  expirado: "bg-red-100 text-red-700",
};

// Cores do estado da máquina (P1). Neutro/azul = em andamento; dourado = próxima
// ação; verde = operação/concluído; vermelho só para cancelado.
const ESTADO_BADGE: Record<string, string> = {
  proposta_enviada: "bg-neutral-100 text-neutral-700",
  entrada_paga: "bg-sky-100 text-sky-800",
  aguardando_contrato: "bg-brand-gold/20 text-brand-golddark",
  matricula: "bg-sky-100 text-sky-800",
  documentacao: "bg-sky-100 text-sky-800",
  visto: "bg-brand-gold/20 text-brand-golddark",
  pre_embarque: "bg-brand-gold/20 text-brand-golddark",
  em_programa: "bg-emerald-100 text-emerald-800",
  retorno: "bg-emerald-100 text-emerald-800",
  concluido: "bg-emerald-600 text-white",
  proposta_expirada: "bg-neutral-200 text-neutral-600",
  cancelado: "bg-red-100 text-red-700",
};

type Situacao = "todos" | "ativos" | "cancelados";
type Ordem = "padrao" | "cliente" | "valor";
type Dir = "asc" | "desc";

export type PermissoesContratos = {
  enviarAssinatura: boolean;
  cancelar: boolean;
};

export default function ContratosClient({
  contratos,
  templateConfigurado,
  permissoes,
}: {
  contratos: ContratoLista[];
  templateConfigurado: boolean;
  permissoes: PermissoesContratos;
}) {
  const [linhas, setLinhas] = useState<ContratoLista[]>(contratos);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; texto: string; erro: boolean } | null>(null);
  // Formulario de cancelamento aberto para um contrato especifico.
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [tipo, setTipo] = useState(TIPOS_CANCELAMENTO[0].valor as string);
  const [motivo, setMotivo] = useState("");
  const [dataEfetiva, setDataEfetiva] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Busca / filtros / ordenacao (client-side sobre a lista carregada).
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [assinaturaFiltro, setAssinaturaFiltro] = useState("todas");
  const [ordem, setOrdem] = useState<Ordem>("padrao");
  const [dir, setDir] = useState<Dir>("asc");

  // Resumo de topo sobre o estado ATUAL (reflete cancelamentos feitos na tela).
  const resumo = useMemo(() => resumoContratos(linhas), [linhas]);

  // Status de assinatura distintos presentes, para o filtro.
  const statusPresentes = useMemo(
    () => Array.from(new Set(linhas.map((c) => c.assinatura_status).filter(Boolean) as string[])).sort(),
    [linhas]
  );

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    const base = linhas.filter((c) => {
      if (situacao === "ativos" && c.cancelado_em) return false;
      if (situacao === "cancelados" && !c.cancelado_em) return false;
      if (assinaturaFiltro !== "todas") {
        if (assinaturaFiltro === "sem" ? !!c.assinatura_status : c.assinatura_status !== assinaturaFiltro) {
          return false;
        }
      }
      if (termo) {
        const alvo = normalizarBusca(
          [c.titular_nome, c.estudante_nome, c.nome, c.pais_destino].filter(Boolean).join(" ")
        );
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });

    if (ordem === "padrao") return base; // ordem do servidor (created_at desc)
    const fator = dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (ordem === "cliente") cmp = (a.titular_nome || "").localeCompare(b.titular_nome || "", "pt-BR");
      else if (ordem === "valor") cmp = (Number(a.valor_total) || 0) - (Number(b.valor_total) || 0);
      if (cmp === 0) cmp = (a.titular_nome || "").localeCompare(b.titular_nome || "", "pt-BR");
      return cmp * fator;
    });
  }, [linhas, busca, situacao, assinaturaFiltro, ordem, dir]);

  function ordenarPor(col: Ordem) {
    if (col === "padrao") {
      setOrdem("padrao");
      return;
    }
    if (ordem === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setOrdem(col);
      setDir(col === "cliente" ? "asc" : "desc");
    }
  }

  function abrirCancelamento(id: string) {
    setCancelando(id);
    setTipo(TIPOS_CANCELAMENTO[0].valor);
    setMotivo("");
    setDataEfetiva("");
    setMsg(null);
  }

  async function confirmarCancelamento(id: string) {
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/contratos/${id}/cancelar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, motivo, dataEfetiva: dataEfetiva || undefined }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setLinhas((ls) =>
          ls.map((c) =>
            c.id === id
              ? { ...c, cancelado_em: json.canceladoEm, cancelado_tipo: tipo, cancelado_motivo: motivo }
              : c
          )
        );
        setCancelando(null);
        setMsg({ id, texto: "Contrato cancelado. A régua de cobrança não envia mais.", erro: false });
      } else {
        setMsg({ id, texto: json.erro || "Falha ao cancelar.", erro: true });
      }
    } catch (e: any) {
      setMsg({ id, texto: e?.message || "Erro de rede.", erro: true });
    } finally {
      setSalvando(false);
    }
  }

  async function reativar(id: string) {
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/contratos/${id}/cancelar`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setLinhas((ls) =>
          ls.map((c) =>
            c.id === id ? { ...c, cancelado_em: null, cancelado_tipo: null, cancelado_motivo: null } : c
          )
        );
        setMsg({ id, texto: "Contrato reativado.", erro: false });
      } else {
        setMsg({ id, texto: json.erro || "Falha ao reativar.", erro: true });
      }
    } catch (e: any) {
      setMsg({ id, texto: e?.message || "Erro de rede.", erro: true });
    } finally {
      setSalvando(false);
    }
  }

  async function enviar(id: string) {
    setEnviandoId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/contratos/${id}/enviar-assinatura`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setLinhas((ls) => ls.map((c) => (c.id === id ? { ...c, assinatura_status: "enviado" } : c)));
        setMsg({ id, texto: "Enviado para assinatura.", erro: false });
      } else {
        setMsg({ id, texto: json.erro || "Falha ao enviar.", erro: true });
      }
    } catch (e: any) {
      setMsg({ id, texto: e?.message || "Erro de rede.", erro: true });
    } finally {
      setEnviandoId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Contratos</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Envie o contrato para assinatura eletrônica (Zoho Sign) e acompanhe o status.
        </p>
      </header>

      {/* Indicadores de topo */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Contratos" valor={String(resumo.total)} legenda="no total" />
        <CardIndicador titulo="Ativos" valor={String(resumo.ativos)} legenda="não cancelados" />
        <CardIndicador
          titulo="Cancelados"
          valor={String(resumo.cancelados)}
          legenda="fora da régua"
          tom={resumo.cancelados > 0 ? "atencao" : undefined}
        />
        <CardIndicador
          titulo="Valor (ativos)"
          valor={Object.keys(resumo.valorPorMoeda).length > 0 ? fmtPorMoeda(resumo.valorPorMoeda) : "—"}
          legenda="soma por moeda"
        />
      </div>

      {/* Quebra por status de assinatura (contratos ativos) */}
      {Object.keys(resumo.porStatusAssinatura).length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span className="font-medium text-neutral-400">Assinatura (ativos):</span>
          {Object.entries(resumo.porStatusAssinatura)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([st, n]) => (
              <span key={st}>
                {st === "sem" ? "sem assinatura" : st}: <span className="font-medium text-brand">{n}</span>
              </span>
            ))}
        </div>
      ) : null}

      {!templateConfigurado ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          O envio para assinatura está desativado: falta configurar o template no ambiente
          (<code>ZOHO_SIGN_TEMPLATE_ID</code> e <code>ZOHO_SIGN_ACTION_CONTRATANTE</code>).
        </p>
      ) : null}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Buscar (cliente, estudante, programa)</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: Maria, Canadá…"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Situação</span>
          <select
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as Situacao)}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="cancelados">Cancelados</option>
          </select>
        </label>
        {statusPresentes.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Assinatura</span>
            <select
              value={assinaturaFiltro}
              onChange={(e) => setAssinaturaFiltro(e.target.value)}
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="todas">Todas</option>
              {statusPresentes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="sem">sem assinatura</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <ThOrdenavel rotulo="Cliente / Estudante" col="cliente" ordem={ordem} dir={dir} onClick={ordenarPor} />
              <th className="px-4 py-3 font-medium">Programa</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <ThOrdenavel rotulo="Valor" col="valor" ordem={ordem} dir={dir} onClick={ordenarPor} alinhar="right" />
              <th className="px-4 py-3 font-medium">Assinatura</th>
              <th className="px-4 py-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => {
              const st = c.assinatura_status;
              const jaEnviado = st === "enviado" || st === "em_andamento" || st === "assinado";
              return (
                <tr key={c.id} className={`border-b border-neutral-100 last:border-0 align-top ${c.cancelado_em ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand">
                      {c.titular_id ? (
                        <Link href={`/admin/clientes/${c.titular_id}`} className="hover:underline">
                          {c.titular_nome || "(sem nome)"}
                        </Link>
                      ) : (
                        c.titular_nome || "(sem nome)"
                      )}
                    </div>
                    <div className="text-xs text-neutral-400">{c.estudante_nome || "—"}</div>
                    {!c.titular_email ? (
                      <div className="text-xs text-red-600">titular sem e-mail</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div>{c.nome || "—"}</div>
                    <div className="text-xs text-neutral-400">{c.pais_destino || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {c.estado ? (
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_BADGE[c.estado] || "bg-neutral-100 text-neutral-600"}`}>
                        {c.estado_rotulo || c.estado}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-brand">
                    {c.valor_total != null ? fmtMoeda(Number(c.valor_total) || 0, c.moeda || "?") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {st ? (
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[st] || "bg-neutral-100 text-neutral-600"}`}>
                        {st}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                    {msg && msg.id === c.id ? (
                      <div className={`mt-1 text-xs ${msg.erro ? "text-red-600" : "text-brand"}`}>{msg.texto}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {c.cancelado_em ? (
                      <div className="space-y-1">
                        <div className="text-xs text-neutral-500">
                          {/* timeZone UTC de proposito: a data de cancelamento e data
                              CIVIL, nao instante. Sem isto, quem registrava 31/07 via
                              30/07 na tela — o valor e gravado a meia-noite UTC e o
                              navegador convertia para o fuso local (UTC-7). Um dia de
                              diferenca muda a contagem dos 7 dias do arrependimento. */}
                          {rotuloTipoCancelamento(c.cancelado_tipo)} em{" "}
                          {new Date(c.cancelado_em).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                        </div>
                        {c.cancelado_motivo ? (
                          <div className="text-xs text-neutral-400">{c.cancelado_motivo}</div>
                        ) : null}
                        {permissoes.cancelar ? (
                          <button
                            type="button"
                            onClick={() => reativar(c.id)}
                            disabled={salvando}
                            className="rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
                          >
                            Reativar
                          </button>
                        ) : null}
                      </div>
                    ) : cancelando === c.id ? (
                      <div className="w-64 space-y-2">
                        <select
                          value={tipo}
                          onChange={(e) => setTipo(e.target.value)}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
                        >
                          {TIPOS_CANCELAMENTO.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.rotulo}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Motivo (fica no histórico)"
                          className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
                        />
                        <label className="block text-[11px] text-neutral-500">
                          Data em que o cliente comunicou (opcional)
                          <input
                            type="date"
                            value={dataEfetiva}
                            onChange={(e) => setDataEfetiva(e.target.value)}
                            max={new Date().toISOString().slice(0, 10)}
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => confirmarCancelamento(c.id)}
                            disabled={salvando || motivo.trim().length < 3}
                            className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                          >
                            {salvando ? "Cancelando…" : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelando(null)}
                            className="rounded-xl border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600"
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {permissoes.enviarAssinatura ? (
                          <button
                            type="button"
                            onClick={() => enviar(c.id)}
                            disabled={!templateConfigurado || !c.titular_email || enviandoId === c.id}
                            title={!c.titular_email ? "Titular sem e-mail" : undefined}
                            className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-50"
                          >
                            {enviandoId === c.id ? "Enviando…" : jaEnviado ? "Reenviar" : "Enviar p/ assinatura"}
                          </button>
                        ) : null}
                        {permissoes.cancelar ? (
                          <button
                            type="button"
                            onClick={() => abrirCancelamento(c.id)}
                            className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-red-600"
                          >
                            Cancelar contrato
                          </button>
                        ) : null}
                        {permissoes.cancelar ? (
                          <a
                            href={`/admin/contratos/${c.id}/reembolso`}
                            className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-800"
                          >
                            Reembolso (Anexo I)
                          </a>
                        ) : null}
                        {!permissoes.enviarAssinatura && !permissoes.cancelar ? (
                          <span className="text-xs text-neutral-400">sem ações para seu papel</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Nenhum contrato para os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        {filtradas.length} de {linhas.length} contrato(s).
      </p>
    </div>
  );
}

function ThOrdenavel({
  rotulo,
  col,
  ordem,
  dir,
  onClick,
  alinhar,
}: {
  rotulo: string;
  col: Ordem;
  ordem: Ordem;
  dir: Dir;
  onClick: (col: Ordem) => void;
  alinhar?: "right";
}) {
  const ativo = ordem === col;
  return (
    <th className={`px-4 py-3 font-medium ${alinhar === "right" ? "text-right" : ""}`}>
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
