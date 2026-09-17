"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemPlano } from "@/lib/disponibilidade-extract";

const ACAO: Record<ItemPlano["acao"], { label: string; cls: string }> = {
  criar: { label: "nova", cls: "bg-emerald-100 text-emerald-700" },
  alterar: { label: "altera", cls: "bg-amber-100 text-amber-800" },
  igual: { label: "já igual", cls: "bg-neutral-100 text-neutral-500" },
};

// Tabela do plano com checkbox por item. Padrao: marcados os 'criar'/'alterar' com data
// futura; 'igual' e datas passadas desmarcados. Publicar envia so as chaves marcadas.
export default function PropostaDisponibilidadeClient({ id, itens }: { id: string; itens: ItemPlano[] }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(itens.filter((i) => i.acao !== "igual" && !i.passada).map((i) => i.chave)));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [formRecusa, setFormRecusa] = useState(false);
  const [motivo, setMotivo] = useState("");

  const toggle = (chave: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  async function chamar(acao: "aprovar" | "rejeitar") {
    if (acao === "aprovar" && !confirm(`Publicar ${marcados.size} item(ns)? A disponibilidade muda na hora — o mesmo que a escola vê no portal.`)) return;
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/availability-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "aprovar" ? { acao, id, chaves: Array.from(marcados) } : { acao, id, motivo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha na operação.");
        return;
      }
      setOk(acao === "aprovar" ? `Publicado: ${json.aplicados} item(ns)${json.falhas?.length ? ` · ${json.falhas.length} falha(s)` : ""}.` : "Proposta recusada.");
      setTimeout(() => router.refresh(), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      {erro ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{erro}</div> : null}
      {ok ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">{ok}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-400">
            <tr>
              <th className="px-2 py-1"></th>
              <th className="px-2 py-1">Produto (lido como)</th>
              <th className="px-2 py-1">Data / período</th>
              <th className="px-2 py-1">Hoje</th>
              <th className="px-2 py-1">Material diz</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="text-neutral-700">
            {itens.map((i) => (
              <tr key={i.chave} className={`border-t border-neutral-100 ${i.passada ? "opacity-60" : ""}`}>
                <td className="px-2 py-1.5">
                  <input type="checkbox" checked={marcados.has(i.chave)} disabled={i.acao === "igual" || ocupado} onChange={() => toggle(i.chave)} />
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-medium text-brand">{i.produto}</div>
                  {i.origem !== i.produto ? <div className="text-xs text-neutral-400">“{i.origem}” · {i.score}%</div> : null}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {i.tipo === "intake" ? i.startDate : `${i.periodStart} → ${i.periodEnd ?? "em diante"}`}
                  {i.passada ? <span className="ml-1 text-xs text-neutral-400">(passou)</span> : null}
                </td>
                <td className="px-2 py-1.5 text-xs">
                  {i.atual ? `${i.atual.status}${i.tipo === "intake" && i.atual.capacity != null ? ` · ${i.atual.capacity} vagas` : ""}${i.tipo === "periodo" ? ` · até ${i.atual.periodEnd ?? "em diante"}` : ""}` : "—"}
                  {i.atual?.notes ? <div className="text-neutral-400">{i.atual.notes}</div> : null}
                </td>
                <td className="px-2 py-1.5 text-xs">
                  {i.status}
                  {i.tipo === "intake" && i.capacity != null ? ` · ${i.capacity} vagas` : ""}
                  {i.notes ? <div className="text-neutral-400">{i.notes}</div> : null}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ACAO[i.acao].cls}`}>{ACAO[i.acao].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!formRecusa ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => chamar("aprovar")} disabled={ocupado || marcados.size === 0} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {ocupado ? "Publicando…" : `Publicar ${marcados.size} item(ns)`}
          </button>
          <button type="button" onClick={() => { setErro(null); setFormRecusa(true); }} disabled={ocupado} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60">
            Recusar proposta
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="block text-xs font-medium text-neutral-600">Motivo da recusa (fica no histórico)</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm" placeholder="Ex.: calendário do ano passado; datas não batem com o que a escola confirmou…" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => chamar("rejeitar")} disabled={ocupado || !motivo.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Confirmar recusa</button>
            <button type="button" onClick={() => setFormRecusa(false)} disabled={ocupado} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
