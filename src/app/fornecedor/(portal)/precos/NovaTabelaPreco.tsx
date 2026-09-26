"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/fornecedor-i18n";

// Cria uma tabela de preco em branco (sem PDF/IA) e leva para o mesmo editor
// (PriceListEditor) usado no rascunho extraido do PDF, onde a escola monta os
// programas/acomodacoes/taxas do zero.
export default function NovaTabelaPreco({ language }: { language: string }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const T = t(language, {
    pt: {
      botao: "+ Nova tabela de preço",
      criando: "Criando…",
      falha: "Falha ao criar a tabela de preço.",
      erroRede: "Erro de rede. Tente novamente.",
    },
    en: {
      botao: "+ New price table",
      criando: "Creating…",
      falha: "Failed to create the price table.",
      erroRede: "Connection error. Please try again.",
    },
  });

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const res = await fetch("/api/fornecedor/price-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar_manual" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || T.falha);
        return;
      }
      router.push(`/fornecedor/precos/${json.id}`);
    } catch {
      setErro(T.erroRede);
    } finally {
      setCriando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={criar}
        disabled={criando}
        style={{
          background: "#fff",
          color: "var(--p-accent-ink)",
          border: "1px solid var(--p-line)",
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: criando ? "default" : "pointer",
          opacity: criando ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {criando ? T.criando : T.botao}
      </button>
      {erro ? <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{erro}</p> : null}
    </div>
  );
}
