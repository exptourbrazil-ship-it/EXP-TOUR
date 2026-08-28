"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONFIRM_KINDS,
  CONFIRM_KIND_LABEL,
  CONFIRM_STATUS_LABEL,
  type ConfirmKind,
  type ConfirmStatus,
} from "@/lib/confirmacao-disponibilidade";

type ContratoOpc = { id: string; estudanteNome: string | null; supplierId: string };
type Confirmacao = {
  id: string;
  contratoId: string | null;
  kind: string;
  message: string | null;
  status: string;
  responseNote: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string | null;
};

const COR_STATUS: Record<ConfirmStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-700",
};

// Envio (alerta 5) e historico dos pedidos de confirmacao de disponibilidade,
// na aba Acoes do Caso 360. So contratos COM fornecedor vinculado podem receber
// o pedido (o e-mail vai para a escola). Publica o pedido e dispara o e-mail.
export default function ConfirmacaoAdmin({
  contratos,
  confirmacoes,
}: {
  contratos: ContratoOpc[];
  confirmacoes: Confirmacao[];
}) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(contratos[0]?.id ?? "");
  const [kind, setKind] = useState("vaga" as ConfirmKind);
  const [message, setMessage] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  async function enviar() {
    const contrato = contratos.find((c) => c.id === contratoId);
    if (!contrato) {
      setMsg({ tipo: "erro", texto: "Selecione um estudante com fornecedor vinculado." });
      return;
    }
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/confirmacao-disponibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: contrato.supplierId, contratoId, kind, message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.erro || "Falha ao enviar o pedido." });
      } else {
        const aviso = json.semDestinatario
          ? " (a escola não tem usuário ativo para receber o e-mail — ela vê o pedido ao entrar no portal)"
          : ` Enviado para ${json.emailEnviados} contato(s) da escola.`;
        setMsg({ tipo: "ok", texto: `Pedido registrado.${aviso}` });
        setMessage("");
        router.refresh();
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Confirmação de disponibilidade</h2>
      <p className="mb-3 text-sm text-neutral-600">
        Peça à escola para confirmar vaga, adiamento ou alteração. Ela responde no portal e a resposta
        fica registrada aqui.
      </p>

      {contratos.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum contrato deste cliente está vinculado a um fornecedor. Vincule o fornecedor para
          poder solicitar confirmação.
        </p>
      ) : (
        <>
          {msg ? (
            <div
              className={`mb-3 rounded-lg border p-2.5 text-sm ${
                msg.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {msg.texto}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.estudanteNome || "(estudante)"}
                </option>
              ))}
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ConfirmKind)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              {CONFIRM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONFIRM_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensagem (opcional)"
              className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={ocupado}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {ocupado ? "Enviando…" : "Solicitar confirmação"}
            </button>
          </div>
        </>
      )}

      {confirmacoes.length > 0 ? (
        <ul className="divide-y divide-neutral-100">
          {confirmacoes.map((c) => (
            <li key={c.id} className="py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-brand">
                  {CONFIRM_KIND_LABEL[c.kind as ConfirmKind] || c.kind}
                  {c.message ? <span className="text-neutral-500"> — {c.message}</span> : null}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${COR_STATUS[c.status as ConfirmStatus] || "bg-neutral-100 text-neutral-600"}`}>
                  {CONFIRM_STATUS_LABEL[c.status as ConfirmStatus] || c.status}
                </span>
              </div>
              {c.status !== "pending" ? (
                <div className="mt-0.5 text-xs text-neutral-500">
                  {c.respondedBy ? `Resposta de ${c.respondedBy}` : "Respondido"}
                  {c.responseNote ? `: ${c.responseNote}` : ""}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
