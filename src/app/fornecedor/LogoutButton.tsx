"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Botão de sair do Portal do Fornecedor: chama /api/fornecedor/logout (limpa o
// cookie) e volta para o login.
export default function LogoutButton() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/fornecedor/logout", { method: "POST" });
    } catch {
      // ignora: o redirect abaixo leva ao login de qualquer forma
    }
    router.push("/fornecedor/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      style={{
        background: "none",
        // Header-aware: acompanha a marca do tenant (cor do texto do cabecalho).
        border: "1px solid color-mix(in srgb, var(--p-header-fg, #042f1b) 40%, transparent)",
        borderRadius: 8,
        padding: "8px 14px",
        color: "var(--p-header-fg, #042f1b)",
        fontSize: 13,
        cursor: saindo ? "default" : "pointer",
        opacity: saindo ? 0.7 : 1,
      }}
    >
      {saindo ? "Saindo..." : "Sair"}
    </button>
  );
}
