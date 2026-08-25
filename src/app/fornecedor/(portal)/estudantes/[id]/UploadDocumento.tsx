"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { TIPOS_DOCUMENTO } from "@/lib/documentos";

// Formulario de envio de documento pela escola (Portal do Parceiro). Posta
// multipart para /api/fornecedor/documentos/upload (que reconfere a posse do
// contrato) e atualiza a lista ao concluir.
export default function UploadDocumento({ contratoId }: { contratoId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tipo, setTipo] = useState(TIPOS_DOCUMENTO[0].valor);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  async function enviar() {
    if (!arquivo) {
      setMsg({ tipo: "erro", texto: "Selecione um arquivo (PDF, JPG, PNG ou WEBP)." });
      return;
    }
    setEnviando(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("contratoId", contratoId);
      fd.append("tipoDocumento", tipo);
      fd.append("arquivo", arquivo);
      const res = await fetch("/api/fornecedor/documentos/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.error || "Falha ao enviar o documento." });
      } else {
        setMsg({ tipo: "ok", texto: "Documento enviado." });
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid #f0e9da", paddingTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#042f1b", marginBottom: 8 }}>
        Enviar um documento
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ border: "1px solid #d8ccb4", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" }}
        >
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13 }}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          style={{
            background: "#042f1b",
            color: "#f5ead9",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            cursor: enviando ? "default" : "pointer",
            opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {msg ? (
        <p style={{ marginTop: 8, fontSize: 12, color: msg.tipo === "ok" ? "#15803d" : "#b91c1c" }}>
          {msg.texto}
        </p>
      ) : null}
    </div>
  );
}
