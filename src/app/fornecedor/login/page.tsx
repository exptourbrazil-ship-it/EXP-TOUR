"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/fornecedor-i18n";

// Tela de login do Portal do Fornecedor por CÓDIGO enviado ao e-mail (mesmo
// mecanismo do admin). Passo 1: informa o e-mail e recebe um código de 6
// dígitos. Passo 2: digita o código; se válido, /api/fornecedor/login/verify
// abre a sessão (cookie httpOnly 12h) e redireciona para o portal.
//
// Bilíngue com toggle manual: antes do login ainda não há sessão (nem
// supplier_user.language), então o idioma não pode vir do banco aqui — a
// pessoa escolhe pt/en nesta tela mesmo (estado local, sem persistência).
export default function FornecedorLoginPage() {
  const router = useRouter();
  const next =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("next") || "/fornecedor"
      : "/fornecedor";

  const [idioma, setIdioma] = useState("pt" as "pt" | "en");
  const [etapa, setEtapa] = useState("solicitar" as "solicitar" | "codigo");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(null as string | null);
  const [info, setInfo] = useState(null as string | null);
  const [carregando, setCarregando] = useState(false);

  const T = t(idioma, {
    pt: {
      titulo: "Portal do Parceiro",
      subtituloSolicitar: "Informe o e-mail cadastrado para receber um código de acesso.",
      subtituloCodigo: "Digite o código de 6 dígitos que enviamos por e-mail.",
      emailPlaceholder: "seu.email@escola.com",
      enviarCodigoErro: "Não foi possível enviar o código.",
      codigoEnviadoInfo: "Se este e-mail estiver cadastrado, enviamos um código. Verifique a caixa de entrada.",
      codigoInvalidoErro: "Código inválido ou expirado.",
      erroRede: "Erro de rede. Tente novamente.",
      aguarde: "Aguarde...",
      enviarCodigo: "Enviar código",
      entrar: "Entrar",
      reenviarCodigo: "Reenviar código",
    },
    en: {
      titulo: "Partner Portal",
      subtituloSolicitar: "Enter your registered email to receive an access code.",
      subtituloCodigo: "Enter the 6-digit code we sent to your email.",
      emailPlaceholder: "you.email@school.com",
      enviarCodigoErro: "Could not send the code.",
      codigoEnviadoInfo: "If this email is registered, we've sent a code. Check your inbox.",
      codigoInvalidoErro: "Invalid or expired code.",
      erroRede: "Network error. Please try again.",
      aguarde: "Please wait...",
      enviarCodigo: "Send code",
      entrar: "Sign in",
      reenviarCodigo: "Resend code",
    },
  });

  async function solicitarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setInfo(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/fornecedor/login/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error || T.enviarCodigoErro);
      } else {
        setEtapa("codigo");
        setInfo(T.codigoEnviadoInfo);
      }
    } catch {
      setErro(T.erroRede);
    } finally {
      setCarregando(false);
    }
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/fornecedor/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error || T.codigoInvalidoErro);
      } else {
        router.push(next);
        router.refresh();
      }
    } catch {
      setErro(T.erroRede);
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

  const emailInputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #d8ccb4",
    fontSize: 15,
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
          {(["pt", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setIdioma(l)}
              style={{
                border: "1px solid #d8ccb4",
                background: idioma === l ? "#042f1b" : "transparent",
                color: idioma === l ? "#f5ead9" : "#042f1b",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
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
          {T.titulo}
        </h1>
        <p style={{ color: "#042f1b", opacity: 0.7, fontSize: 13, textAlign: "center", marginTop: 0, marginBottom: 22 }}>
          {etapa === "solicitar" ? T.subtituloSolicitar : T.subtituloCodigo}
        </p>

        {etapa === "solicitar" ? (
          <input
            type="email"
            autoFocus
            autoComplete="email"
            placeholder={T.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={emailInputStyle}
          />
        ) : null}

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
          {carregando ? T.aguarde : etapa === "solicitar" ? T.enviarCodigo : T.entrar}
        </button>

        {etapa === "codigo" ? (
          <button
            type="button"
            onClick={() => {
              setEtapa("solicitar");
              setCodigo("");
              setErro(null);
              setInfo(null);
            }}
            style={{
              width: "100%",
              marginTop: 12,
              background: "none",
              border: "none",
              color: "#042f1b",
              fontSize: 13,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {T.reenviarCodigo}
          </button>
        ) : null}
      </form>
    </div>
  );
}
