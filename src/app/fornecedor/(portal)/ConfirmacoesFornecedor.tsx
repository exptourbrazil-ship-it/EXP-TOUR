"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmKind } from "@/lib/confirmacao-disponibilidade";
import { t } from "@/lib/fornecedor-i18n";

type Confirmacao = {
  id: string;
  contratoId: string | null;
  estudanteNome: string | null;
  kind: ConfirmKind;
  message: string | null;
  createdAt: string | null;
};

// Rotulo do motivo do pedido (kind), bilingue. O motor puro
// (confirmacao-disponibilidade.ts) so expoe CONFIRM_KIND_LABEL em PT — e usado
// tambem pelo admin (que fica so em PT) — entao esta tela do fornecedor
// mantem seu proprio par pt/en em vez de tocar no motor compartilhado.
const KIND_LABEL: Record<ConfirmKind, { pt: string; en: string }> = {
  vaga: { pt: "Checagem de vaga", en: "Availability check" },
  adiamento: { pt: "Adiamento", en: "Postponement" },
  alteracao: { pt: "Alteração", en: "Change" },
};

// Pedidos de confirmacao de disponibilidade pendentes (alerta 5). A escola
// aceita/recusa aqui; cada resposta chama a rota e recarrega.
export default function ConfirmacoesFornecedor({ pedidos, language }: { pedidos: Confirmacao[]; language?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [notaPor, setNotaPor] = useState({} as Record<string, string>);
  const [erro, setErro] = useState(null as string | null);

  const T = t(language, {
    pt: {
      titulo: "Confirmações pendentes",
      falhaResponder: "Falha ao responder.",
      erroRede: "Erro de rede. Tente novamente.",
      observacao: "Observação (opcional)",
      confirmar: "Confirmar",
      recusar: "Recusar",
    },
    en: {
      titulo: "Pending confirmations",
      falhaResponder: "Could not respond.",
      erroRede: "Network error. Please try again.",
      observacao: "Note (optional)",
      confirmar: "Confirm",
      recusar: "Decline",
    },
  });

  async function responder(id: string, status: "accepted" | "declined") {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/fornecedor/confirmacao-disponibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, note: notaPor[id] || "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) setErro(json.erro || T.falhaResponder);
      else router.refresh();
    } catch {
      setErro(T.erroRede);
    } finally {
      setOcupado(false);
    }
  }

  if (pedidos.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 10px" }}>
        {T.titulo}
      </h2>
      {erro ? <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{erro}</p> : null}
      <div style={{ display: "grid", gap: 10 }}>
        {pedidos.map((p) => (
          <div
            key={p.id}
            style={{ border: "1px solid var(--p-line)", borderLeft: "4px solid var(--p-accent)", borderRadius: 10, background: "#fff", padding: 14 }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--p-ink)" }}>
              {language === "pt" ? KIND_LABEL[p.kind].pt : KIND_LABEL[p.kind].en}
              {p.estudanteNome ? ` · ${p.estudanteNome}` : ""}
            </div>
            {p.message ? <div style={{ fontSize: 13, color: "var(--p-muted)", marginTop: 4 }}>{p.message}</div> : null}
            <input
              value={notaPor[p.id] || ""}
              onChange={(e) => setNotaPor((s) => ({ ...s, [p.id]: e.target.value }))}
              placeholder={T.observacao}
              style={{ marginTop: 8, width: "100%", maxWidth: 420, border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => responder(p.id, "accepted")}
                disabled={ocupado}
                style={{ background: "var(--p-success-ink)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }}
              >
                {T.confirmar}
              </button>
              <button
                type="button"
                onClick={() => responder(p.id, "declined")}
                disabled={ocupado}
                style={{ background: "#fff", color: "#b91c1c", border: "1px solid #f0c9c9", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }}
              >
                {T.recusar}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
