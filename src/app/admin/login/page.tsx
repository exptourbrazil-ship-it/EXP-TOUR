"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tela de login do administrador por CÓDIGO enviado ao e-mail.
// Passo 1: o staff clica em "Enviar código" e um código de 6 dígitos é
// enviado para o e-mail administrativo fixo (definido no servidor).
// Passo 2: o staff digita o código; se válido, a rota /api/admin/login/verify
// cria um cookie de sessão httpOnly (12h) e redireciona para o painel.
export default function AdminLoginPage() {
  const router = useRouter();
  const next = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("next") || "/admin/data-inicio") : "/admin/data-inicio";

  const [etapa, setEtapa] = useState("solicitar" as "solicitar" | "codigo");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(null as string | null);
  const [info, setInfo] = useState(null as string | null);
  const [carregando, setCarregando] = useState(false);

  async function solicitarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setInfo(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/login/request", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error || "Não foi possível enviar o código.");
      } else {
        setEtapa("codigo");
        setInfo("Enviamos um código para o e-mail administrativo. Verifique a caixa de entrada.");
      }
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error || "Código inválido ou expirado.");
      } else {
        router.push(next);
        router.refresh();
      }
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #d8ccb4",
    fontSize: 20,
    letterSpacing: 6,
    textAlign: "center" as const,
    boxSizing: "border-box" as const,
    marginBottom: 14,
  };

  const botaoStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "none",
    background: "#042f1b",
    color: "#f5ead9",
    fontSize: 15,
    fontWeight: 600,
    cursor: carregando ? "default" : "pointer",
    opacity: carregando ? 0.7 : 1,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#042f1b",
        padding: 24,
      }}
    >
      <form
        onSubmit={etapa === "solicitar" ? solicitarCodigo : verificarCodigo}
        style={{
          width: "100%",
          maxWidth: 380,
          backgroundColor: "#f5ead9",
          borderRadius: 12,
          padding: 28,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <h1
          style={{
            fontFamily: "Bellefair, serif",
            color: "#042f1b",
            fontSize: 26,
            margin: 0,
            marginBottom: 4,
            textAlign: "center",
          }}
        >
          Painel Administrativo
        </h1>
        <p style={{ color: "#042f1b", opacity: 0.7, fontSize: 13, textAlign: "center", marginTop: 0, marginBottom: 22 }}>
          {etapa === "solicitar"
            ? "Enviaremos um código de acesso ao e-mail administrativo."
            : "Digite o código de 6 dígitos que enviamos por e-mail."}
        </p>

        {etapa === "codigo" ? (
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            style={inputStyle}
          />
        ) : null}

        {erro ? (
          <p style={{ color: "#b91c1c", fontSize: 13, textAlign: "center", margin: "0 0 12px" }}>{erro}</p>
        ) : null}
        {info ? (
          <p style={{ color: "#15803d", fontSize: 13, textAlign: "center", margin: "0 0 12px" }}>{info}</p>
        ) : null}

        <button type="submit" disabled={carregando} style={botaoStyle}>
          {carregando
            ? "Aguarde..."
            : etapa === "solicitar"
            ? "Enviar código"
            : "Entrar"}
        </button>

        {etapa === "codigo" ? (
          <button
            type="button"
            onClick={() => { setEtapa("solicitar"); setCodigo(""); setErro(null); setInfo(null); }}
            style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: "#042f1b", fontSize: 13, textDecoration: "underline", cursor: "pointer" }}
          >
            Reenviar código
          </button>
        ) : null}
      </form>
    </div>
  );
}
