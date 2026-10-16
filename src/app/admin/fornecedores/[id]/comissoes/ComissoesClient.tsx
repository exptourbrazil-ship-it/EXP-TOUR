"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KINDS_COMISSAO, KIND_ROTULO, descreverRegra, type RegraComissao } from "@/lib/comissao-regra";

type Padrao = (RegraComissao & { id: string; valid_from: string; valid_until: string | null; notes: string | null }) | null;
type Regra = {
  id: string;
  scope: "kind" | "product";
  kind: string | null;
  product_id: string | null;
  productNome?: string | null;
  commission_basis: string;
  commission_type: string;
  commission_value: number;
  currency: string | null;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
};
type Produto = { id: string; name: string; kind: string };

const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs text-neutral-500";

const BASES: [string, string][] = [
  ["tuition", "Mensalidade"],
  ["tuition_plus_fees", "Mensalidade + taxas"],
  ["total", "Valor total"],
  ["none", "Sem comissão"],
];
const TIPOS: [string, string][] = [
  ["percent", "Percentual (%)"],
  ["fixed_per_sale", "Fixa por venda"],
  ["fixed_per_week", "Fixa por semana"],
];

function fmtData(iso: string | null) {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

function regraDe(r: Regra): RegraComissao {
  return { basis: r.commission_basis as RegraComissao["basis"], type: r.commission_type as RegraComissao["type"], value: Number(r.commission_value), currency: r.currency };
}

async function chamar(url: string, init: RequestInit): Promise<{ ok: boolean; erro?: string }> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; erro?: string };
    if (!res.ok || json.ok === false) return { ok: false, erro: json.erro || "Não foi possível concluir." };
    return { ok: true };
  } catch {
    return { ok: false, erro: "Erro de rede." };
  }
}

type Form = { basis: string; type: string; value: string; currency: string; validFrom: string; notes: string };
const vazio = (): Form => ({ basis: "tuition", type: "percent", value: "", currency: "", validFrom: "", notes: "" });

function CamposRegra({ f, set }: { f: Form; set: (p: Partial<Form>) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      <div><label className={lbl}>Base</label><select className={inp} value={f.basis} onChange={(e) => set({ basis: e.target.value })}>{BASES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
      <div><label className={lbl}>Tipo</label><select className={inp} value={f.type} onChange={(e) => set({ type: e.target.value })} disabled={f.basis === "none"}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
      <div><label className={lbl}>{f.type === "percent" ? "Percentual" : "Valor fixo"}</label><input className={inp} inputMode="decimal" value={f.basis === "none" ? "0" : f.value} onChange={(e) => set({ value: e.target.value })} disabled={f.basis === "none"} required /></div>
      <div><label className={lbl}>Moeda {f.type === "percent" ? "(só valor fixo)" : "*"}</label><input className={inp} value={f.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" /></div>
      <div><label className={lbl}>Vale a partir de</label><input className={inp} type="date" value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></div>
    </div>
  );
}

export default function ComissoesClient({ supplierId, padrao, regras, produtos, podeGerir }: { supplierId: string; padrao: Padrao; regras: Regra[]; produtos: Produto[]; podeGerir: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const url = `/api/admin/fornecedores/${supplierId}/comissoes`;

  const [fPadrao, setFPadrao] = useState<Form>(
    padrao ? { basis: padrao.basis, type: padrao.type, value: String(padrao.value), currency: padrao.currency ?? "", validFrom: padrao.valid_from, notes: padrao.notes ?? "" } : vazio(),
  );
  const [editKind, setEditKind] = useState<string | null>(null);
  const [fKind, setFKind] = useState<Form>(vazio());
  const [fProd, setFProd] = useState<Form & { productId: string }>({ ...vazio(), productId: "" });
  const [novaProdAberta, setNovaProdAberta] = useState(false);

  async function enviar(corpo: Record<string, unknown>, sucesso: string, aoFim?: () => void) {
    setOcupado(true); setMsg(null);
    const r = await chamar(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    setOcupado(false);
    if (!r.ok) { setMsg({ tipo: "erro", texto: r.erro || "Falhou." }); return; }
    setMsg({ tipo: "ok", texto: sucesso });
    aoFim?.();
    router.refresh();
  }

  async function remover(r: Regra) {
    if (!window.confirm("Remover esta regra? Os itens passam a usar a regra mais geral.")) return;
    setOcupado(true); setMsg(null);
    const res = await chamar(`${url}?regraId=${r.id}`, { method: "DELETE" });
    setOcupado(false);
    if (!res.ok) setMsg({ tipo: "erro", texto: res.erro || "Falhou." });
    else { setMsg({ tipo: "ok", texto: "Regra removida." }); router.refresh(); }
  }

  const regrasTipo = new Map(regras.filter((r) => r.scope === "kind").map((r) => [r.kind as string, r]));
  const regrasProduto = regras.filter((r) => r.scope === "product");
  const nomeProduto = (id: string) => produtos.find((p) => p.id === id)?.name ?? "(produto)";

  return (
    <div className="grid gap-6">
      {msg ? <div className={`rounded-lg border px-3 py-2 text-sm ${msg.tipo === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.texto}</div> : null}

      <p className="text-sm text-neutral-600">
        A comissão que a EXP Tour recebe desta escola. Vale a regra <b>mais específica</b>: primeiro a do produto/programa/serviço, depois a do tipo de item e, por fim, o acordo padrão da escola.
        É usada para calcular cada linha da fatura de comissão (Financeiro → Contas a receber).
      </p>

      {/* Padrao */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-serif text-lg text-brand">Acordo padrão da escola</h2>
        <p className="mb-3 text-xs text-neutral-500">
          {padrao ? <>Vigente: <b>{descreverRegra(padrao)}</b> desde {fmtData(padrao.valid_from)}.{padrao.notes ? <> <span className="text-neutral-400">{padrao.notes}</span></> : null}</> : "Nenhum acordo padrão cadastrado."}
        </p>
        {podeGerir ? (
          <form onSubmit={(e) => { e.preventDefault(); void enviar({ acao: "padrao", ...fPadrao }, "Acordo padrão salvo."); }} className="grid gap-2">
            <CamposRegra f={fPadrao} set={(p) => setFPadrao((s) => ({ ...s, ...p }))} />
            <div><label className={lbl}>Observações (o que o contrato diz)</label><textarea className={inp} rows={2} value={fPadrao.notes} onChange={(e) => setFPadrao((s) => ({ ...s, notes: e.target.value }))} maxLength={500} /></div>
            <button type="submit" disabled={ocupado} className="justify-self-start rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{padrao ? "Substituir acordo padrão" : "Salvar acordo padrão"}</button>
            {padrao ? <p className="text-xs text-neutral-400">Ao salvar, o acordo anterior é arquivado (fica no histórico).</p> : null}
          </form>
        ) : null}
      </section>

      {/* Por tipo */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-serif text-lg text-brand">Por tipo de item</h2>
        <p className="mb-3 text-xs text-neutral-500">Exceções ao padrão para um tipo inteiro (ex.: acomodação 10%, taxa de matrícula sem comissão).</p>
        <div className="divide-y divide-neutral-100">
          {KINDS_COMISSAO.map((k) => {
            const r = regrasTipo.get(k);
            return (
              <div key={k} className="py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-44 font-medium text-brand">{KIND_ROTULO[k]}</span>
                  {r ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{descreverRegra(regraDe(r))}</span>
                  ) : (
                    <span className="text-xs text-neutral-400">usa o padrão{padrao ? ` (${descreverRegra(padrao)})` : ""}</span>
                  )}
                  {r?.notes ? <span className="text-xs text-neutral-400">{r.notes}</span> : null}
                  {podeGerir ? (
                    <span className="ml-auto flex gap-2">
                      <button type="button" className="text-xs text-neutral-600 underline" onClick={() => { setEditKind(editKind === k ? null : k); setFKind(r ? { basis: r.commission_basis, type: r.commission_type, value: String(r.commission_value), currency: r.currency ?? "", validFrom: "", notes: r.notes ?? "" } : vazio()); }}>{r ? "Alterar" : "Definir regra"}</button>
                      {r ? <button type="button" className="text-xs text-red-700 underline" onClick={() => void remover(r)}>Remover</button> : null}
                    </span>
                  ) : null}
                </div>
                {podeGerir && editKind === k ? (
                  <form onSubmit={(e) => { e.preventDefault(); void enviar({ scope: "kind", kind: k, ...fKind }, `Regra de ${KIND_ROTULO[k].toLowerCase()} salva.`, () => setEditKind(null)); }} className="mt-2 grid gap-2 rounded-lg bg-neutral-50 p-3">
                    <CamposRegra f={fKind} set={(p) => setFKind((s) => ({ ...s, ...p }))} />
                    <div><label className={lbl}>Observação</label><input className={inp} value={fKind.notes} onChange={(e) => setFKind((s) => ({ ...s, notes: e.target.value }))} maxLength={500} /></div>
                    <button type="submit" disabled={ocupado} className="justify-self-start rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Salvar regra</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Por produto */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-1 flex items-center gap-3">
          <h2 className="font-serif text-lg text-brand">Por produto, programa ou serviço</h2>
          {podeGerir ? <button type="button" onClick={() => setNovaProdAberta((v) => !v)} className="ml-auto rounded-lg border border-neutral-300 px-3 py-1 text-xs text-neutral-700">{novaProdAberta ? "Fechar" : "+ Nova regra"}</button> : null}
        </div>
        <p className="mb-3 text-xs text-neutral-500">Vence o tipo e o padrão. Use para casos como um curso com comissão própria (ex.: Arts+ da Rennert, inglês geral da ETC).</p>
        {regrasProduto.length === 0 ? <p className="text-sm text-neutral-400">Nenhuma regra por produto.</p> : (
          <div className="divide-y divide-neutral-100">
            {regrasProduto.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium text-brand">{r.productNome || nomeProduto(r.product_id as string)}</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{descreverRegra(regraDe(r))}</span>
                <span className="text-xs text-neutral-400">desde {fmtData(r.valid_from)}{r.notes ? ` · ${r.notes}` : ""}</span>
                {podeGerir ? <button type="button" className="ml-auto text-xs text-red-700 underline" onClick={() => void remover(r)}>Remover</button> : null}
              </div>
            ))}
          </div>
        )}
        {podeGerir && novaProdAberta ? (
          <form onSubmit={(e) => { e.preventDefault(); void enviar({ scope: "product", ...fProd }, "Regra do produto salva.", () => { setNovaProdAberta(false); setFProd({ ...vazio(), productId: "" }); }); }} className="mt-3 grid gap-2 rounded-lg bg-neutral-50 p-3">
            <div>
              <label className={lbl}>Produto / programa / serviço *</label>
              <select className={inp} value={fProd.productId} onChange={(e) => setFProd((s) => ({ ...s, productId: e.target.value }))} required>
                <option value="">— escolha —</option>
                {KINDS_COMISSAO.filter((k) => produtos.some((p) => p.kind === k)).map((k) => (
                  <optgroup key={k} label={KIND_ROTULO[k]}>
                    {produtos.filter((p) => p.kind === k).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <CamposRegra f={fProd} set={(p) => setFProd((s) => ({ ...s, ...p }))} />
            <div><label className={lbl}>Observação</label><input className={inp} value={fProd.notes} onChange={(e) => setFProd((s) => ({ ...s, notes: e.target.value }))} maxLength={500} /></div>
            <button type="submit" disabled={ocupado} className="justify-self-start rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Salvar regra</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
