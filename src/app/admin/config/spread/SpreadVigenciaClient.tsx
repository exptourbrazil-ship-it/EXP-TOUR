"use client";

import { useCallback, useEffect, useState } from "react";

type Vigencia = { id: string; percentual: number; vigente_desde: string; observacao: string | null };
const inputCls =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500";
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function SpreadVigenciaClient() {
  const [itens, setItens] = useState<Vigencia[]>([]);
  const [novo, setNovo] = useState({ percentualPct: "", vigenteDesde: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    setErro(null);
    setTimeout(() => setMsg(null), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      const j = await fetch("/api/admin/config/spread-vigencia").then((r) => r.json());
      if (j?.ok) setItens(j.itens);
      else setErro(j?.erro || "Falha ao carregar.");
    } catch {
      setErro("Falha ao carregar.");
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const vigenteHoje = itens
    .filter((v) => v.vigente_desde.slice(0, 10) <= hoje())
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];

  async function adicionar() {
    setErro(null);
    const p = Number(String(novo.percentualPct).replace(",", "."));
    // Teto igual ao do servidor: o intervalo largo pega o erro grosseiro, nao o
    // de uma casa (0,5% vs 5%) — que dobraria a conta de todo estudante.
    if (!Number.isFinite(p) || p < 0 || p > 20) {
      setErro("Spread em % entre 0 e 20 (ex.: 5).");
      return;
    }
    if (!novo.vigenteDesde || novo.vigenteDesde < hoje()) {
      setErro("A vigência começa hoje ou numa data futura.");
      return;
    }
    const body = { percentual: p / 100, vigenteDesde: novo.vigenteDesde, observacao: novo.observacao || null };
    const r = await fetch("/api/admin/config/spread-vigencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      setErro(j?.erro || "Falha ao salvar.");
      return;
    }
    setNovo({ percentualPct: "", vigenteDesde: "", observacao: "" });
    carregar();
    flash("Vigência adicionada.");
  }

  async function remover(id: string) {
    if (!window.confirm("Cancelar esta vigência agendada?")) return;
    const r = await fetch(`/api/admin/config/spread-vigencia?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      setErro(j?.erro || "Falha ao remover.");
      return;
    }
    carregar();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold text-neutral-900">Spread de intermediação por vigência</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Fonte única do spread que compõe a cotação (VET = PTAX + spread + IOF, modelo aditivo). O
        percentual vigente na data é aplicado às novas conversões e é o que a proposta declara ao
        estudante. Para mudar o spread, adicione uma nova vigência — nunca apagando a atual, que é
        o histórico do que foi cobrado.
      </p>

      <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Vigente hoje:{" "}
        <strong>{vigenteHoje ? `${pct(vigenteHoje.percentual * 100)}%` : "— (usando variável de ambiente)"}</strong>
        {vigenteHoje ? ` (desde ${vigenteHoje.vigente_desde.slice(0, 10)})` : ""}
      </p>

      <p className="mt-2 text-xs text-neutral-500">
        Cobranças já geradas não mudam — o spread é congelado por parcela no momento da cobrança e o
        recibo continua itemizado pelo percentual cobrado. Já as propostas em aberto e as parcelas
        ainda sem cobrança passam a valer pelo novo percentual. A mudança vale para as duas marcas.
      </p>

      {erro ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p> : null}
      {msg ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p> : null}

      <div className="mt-4 space-y-2">
        {itens.length === 0 ? <p className="text-sm text-neutral-400">Nenhuma vigência cadastrada.</p> : null}
        {itens.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <span>
              <strong>{pct(v.percentual * 100)}%</strong> · a partir de {v.vigente_desde.slice(0, 10)}
              {v.observacao ? ` · ${v.observacao}` : ""}
              {vigenteHoje && v.id === vigenteHoje.id ? " · (vigente hoje)" : ""}
            </span>
            {/* Só vigência FUTURA pode ser cancelada. Apagar a que está valendo
                devolveria o spread à variável de ambiente sem nenhum sinal — o
                servidor recusa, e aqui nem oferecemos o botão. */}
            {v.vigente_desde.slice(0, 10) > hoje() ? (
              <button onClick={() => remover(v.id)} className="ml-3 text-red-600 hover:underline">
                Cancelar
              </button>
            ) : (
              <span className="ml-3 text-xs text-neutral-400">em vigor</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <input
          className={inputCls}
          inputMode="decimal"
          placeholder="Spread % (ex.: 5)"
          value={novo.percentualPct}
          onChange={(e) => setNovo({ ...novo, percentualPct: e.target.value })}
        />
        <input
          className={inputCls}
          type="date"
          min={hoje()}
          value={novo.vigenteDesde}
          onChange={(e) => setNovo({ ...novo, vigenteDesde: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Observação (opcional)"
          value={novo.observacao}
          onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
        />
      </div>
      <button onClick={adicionar} className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
        Adicionar vigência
      </button>
    </div>
  );
}
