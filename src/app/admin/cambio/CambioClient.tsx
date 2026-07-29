"use client";

import { useState } from "react";

// Formulario para a equipe informar manualmente o cambio comercial do dia
// para moedas sem fonte automatica confiavel (ex.: NZD). A autenticacao e
// feita pelo cookie de sessao de admin (login em /admin/login); a rota
// /api/admin/cambio-manual aceita esse cookie, entao nao ha mais senha aqui.
export default function CambioClient() {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moeda, cambioComercial }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setResultado(`Erro: ${json.erro || "falha desconhecida"}`);
      } else {
        setResultado(
          `Salvo com sucesso! ${json.moeda} em ${json.data}: câmbio comercial informado R$ ${json.cambioComercial}, cotação VET calculada R$ ${json.cotacaoVet}`
        );
      }
    } catch (err: any) {
      setResultado(`Erro: ${err?.message || err}`);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-serif text-2xl text-brand">Câmbio manual (fallback)</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Use esta tela apenas para moedas sem fonte automática confiável (ex.: NZD). Informe o
        câmbio comercial do dia (cotação de referência vista em um site de confiança); o sistema
        aplica automaticamente o spread e o IOF, como faz para as demais moedas.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="text-sm font-medium text-brand">
          Moeda
          <input
            type="text"
            value={moeda}
            onChange={(e) => setMoeda(e.target.value.toUpperCase())}
            required
            className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-brand">
          Câmbio comercial do dia (em BRL)
          <input
            type="number"
            step="0.000001"
            value={cambioComercial}
            onChange={(e) => setCambioComercial(e.target.value)}
            required
            className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={carregando}
          className="mt-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60"
        >
          {carregando ? "Salvando..." : "Salvar cotação do dia"}
        </button>
      </form>

      {resultado ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{resultado}</p>
      ) : null}
    </div>
  );
}
