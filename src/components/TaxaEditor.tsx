"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEE_TYPES, CHARGE_BASES, FEE_APPLIES_KINDS, type Falha } from "@/lib/fee";

// Editor de TAXA (fee) manual do Admin. Client component: monta o corpo e chama
// POST /api/admin/catalog/fees (criar) ou PUT .../[id] (editar). Os selects usam
// os mesmos enums do motor puro (fee.ts). A validação de verdade é no servidor;
// aqui destacamos as falhas por campo. Modo de valor: FIXO (amount+moeda) XOR
// DERIVADO de uma tabela de preço (price_template_id).

const L: Record<string, string> = {
  registration: "Matrícula", material: "Material", bank: "Bancária", placement: "Colocação",
  service: "Serviço", courier: "Courier", courier_of_documents: "Courier de documentos", custom: "Personalizada",
  once_per_quote: "Uma vez por cotação", once_per_item: "Uma vez por item", per_unit: "Por unidade", per_person: "Por pessoa",
  program: "Programa", accommodation: "Acomodação", insurance: "Seguro", other: "Complementar", package: "Pacote",
};
const rot = (v: string) => L[v] ?? v;
const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

export type CampusOpt = { id: string; name: string; supplierName: string | null };
export type ProdutoOpt = { id: string; name: string; kind: string; campusId: string };
export type TemplateOpt = { id: string; name: string; currency: string; campusId: string };

export type TaxaInicial = { id?: string; fee?: Record<string, any>; product_ids?: string[] };

export default function TaxaEditor({
  campi,
  produtos,
  templates,
  inicial,
}: {
  campi: CampusOpt[];
  produtos: ProdutoOpt[];
  templates: TemplateOpt[];
  inicial?: TaxaInicial;
}) {
  const router = useRouter();
  const edicao = !!inicial?.id;
  const f = inicial?.fee ?? {};

  const [campo, setCampo] = useState<Record<string, any>>({
    campus_id: f.campus_id ?? (campi[0]?.id ?? ""),
    name: f.name ?? "",
    fee_type: f.fee_type ?? "registration",
    charge_basis: f.charge_basis ?? "once_per_quote",
    modo: f.price_template_id ? "tabela" : "fixo",
    amount: f.amount != null ? String(f.amount) : "",
    currency: f.currency ?? "BRL",
    price_template_id: f.price_template_id ?? "",
    is_refundable: !!f.is_refundable,
    is_mandatory: f.is_mandatory == null ? true : !!f.is_mandatory,
    valid_from: f.valid_from ?? "",
    valid_until: f.valid_until ?? "",
  });
  const [kinds, setKinds] = useState<string[]>(Array.isArray(f.applies_to_kinds) ? f.applies_to_kinds : []);
  const [productIds, setProductIds] = useState<string[]>(inicial?.product_ids ?? []);

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const set = (k: string, v: any) => setCampo((c) => ({ ...c, [k]: v }));
  const falhaDe = (c: string) => falhas.find((x) => x.campo === c)?.erro;

  const produtosDoCampus = produtos.filter((p) => p.campusId === campo.campus_id);
  const templatesDoCampus = templates.filter((t) => t.campusId === campo.campus_id);

  function corpo() {
    const base: Record<string, any> = {
      campus_id: campo.campus_id,
      name: campo.name,
      fee_type: campo.fee_type,
      charge_basis: campo.charge_basis,
      is_refundable: campo.is_refundable,
      is_mandatory: campo.is_mandatory,
      applies_to_kinds: kinds,
      product_ids: productIds,
      valid_from: campo.valid_from || undefined,
      valid_until: campo.valid_until || undefined,
    };
    if (campo.modo === "fixo") {
      base.amount = campo.amount === "" ? undefined : Number(campo.amount);
      base.currency = campo.currency;
    } else {
      base.price_template_id = campo.price_template_id || undefined;
    }
    return base;
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setFalhas([]);
    try {
      const url = edicao ? `/api/admin/catalog/fees/${inicial!.id}` : "/api/admin/catalog/fees";
      const resp = await fetch(url, {
        method: edicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo()),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar a taxa.");
        setSalvando(false);
        return;
      }
      router.push("/admin/precos/taxas");
      router.refresh();
    } catch {
      setErroGeral("Falha de rede ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      {erroGeral ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroGeral}</div>
      ) : null}

      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Taxa</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Nome" erro={falhaDe("name")} className="sm:col-span-2">
            <input value={campo.name} onChange={(e) => set("name", e.target.value)} className={inp} placeholder="Ex.: Taxa de matrícula" />
          </Campo>
          <Campo label="Campus / Unidade" erro={falhaDe("campus_id")}>
            <select value={campo.campus_id} onChange={(e) => { set("campus_id", e.target.value); setProductIds([]); set("price_template_id", ""); }} className={inp} disabled={edicao}>
              <option value="">Selecione…</option>
              {campi.map((c) => <option key={c.id} value={c.id}>{c.name}{c.supplierName ? ` — ${c.supplierName}` : ""}</option>)}
            </select>
            {edicao ? <p className="mt-1 text-xs text-neutral-500">O campus não muda na edição.</p> : null}
          </Campo>
          <Sel label="Tipo" v={campo.fee_type} set={(x) => set("fee_type", x)} opts={FEE_TYPES} />
          <Sel label="Cobrança" v={campo.charge_basis} set={(x) => set("charge_basis", x)} opts={CHARGE_BASES} />
          <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" checked={campo.is_mandatory} onChange={(e) => set("is_mandatory", e.target.checked)} /> Obrigatória</label>
          <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" checked={campo.is_refundable} onChange={(e) => set("is_refundable", e.target.checked)} /> Reembolsável</label>
          <Campo label="Vigência de">
            <input type="date" value={campo.valid_from} onChange={(e) => set("valid_from", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Vigência até" erro={falhaDe("valid_until")}>
            <input type="date" value={campo.valid_until} onChange={(e) => set("valid_until", e.target.value)} className={inp} />
          </Campo>
        </div>
      </fieldset>

      {/* Valor: fixo XOR derivado de tabela */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Valor</legend>
        {falhaDe("amount") ? <p className="mb-2 text-xs text-red-600">{falhaDe("amount")}</p> : null}
        <div className="mb-3 flex gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="radio" name="modo" checked={campo.modo === "fixo"} onChange={() => set("modo", "fixo")} /> Valor fixo</label>
          <label className="flex items-center gap-1"><input type="radio" name="modo" checked={campo.modo === "tabela"} onChange={() => set("modo", "tabela")} /> Derivado de tabela de preço</label>
        </div>
        {campo.modo === "fixo" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Valor" erro={falhaDe("amount")}>
              <input type="number" min={0} step="0.01" value={campo.amount} onChange={(e) => set("amount", e.target.value)} className={inp} placeholder="0,00" />
            </Campo>
            <Campo label="Moeda" erro={falhaDe("currency")}>
              <input value={campo.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} className={inp} placeholder="BRL" />
            </Campo>
          </div>
        ) : (
          <Campo label="Tabela de preço (mesmo campus)" erro={falhaDe("price_template_id")}>
            <select value={campo.price_template_id} onChange={(e) => set("price_template_id", e.target.value)} className={inp}>
              <option value="">Selecione a tabela…</option>
              {templatesDoCampus.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.currency})</option>)}
            </select>
            {templatesDoCampus.length === 0 ? <p className="mt-1 text-xs text-neutral-500">Nenhuma tabela neste campus. Crie uma tabela de preço antes.</p> : null}
          </Campo>
        )}
      </fieldset>

      {/* Alvo: tipos e/ou produtos */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Onde a taxa se aplica</legend>
        <p className="mb-2 text-xs text-neutral-500">Por tipo de produto e/ou produtos específicos (do mesmo campus). Informe ao menos um.</p>
        {falhaDe("applies_to_kinds") ? <p className="mb-2 text-xs text-red-600">{falhaDe("applies_to_kinds")}</p> : null}
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Tipos de produto</span>
          <div className="flex flex-wrap gap-3">
            {FEE_APPLIES_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds((a) => (e.target.checked ? [...a, k] : a.filter((x) => x !== k)))} />
                {rot(k)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600">Produtos específicos (opcional)</span>
          {produtosDoCampus.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhum produto neste campus.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {produtosDoCampus.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={productIds.includes(p.id)} onChange={(e) => setProductIds((a) => (e.target.checked ? [...a, p.id] : a.filter((x) => x !== p.id)))} />
                  {p.name} <span className="text-xs text-neutral-400">({rot(p.kind)})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
          {salvando ? "Salvando…" : edicao ? "Salvar alterações" : "Criar taxa"}
        </button>
        <button type="button" onClick={() => router.push("/admin/precos/taxas")} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand">Cancelar</button>
      </div>
    </form>
  );
}

function Campo({ label, erro, className, children }: { label: string; erro?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-neutral-600">{label}</label>
      {children}
      {erro ? <p className="mt-1 text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}
function Sel({ label, v, set, opts }: { label: string; v: string; set: (x: string) => void; opts: readonly string[] }) {
  return (
    <Campo label={label}>
      <select value={v} onChange={(e) => set(e.target.value)} className={inp}>
        {opts.map((o) => <option key={o} value={o}>{rot(o)}</option>)}
      </select>
    </Campo>
  );
}
