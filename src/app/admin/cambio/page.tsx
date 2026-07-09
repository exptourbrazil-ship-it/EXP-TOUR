"use client";

import { useState } from "react";

// Pagina interna simples para a equipe da EXP Tour informar manualmente
// o cambio comercial do dia para moedas que nao possuem fonte automatica
// confiavel (por exemplo, o NZD). Protegida por uma senha simples que e
// enviada como Bearer token para a rota /api/admin/cambio-manual.
// Nao ha autenticacao real de staff ainda, entao esta senha deve ser
// tratada como confidencial e compartilhada apenas internamente.

export default function AdminCambioPage() {
  const [senha, setSenha] = useState("");
  const [moeda, setMoeda] = useState("NZD");
  const [cambioComercial, setCambioComercial] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setResultado(null);

    try {
      const res = await fetch("/api/admin/cambio-manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${senha}`,
        },
        body: JSON.stringify({ moeda, cambioComercial }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setResultado(`Erro: ${json.erro || "falha desconhecida"}`);
      } else {
        setResultado(
          `Salvo com sucesso! ${json.moeda} em ${json.data}: cambio comercial informado R$ ${json.cambioComercial}, cotacao VET calculada R$ ${json.cotacaoVet}`
        );
      }
    } catch (err: any) {
      setResultado(`Erro: ${err?.message || err}`);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Cambio manual (fallback)</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 24 }}>
        Use esta pagina apenas para moedas sem fonte automatica confiavel (ex: NZD).
        Informe o cambio comercial do dia (ex: cotacao de referencia vista em um site de
        confianca); o sistema aplicara automaticamente o spread e o IOF, como faz para as
        demais moedas.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Senha de acesso
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          Moeda
          <input
            type="text"
            value={moeda}
            onChange={(e) => setMoeda(e.target.value.toUpperCase())}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          Cambio comercial do dia (em BRL)
          <input
            type="number"
            step="0.000001"
            value={cambioComercial}
            onChange={(e) => setCambioComercial(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <button type="submit" disabled={carregando} style={{ padding: 10, marginTop: 8 }}>
          {carregando ? "Salvando..." : "Salvar cotacao do dia"}
        </button>
      </form>

      {resultado && (
        <p style={{ marginTop: 16, fontSize: 14, whiteSpace: "pre-wrap" }}>{resultado}</p>
      )}
    </main>
  );
}
