"use client";

import { useCallback, useEffect, useState } from "react";

type Vigencia = { id: string; aliquota: number; vigente_desde: string; observacao: string | null };
const inputCls =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500";
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function IofVigenciaClient() {
  const [itens, setItens] = useState<Vigencia[]>([]);
  const [novo, setNovo] = useState({ aliquotaPct: "", vigenteDesde: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); setErro(null); setTimeout(() => setMsg(null), 2500); };

  const carregar = useCallback(async () => {
    try {
      const j = await fetch("/api/admin/config/iof-vigencia").then((r) => r.json());
      if (j?.ok) setItens(j.itens);
      else setErro(j?.erro || "Falha ao carregar.");
    } catch {
      setErro("Falha ao carregar.");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const vigenteHoje = itens
    .filter((v) => v.vigente_desde.slice(0, 10) <= hoje())
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];

  async function adicionar() {
    setErro(null);
    const pct = Number(String(novo.aliquotaPct).replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { setErro("Alíquota em % entre 0 e 100 (ex.: 3,5)."); return; }
    const body = { aliquota: pct / 100, vigenteDesde: novo.vigenteDesde, observacao: novo.observacao || null };
    const r = await fetch("/api/admin/config/iof-vigencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok || !j.ok) { setErro(j?.erro || "Falha ao salvar."); return; }
    setNovo({ aliquotaPct: "", vigenteDesde: "", observacao: "" });
    carregar(); flash("Vigência adicionada.");
  }
  async function remover(id: string) {
    const r = await fetch(`/api/admin/config/iof-vigencia?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) { setErro(j?.erro || "Falha ao remover."); return; }
    carregar();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold text-neutral-900">IOF-câmbio por vigência</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Fonte única da alíquota de IOF (§8). A alíquota vigente na data é aplicada às novas conversões.
        Para agendar uma mudança, adicione uma vigência com data futura.
      </p>

      <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Vigente hoje: <strong>{vigenteHoje ? `${(vigenteHoje.aliquota * 100).toLocaleString("pt-BR")}%` : "— (usando env/default)"}</strong>
        {vigenteHoje ? ` (desde ${vigenteHoje.vigente_desde.slice(0, 10)})` : ""}
      </p>

      {erro ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p> : null}
      {msg ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p> : null}

      <div className="mt-4 space-y-2">
        {itens.length === 0 ? <p className="text-sm text-neutral-400">Nenhuma vigência cadastrada.</p> : null}
        {itens.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <span>
              <strong>{(v.aliquota * 100).toLocaleString("pt-BR")}%</strong> · a partir de {v.vigente_desde.slice(0, 10)}
              {v.observacao ? ` · ${v.observacao}` : ""}
              {vigenteHoje && v.id === vigenteHoje.id ? " · (vigente hoje)" : ""}
            </span>
            <button onClick={() => remover(v.id)} className="ml-3 text-red-600 hover:underline">Remover</button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <input className={inputCls} inputMode="decimal" placeholder="Alíquota % (ex.: 3,5)" value={novo.aliquotaPct} onChange={(e) => setNovo({ ...novo, aliquotaPct: e.target.value })} />
        <input className={inputCls} type="date" value={novo.vigenteDesde} onChange={(e) => setNovo({ ...novo, vigenteDesde: e.target.value })} />
        <input className={inputCls} placeholder="Observação (opcional)" value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} />
      </div>
      <button onClick={adicionar} className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90">Adicionar vigência</button>
    </div>
  );
}
