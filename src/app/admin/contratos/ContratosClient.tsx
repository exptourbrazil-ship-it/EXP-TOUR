"use client";

import { useState } from "react";
import type { ContratoLista } from "./page";
import { fmtMoeda } from "@/lib/formato";

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
                <tr key={c.id} className="border-b border-neutral-100 last:border-0 align-top">
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
                    <button
                      type="button"
                      onClick={() => enviar(c.id)}
                      disabled={!templateConfigurado || !c.titular_email || enviandoId === c.id}
                      title={!c.titular_email ? "Titular sem e-mail" : undefined}
                      className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-50"
                    >
                      {enviandoId === c.id ? "Enviando…" : jaEnviado ? "Reenviar" : "Enviar p/ assinatura"}
                    </button>
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
