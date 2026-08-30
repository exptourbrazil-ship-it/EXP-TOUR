"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReembolsoContrato } from "@/lib/reembolso-service";

// Calculadora de reembolso do Anexo I (admin). Simula (what-if) a retencao
// escalonada + nao recuperaveis sob o teto e mostra a MEMORIA DE CALCULO. Permite
// gravar a etapa concluida como override. Vermelho e permitido no admin.

function brl(moeda: string, n: number): string {
  return `${moeda} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number): string {
  return (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + "%";
}

export default function ReembolsoClient({ inicial }: { inicial: ReembolsoContrato }) {
  const [dados, setDados] = useState<ReembolsoContrato>(inicial);
  const [naoRecuperaveis, setNaoRecuperaveis] = useState("0");
  // "" = automático (derivar dos sinais / limpar override). Começa em automático
  // quando não há override gravado, senão na etapa gravada.
  const [etapa, setEtapa] = useState<string>(inicial.etapaOverride ?? "");
  const [dispensa, setDispensa] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const id = inicial.contratoId;

  const recalcular = useCallback(async () => {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({
        naoRecuperaveis: String(Number(naoRecuperaveis) || 0),
        etapa,
        dispensa: String(dispensa),
      });
      const r = await fetch(`/api/admin/contratos/${id}/reembolso?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setDados(j.dados);
    } finally {
      setCarregando(false);
    }
  }, [id, naoRecuperaveis, etapa, dispensa]);

  useEffect(() => {
    const t = setTimeout(recalcular, 250);
    return () => clearTimeout(t);
  }, [recalcular]);

  async function salvarEtapa() {
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/contratos/${id}/reembolso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: etapa === "" ? null : etapa }),
      });
      const j = await r.json();
      setMsg(j.ok ? (etapa === "" ? "Override limpo — voltou a derivar dos sinais." : "Etapa gravada como override.") : j.error || "Falha ao gravar.");
    } finally {
      setSalvando(false);
    }
  }

  const res = dados.resultado;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Base (tuition)</p>
          <p className="mt-1 text-lg font-semibold">{brl(dados.moeda, dados.tuition)}</p>
          <p className="mt-1 text-[11px] text-amber-700">[a confirmar: curso vs. total]</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Total pago pelo cliente</p>
          <p className="mt-1 text-lg font-semibold">{brl(dados.moeda, dados.totalPago)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Etapa derivada dos sinais</p>
          <p className="mt-1 text-sm font-medium">{dados.etapaDerivada}</p>
          <p className="mt-1 text-[11px] text-neutral-400">
            entrada: {dados.sinais.entradaPaga ? "sim" : "não"} · LOA: {dados.sinais.temLOA ? "sim" : "não"} · visto:{" "}
            {dados.sinais.vistoAprovado ? "sim" : "não"}
          </p>
        </div>
      </div>

      {/* Controles (what-if) */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 md:grid-cols-3">
        <label className="text-sm">
          <span className="text-neutral-600">Etapa concluída</span>
          <select
            value={etapa}
            onChange={(e) => setEtapa(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
          >
            <option value="">Automático — derivar dos sinais ({dados.etapaDerivada})</option>
            {dados.etapas.map((et) => (
              <option key={et.chave} value={et.chave}>
                {et.rotulo} ({pct(et.percentual)})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Valores não recuperáveis ({dados.moeda})</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={naoRecuperaveis}
            onChange={(e) => setNaoRecuperaveis(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" checked={dispensa} onChange={(e) => setDispensa(e.target.checked)} />
          <span className="text-neutral-600">Dispensar retenção (Anexo I.4)</span>
        </label>
      </div>

      {/* Memoria de calculo */}
      <div className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
          <h3 className="text-sm font-semibold text-neutral-800">Memória de cálculo{carregando ? " …" : ""}</h3>
          {res.tetoAtingido ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">teto aplicado</span>
          ) : null}
        </div>
        <dl className="divide-y divide-neutral-100">
          {res.memoria.map((l, i) => (
            <div key={i} className="flex justify-between px-4 py-1.5 text-sm">
              <dt className="text-neutral-600">{l.rotulo}</dt>
              <dd className="font-medium text-neutral-900">
                {l.tipo === "pct" ? pct(l.valor) : brl(dados.moeda, l.valor)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
          <span className="text-sm font-semibold">
            {res.aindaDevido > 0 ? "Saldo ainda devido pelo cliente" : "Reembolso ao cliente"}
          </span>
          <span className={`text-lg font-bold ${res.aindaDevido > 0 ? "text-red-700" : "text-emerald-700"}`}>
            {brl(dados.moeda, res.aindaDevido > 0 ? res.aindaDevido : res.reembolso)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={salvarEtapa}
          disabled={salvando}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {salvando ? "Gravando…" : "Gravar etapa como override"}
        </button>
        {msg ? <span className="text-sm text-neutral-600">{msg}</span> : null}
      </div>

      <p className="text-xs text-neutral-500">
        Simulação (não executa reembolso). Percentuais, marcos das etapas e teto são configuráveis por instância e
        estão pendentes de confirmação jurídica. A execução do refund segue pelo motor de acerto (por webhook).
      </p>
    </div>
  );
}
