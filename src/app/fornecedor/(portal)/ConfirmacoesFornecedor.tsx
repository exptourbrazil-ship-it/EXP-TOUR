"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONFIRM_KIND_LABEL, type ConfirmKind } from "@/lib/confirmacao-disponibilidade";

type Confirmacao = {
  id: string;
  contratoId: string | null;
  estudanteNome: string | null;
  kind: ConfirmKind;
  message: string | null;
  createdAt: string | null;
};

// Pedidos de confirmacao de disponibilidade pendentes (alerta 5). A escola
// aceita/recusa aqui; cada resposta chama a rota e recarrega.
export default function ConfirmacoesFornecedor({ pedidos }: { pedidos: Confirmacao[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [notaPor, setNotaPor] = useState({} as Record<string, string>);
  const [erro, setErro] = useState(null as string | null);

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
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao responder.");
      else router.refresh();
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  if (pedidos.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 10px" }}>
        Confirmações pendentes
      </h2>
      {erro ? <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{erro}</p> : null}
      <div style={{ display: "grid", gap: 10 }}>
        {pedidos.map((p) => (
          <div
            key={p.id}
            style={{ border: "1px solid var(--p-line)", borderLeft: "4px solid var(--p-accent)", borderRadius: 10, background: "#fff", padding: 14 }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--p-ink)" }}>
              {CONFIRM_KIND_LABEL[p.kind]}
              {p.estudanteNome ? ` · ${p.estudanteNome}` : ""}
            </div>
            {p.message ? <div style={{ fontSize: 13, color: "var(--p-muted)", marginTop: 4 }}>{p.message}</div> : null}
            <input
              value={notaPor[p.id] || ""}
              onChange={(e) => setNotaPor((s) => ({ ...s, [p.id]: e.target.value }))}
              placeholder="Observação (opcional)"
              style={{ marginTop: 8, width: "100%", maxWidth: 420, border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => responder(p.id, "accepted")}
                disabled={ocupado}
                style={{ background: "var(--p-success-ink)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }}
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => responder(p.id, "declined")}
                disabled={ocupado}
                style={{ background: "#fff", color: "#b91c1c", border: "1px solid #f0c9c9", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }}
              >
                Recusar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
