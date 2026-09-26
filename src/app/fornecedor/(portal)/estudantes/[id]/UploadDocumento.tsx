"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { TIPOS_DOCUMENTO } from "@/lib/documentos";
import { t } from "@/lib/fornecedor-i18n";

// Formulario de envio de documento pela escola (Portal do Parceiro). Posta
// multipart para /api/fornecedor/documentos/upload (que reconfere a posse do
// contrato) e atualiza a lista ao concluir.
export default function UploadDocumento({ contratoId, language }: { contratoId: string; language: string }) {
  const T = t(language, {
    pt: {
      selecioneArquivo: "Selecione um arquivo (PDF, JPG, PNG ou WEBP).",
      falhaEnviar: "Falha ao enviar o documento.",
      documentoEnviado: "Documento enviado.",
      erroRede: "Erro de rede. Tente novamente.",
      enviarDocumento: "Enviar um documento",
      enviando: "Enviando…",
      enviar: "Enviar",
    },
    en: {
      selecioneArquivo: "Select a file (PDF, JPG, PNG or WEBP).",
      falhaEnviar: "Failed to send the document.",
      documentoEnviado: "Document sent.",
      erroRede: "Connection error. Please try again.",
      enviarDocumento: "Send a document",
      enviando: "Sending…",
      enviar: "Send",
    },
  });

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tipo, setTipo] = useState(TIPOS_DOCUMENTO[0].valor);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  async function enviar() {
    if (!arquivo) {
      setMsg({ tipo: "erro", texto: T.selecioneArquivo });
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
        setMsg({ tipo: "erro", texto: json.error || T.falhaEnviar });
      } else {
        setMsg({ tipo: "ok", texto: T.documentoEnviado });
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ tipo: "erro", texto: T.erroRede });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--p-line)", paddingTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", marginBottom: 8 }}>
        {T.enviarDocumento}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" }}
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
          {enviando ? T.enviando : T.enviar}
        </button>
      </div>
      {msg ? (
        <p style={{ marginTop: 8, fontSize: 12, color: msg.tipo === "ok" ? "var(--p-success-ink)" : "#b91c1c" }}>
          {msg.texto}
        </p>
      ) : null}
    </div>
  );
}
