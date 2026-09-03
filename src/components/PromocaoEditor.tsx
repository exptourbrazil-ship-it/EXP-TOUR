"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROMO_TYPES, FREE_UNITS_SEMANTICS, APPLIES_TO, TARGET_DIMENSIONS, PROMO_STATUSES, type Falha,
} from "@/lib/promocao";

// Editor de PROMOCAO manual do Admin. Client component: monta o corpo e chama
// POST /api/admin/catalog/promotions (criar) ou PUT .../[id] (editar). Os selects
// usam os mesmos enums do motor puro (promocao.ts). Campos condicionais por
// promo_type (value/semantics) e applies_to (alvo específico). Validação real no
// servidor; falhas por campo destacadas.

const L: Record<string, string> = {
  percent_off: "Desconto %", fixed_off: "Desconto fixo", free_units: "Unidades grátis",
  waive_fee: "Isentar taxa", free_product: "Produto grátis", override_price: "Preço promocional",
  bonus_on_top: "Bônus (a mais)", discount_on_booked: "Desconto nas reservadas",
  tuition: "Curso (tuition)", accommodation: "Acomodação", insurance: "Seguro", fees: "Taxas",
  specific_fee: "Taxa específica", total: "Total", specific_product: "Produto específico",
  market: "Mercado", nationality: "Nacionalidade", campus: "Campus", partner: "Parceiro",
  product: "Produto", education_type: "Tipo de ensino",
  draft: "Rascunho", active: "Ativo", expired: "Expirado",
  program: "Programa", other: "Complementar", package: "Pacote",
};
const rot = (v: string) => L[v] ?? v;
const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

export type SupplierOpt = { id: string; name: string };
export type CampusOpt = { id: string; name: string; supplierId: string | null };
export type ProdutoOpt = { id: string; name: string; kind: string; campusId: string };
export type FeeOpt = { id: string; name: string; campusId: string };
export type PromocaoInicial = { id?: string; promotion?: Record<string, any>; targets?: { dimension: string; value: string }[] };

const EXIGEM_VALUE = ["percent_off", "fixed_off", "free_units", "override_price"];

export default function PromocaoEditor({
  suppliers,
  campi,
  produtos,
  fees,
  inicial,
}: {
  suppliers: SupplierOpt[];
  campi: CampusOpt[];
  produtos: ProdutoOpt[];
  fees: FeeOpt[];
  inicial?: PromocaoInicial;
}) {
  const router = useRouter();
  const edicao = !!inicial?.id;
  const p = inicial?.promotion ?? {};

  const [campo, setCampo] = useState<Record<string, any>>({
    supplier_id: p.supplier_id ?? (suppliers[0]?.id ?? ""),
    campus_id: p.campus_id ?? "",
    name: p.name ?? "",
    promo_type: p.promo_type ?? "percent_off",
    value: p.value != null ? String(p.value) : "",
    free_units_semantics: p.free_units_semantics ?? "bonus_on_top",
    applies_to: p.applies_to ?? "tuition",
    applies_to_ref_id: p.applies_to_ref_id ?? "",
    min_quantity: p.min_quantity ?? "",
    max_discount_amount: p.max_discount_amount != null ? String(p.max_discount_amount) : "",
    is_stackable: !!p.is_stackable,
    priority: p.priority != null ? String(p.priority) : "100",
    booking_from: p.booking_from ?? "",
    booking_until: p.booking_until ?? "",
    travel_from: p.travel_from ?? "",
    travel_until: p.travel_until ?? "",
    status: p.status ?? "draft",
  });
  const [targets, setTargets] = useState<{ dimension: string; value: string }[]>(
    (inicial?.targets ?? []).map((t) => ({ dimension: t.dimension, value: t.value })),
  );

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const set = (k: string, v: any) => setCampo((c) => ({ ...c, [k]: v }));
  const falhaDe = (c: string) => falhas.find((x) => x.campo === c)?.erro;

  // Campi/produtos/taxas do fornecedor escolhido.
  const campusIdsDoSupplier = new Set(campi.filter((c) => c.supplierId === campo.supplier_id).map((c) => c.id));
  const campiDoSupplier = campi.filter((c) => c.supplierId === campo.supplier_id);
  const produtosDoSupplier = produtos.filter((x) => campusIdsDoSupplier.has(x.campusId));
  const feesDoSupplier = fees.filter((x) => campusIdsDoSupplier.has(x.campusId));

  const exigeValue = EXIGEM_VALUE.includes(campo.promo_type);
  const exigeSemantics = campo.promo_type === "free_units";
  const exigeRef = campo.applies_to === "specific_fee" || campo.applies_to === "specific_product";

  function corpo() {
    const num = (v: any) => (v === "" || v == null ? undefined : Number(v));
    const c: Record<string, any> = {
      supplier_id: campo.supplier_id,
      campus_id: campo.campus_id || undefined,
      name: campo.name,
      promo_type: campo.promo_type,
      applies_to: campo.applies_to,
      min_quantity: num(campo.min_quantity),
      max_discount_amount: num(campo.max_discount_amount),
      is_stackable: campo.is_stackable,
      priority: num(campo.priority),
      booking_from: campo.booking_from || undefined,
      booking_until: campo.booking_until || undefined,
      travel_from: campo.travel_from || undefined,
      travel_until: campo.travel_until || undefined,
      status: campo.status,
      targets: targets.filter((t) => t.dimension && t.value),
    };
    if (exigeValue) c.value = num(campo.value);
    if (exigeSemantics) c.free_units_semantics = campo.free_units_semantics;
    if (exigeRef) c.applies_to_ref_id = campo.applies_to_ref_id || undefined;
    return c;
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setFalhas([]);
    try {
      const url = edicao ? `/api/admin/catalog/promotions/${inicial!.id}` : "/api/admin/catalog/promotions";
      const resp = await fetch(url, {
        method: edicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo()),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar a promoção.");
        setSalvando(false);
        return;
      }
      router.push("/admin/precos/promocoes");
      router.refresh();
    } catch {
      setErroGeral("Falha de rede ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      {erroGeral ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroGeral}</div> : null}

      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Promoção</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Nome" erro={falhaDe("name")} className="sm:col-span-2">
            <input value={campo.name} onChange={(e) => set("name", e.target.value)} className={inp} placeholder="Ex.: Early bird 2026" />
          </Campo>
          <Campo label="Fornecedor" erro={falhaDe("supplier_id")}>
            <select value={campo.supplier_id} onChange={(e) => { set("supplier_id", e.target.value); set("campus_id", ""); set("applies_to_ref_id", ""); }} className={inp} disabled={edicao}>
              <option value="">Selecione…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {edicao ? <p className="mt-1 text-xs text-neutral-500">O fornecedor não muda na edição.</p> : null}
          </Campo>
          <Campo label="Campus (opcional)" erro={falhaDe("campus_id")}>
            <select value={campo.campus_id} onChange={(e) => set("campus_id", e.target.value)} className={inp}>
              <option value="">Todos os campi do fornecedor</option>
              {campiDoSupplier.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Campo>
          <Sel label="Tipo de promoção" v={campo.promo_type} set={(x) => set("promo_type", x)} opts={PROMO_TYPES} />
          <Sel label="Status" v={campo.status} set={(x) => set("status", x)} opts={PROMO_STATUSES} />
        </div>
      </fieldset>

      {/* Valor / semântica (condicional) */}
      {(exigeValue || exigeSemantics) && (
        <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
          <legend className="px-1 font-serif text-base text-brand">Valor</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {exigeValue ? (
              <Campo label={campo.promo_type === "percent_off" ? "Percentual (0–100)" : campo.promo_type === "free_units" ? "Nº de unidades" : "Valor"} erro={falhaDe("value")}>
                <input type="number" min={0} step="0.01" value={campo.value} onChange={(e) => set("value", e.target.value)} className={inp} />
              </Campo>
            ) : null}
            {exigeSemantics ? (
              <Sel label="Semântica das unidades grátis" v={campo.free_units_semantics} set={(x) => set("free_units_semantics", x)} opts={FREE_UNITS_SEMANTICS} />
            ) : null}
            <Campo label="Teto de desconto (opcional)" erro={falhaDe("max_discount_amount")}>
              <input type="number" min={0} step="0.01" value={campo.max_discount_amount} onChange={(e) => set("max_discount_amount", e.target.value)} className={inp} />
            </Campo>
          </div>
        </fieldset>
      )}

      {/* Aplicação */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Aplicação</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Sel label="Aplica-se a" v={campo.applies_to} set={(x) => { set("applies_to", x); set("applies_to_ref_id", ""); }} opts={APPLIES_TO} />
          {exigeRef ? (
            <Campo label={campo.applies_to === "specific_fee" ? "Taxa específica" : "Produto específico"} erro={falhaDe("applies_to_ref_id")}>
              <select value={campo.applies_to_ref_id} onChange={(e) => set("applies_to_ref_id", e.target.value)} className={inp}>
                <option value="">Selecione…</option>
                {(campo.applies_to === "specific_fee" ? feesDoSupplier : produtosDoSupplier).map((x: any) => (
                  <option key={x.id} value={x.id}>{x.name}{x.kind ? ` (${rot(x.kind)})` : ""}</option>
                ))}
              </select>
            </Campo>
          ) : null}
          <Campo label="Quantidade mínima (opcional)" erro={falhaDe("min_quantity")}>
            <input type="number" min={0} value={campo.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Prioridade" erro={falhaDe("priority")}>
            <input type="number" min={0} value={campo.priority} onChange={(e) => set("priority", e.target.value)} className={inp} />
          </Campo>
          <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
            <input type="checkbox" checked={campo.is_stackable} onChange={(e) => set("is_stackable", e.target.checked)} /> Empilhável (soma com outras promoções)
          </label>
        </div>
      </fieldset>

      {/* Janelas */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Janelas de vigência</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Reserva de"><input type="date" value={campo.booking_from} onChange={(e) => set("booking_from", e.target.value)} className={inp} /></Campo>
          <Campo label="Reserva até" erro={falhaDe("booking_until")}><input type="date" value={campo.booking_until} onChange={(e) => set("booking_until", e.target.value)} className={inp} /></Campo>
          <Campo label="Viagem de"><input type="date" value={campo.travel_from} onChange={(e) => set("travel_from", e.target.value)} className={inp} /></Campo>
          <Campo label="Viagem até" erro={falhaDe("travel_until")}><input type="date" value={campo.travel_until} onChange={(e) => set("travel_until", e.target.value)} className={inp} /></Campo>
        </div>
      </fieldset>

      {/* Segmentação */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Segmentação (opcional)</legend>
        <p className="mb-2 text-xs text-neutral-500">Restringe a promoção a critérios (ex.: nacionalidade BR, mercado latam). Sem segmentos, vale para todos.</p>
        <div className="space-y-2">
          {targets.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={t.dimension} onChange={(e) => setTargets((a) => a.map((x, j) => (j === i ? { ...x, dimension: e.target.value } : x)))} className={`${inp} w-44`}>
                <option value="">Dimensão…</option>
                {TARGET_DIMENSIONS.map((d) => <option key={d} value={d}>{rot(d)}</option>)}
              </select>
              <input value={t.value} onChange={(e) => setTargets((a) => a.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={`${inp} flex-1`} placeholder="valor (ex.: BR, latam, id…)" />
              <button type="button" onClick={() => setTargets((a) => a.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remover</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setTargets((a) => [...a, { dimension: "", value: "" }])} className="mt-2 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-brand">+ Adicionar segmento</button>
      </fieldset>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
          {salvando ? "Salvando…" : edicao ? "Salvar alterações" : "Criar promoção"}
        </button>
        <button type="button" onClick={() => router.push("/admin/precos/promocoes")} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand">Cancelar</button>
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
