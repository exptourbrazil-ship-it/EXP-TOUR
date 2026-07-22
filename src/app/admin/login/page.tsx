"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tela de login do administrador. As credenciais (ADMIN_USER / ADMIN_PASSWORD)
// ficam apenas nas variaveis de ambiente da Vercel. Ao autenticar, a rota
// /api/admin/login cria um cookie de sessao httpOnly (12h) e o staff e
// redirecionado para o painel.
export default function AdminLoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Nao foi possivel entrar.");
        setEntrando(false);
        return;
      }
      const destino = new URLSearchParams(window.location.search).get("next") || "/admin/data-inicio";
      router.replace(destino);
    } catch (err: any) {
      setErro(err?.message || "Erro de rede.");
      setEntrando(false);
    }
  }

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
        onSubmit={handleSubmit}
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
        <p style={{ color: "#042f1b", opacity: 0.7, fontSize: 13, textAlign: "center", marginTop: 0, marginBottom: 20 }}>
          Acesso restrito a equipe EXP Tour
        </p>

        <label style={{ display: "block", color: "#042f1b", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Usuario
        </label>
        <input
          type="text"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          autoComplete="username"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #c9a35e",
            marginBottom: 16,
            boxSizing: "border-box",
            fontSize: 15,
          }}
        />

        <label style={{ display: "block", color: "#042f1b", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Senha
        </label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #c9a35e",
            marginBottom: 16,
            boxSizing: "border-box",
            fontSize: 15,
          }}
        />

        {erro ? (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 0, marginBottom: 12 }}>{erro}</p>
        ) : null}

        <button
          type="submit"
          disabled={entrando}
          style={{
            width: "100%",
            padding: "11px 12px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "#042f1b",
            color: "#f5ead9",
            fontSize: 15,
            fontWeight: 600,
            cursor: entrando ? "default" : "pointer",
            opacity: entrando ? 0.6 : 1,
          }}
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
