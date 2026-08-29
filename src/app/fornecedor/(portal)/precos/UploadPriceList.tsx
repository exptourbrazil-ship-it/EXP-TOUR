"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

// Upload do price list (PDF). Envia multipart; ao concluir, leva para a tela de
// revisao do rascunho recem-criado.
export default function UploadPriceList() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  async function enviar() {
    if (!arquivo) {
      setMsg({ tipo: "erro", texto: "Selecione o PDF do price list." });
      return;
    }
    setEnviando(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const res = await fetch("/api/fornecedor/price-list", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.erro || "Falha ao enviar o price list." });
        return;
      }
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      router.push(`/fornecedor/precos/${json.id}`);
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", marginBottom: 8 }}>Enviar price list (PDF)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13 }}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          style={{
            background: "var(--p-cta)",
            color: "var(--p-cta-fg)",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            cursor: enviando ? "default" : "pointer",
            opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? "Enviando e lendo…" : "Enviar e extrair"}
        </button>
      </div>
      {msg ? (
        <p style={{ marginTop: 8, fontSize: 12, color: msg.tipo === "ok" ? "var(--p-success-ink)" : "#b91c1c" }}>{msg.texto}</p>
      ) : null}
    </div>
  );
}
