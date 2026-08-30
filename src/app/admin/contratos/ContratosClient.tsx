"use client";

import { useState } from "react";
import type { ContratoLista } from "./page";
import { fmtMoeda } from "@/lib/formato";
import { TIPOS_CANCELAMENTO, rotuloTipoCancelamento } from "@/lib/cancelamento";

const STATUS_BADGE: Record<string, string> = {
  rascunho: "bg-neutral-100 text-neutral-600",
  enviado: "bg-amber-100 text-amber-800",
  em_andamento: "bg-amber-100 text-amber-800",
  assinado: "bg-brand/10 text-brand",
  recusado: "bg-red-100 text-red-700",
  expirado: "bg-red-100 text-red-700",
};

export default function ContratosClient({
  contratos,
  templateConfigurado,
}: {
  contratos: ContratoLista[];
  templateConfigurado: boolean;
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

      {!templateConfigurado ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          O envio para assinatura está desativado: falta configurar o template no ambiente
          (<code>ZOHO_SIGN_TEMPLATE_ID</code> e <code>ZOHO_SIGN_ACTION_CONTRATANTE</code>).
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Cliente / Estudante</th>
              <th className="px-4 py-3 font-medium">Programa</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Assinatura</th>
              <th className="px-4 py-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => {
              const st = c.assinatura_status;
              const jaEnviado = st === "enviado" || st === "em_andamento" || st === "assinado";
              return (
                <tr key={c.id} className={`border-b border-neutral-100 last:border-0 align-top ${c.cancelado_em ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand">{c.titular_nome || "(sem nome)"}</div>
                    <div className="text-xs text-neutral-400">{c.estudante_nome || "—"}</div>
                    {!c.titular_email ? (
                      <div className="text-xs text-red-600">titular sem e-mail</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div>{c.nome || "—"}</div>
                    <div className="text-xs text-neutral-400">{c.pais_destino || "—"}</div>
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
                        <button
                          type="button"
                          onClick={() => reativar(c.id)}
                          disabled={salvando}
                          className="rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
                        >
                          Reativar
                        </button>
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
                        <button
                          type="button"
                          onClick={() => enviar(c.id)}
                          disabled={!templateConfigurado || !c.titular_email || enviandoId === c.id}
                          title={!c.titular_email ? "Titular sem e-mail" : undefined}
                          className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-50"
                        >
                          {enviandoId === c.id ? "Enviando…" : jaEnviado ? "Reenviar" : "Enviar p/ assinatura"}
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirCancelamento(c.id)}
                          className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-red-600"
                        >
                          Cancelar contrato
                        </button>
                        <a
                          href={`/admin/contratos/${c.id}/reembolso`}
                          className="text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-800"
                        >
                          Reembolso (Anexo I)
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Nenhum contrato encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
