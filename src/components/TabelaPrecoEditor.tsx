"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRICE_BASES, DURATION_TYPES, TEMPLATE_STATUSES, type Falha } from "@/lib/preco-template";
import { UNITS } from "@/lib/produto";

// Editor de TABELA DE PREÇO manual do Admin (price_template + faixas + vínculo a
// produtos) + pré-visualização. Client component: monta o corpo e chama
// POST /api/admin/catalog/price-templates (criar) ou PUT .../[id] (editar). Os
// selects usam os mesmos enums do motor puro (preco-template.ts). A validação de
// verdade é no servidor; aqui destacamos as falhas por campo.

const L: Record<string, string> = {
  duration: "Por duração", quantity: "Por quantidade", fixed: "Preço fixo", per_person: "Por pessoa",
  flexible: "Flexível", fixed_sessions: "Sessões fixas",
  draft: "Rascunho", active: "Ativo", expired: "Expirado",
  once: "Único", day: "Dia", night: "Noite", week: "Semana", month: "Mês", person: "Pessoa", unit: "Unidade",
};
const rot = (v: string) => L[v] ?? v;
const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

export type CampusOpt = { id: string; name: string; supplierName: string | null };
export type ProdutoOpt = { id: string; name: string; kind: string; campusId: string };
export type MarketOpt = { id: string; name: string };

export type TabelaInicial = {
  id?: string;
  template?: Record<string, any>;
  tiers?: any[];
  product_ids?: string[];
};

type TierForm = { min_quantity: string; unit_price: string };

export default function TabelaPrecoEditor({
  campi,
  produtos,
  markets,
  inicial,
}: {
  campi: CampusOpt[];
  produtos: ProdutoOpt[];
  markets: MarketOpt[];
  inicial?: TabelaInicial;
}) {
  const router = useRouter();
  const edicao = !!inicial?.id;
  const t = inicial?.template ?? {};

  const [campo, setCampo] = useState<Record<string, any>>({
    campus_id: t.campus_id ?? (campi[0]?.id ?? ""),
    name: t.name ?? "",
    price_basis: t.price_basis ?? "duration",
    duration_type: t.duration_type ?? "flexible",
    unit: t.unit ?? "week",
    currency: t.currency ?? "BRL",
    market_id: t.market_id ?? "",
    min_quantity: t.min_quantity ?? "",
    max_quantity: t.max_quantity ?? "",
    charge_in_tiers: !!t.charge_in_tiers,
    valid_from: t.valid_from ?? "",
    valid_until: t.valid_until ?? "",
    status: t.status ?? "draft",
  });
  const [tiers, setTiers] = useState<TierForm[]>(
    (inicial?.tiers ?? []).length
      ? (inicial!.tiers as any[]).map((x) => ({ min_quantity: String(x.min_quantity), unit_price: String(x.unit_price) }))
      : [{ min_quantity: "1", unit_price: "" }],
  );
  const [productIds, setProductIds] = useState<string[]>(inicial?.product_ids ?? []);

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const set = (k: string, v: any) => setCampo((c) => ({ ...c, [k]: v }));
  const falhaDe = (c: string) => falhas.find((f) => f.campo === c)?.erro;
  const falhaTierPrefixo = (i: number) => falhas.find((f) => f.campo.startsWith(`tiers[${i}]`))?.erro;

  // Produtos elegíveis: do campus escolhido (o service exige mesmo campus).
  const produtosDoCampus = produtos.filter((p) => p.campusId === campo.campus_id);

  function corpo() {
    const num = (v: any) => (v === "" || v == null ? undefined : Number(v));
    return {
      campus_id: campo.campus_id,
      name: campo.name,
      price_basis: campo.price_basis,
      duration_type: campo.duration_type,
      unit: campo.unit,
      currency: campo.currency,
      market_id: campo.market_id || undefined,
      min_quantity: num(campo.min_quantity),
      max_quantity: num(campo.max_quantity),
      charge_in_tiers: campo.charge_in_tiers,
      valid_from: campo.valid_from || undefined,
      valid_until: campo.valid_until || undefined,
      status: campo.status,
      product_ids: productIds,
      tiers: tiers
        .filter((x) => x.min_quantity !== "" || x.unit_price !== "")
        .map((x) => ({ min_quantity: x.min_quantity === "" ? undefined : Number(x.min_quantity), unit_price: x.unit_price === "" ? undefined : Number(x.unit_price) })),
    };
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setFalhas([]);
    try {
      const url = edicao ? `/api/admin/catalog/price-templates/${inicial!.id}` : "/api/admin/catalog/price-templates";
      const resp = await fetch(url, {
        method: edicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo()),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar a tabela.");
        setSalvando(false);
        return;
      }
      router.push("/admin/precos/tabelas");
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
        <legend className="px-1 font-serif text-base text-brand">Tabela</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Nome" erro={falhaDe("name")} className="sm:col-span-2">
            <input value={campo.name} onChange={(e) => set("name", e.target.value)} className={inp} placeholder="Ex.: General English 2026" />
          </Campo>
          <Campo label="Campus / Unidade" erro={falhaDe("campus_id")}>
            <select
              value={campo.campus_id}
              onChange={(e) => { set("campus_id", e.target.value); setProductIds([]); }}
              className={inp}
              disabled={edicao}
            >
              <option value="">Selecione…</option>
              {campi.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.supplierName ? ` — ${c.supplierName}` : ""}</option>
              ))}
            </select>
            {edicao ? <p className="mt-1 text-xs text-neutral-500">O campus não muda na edição (mudaria os produtos elegíveis).</p> : null}
          </Campo>
          <Campo label="Mercado (opcional)">
            <select value={campo.market_id} onChange={(e) => set("market_id", e.target.value)} className={inp}>
              <option value="">Todos os mercados</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Campo>
          <Sel label="Base de preço" v={campo.price_basis} set={(x) => set("price_basis", x)} opts={PRICE_BASES} />
          <Sel label="Tipo de duração" v={campo.duration_type} set={(x) => set("duration_type", x)} opts={DURATION_TYPES} />
          <Sel label="Unidade" v={campo.unit} set={(x) => set("unit", x)} opts={UNITS} />
          <Campo label="Moeda" erro={falhaDe("currency")}>
            <input value={campo.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} className={inp} placeholder="BRL" />
          </Campo>
          <Sel label="Status" v={campo.status} set={(x) => set("status", x)} opts={TEMPLATE_STATUSES} />
          <Campo label="Qtd. mínima" erro={falhaDe("min_quantity")}>
            <input type="number" min={0} value={campo.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Qtd. máxima" erro={falhaDe("max_quantity")}>
            <input type="number" min={0} value={campo.max_quantity} onChange={(e) => set("max_quantity", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Vigência de" erro={falhaDe("valid_from")}>
            <input type="date" value={campo.valid_from} onChange={(e) => set("valid_from", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Vigência até" erro={falhaDe("valid_until")}>
            <input type="date" value={campo.valid_until} onChange={(e) => set("valid_until", e.target.value)} className={inp} />
          </Campo>
          <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
            <input type="checkbox" checked={campo.charge_in_tiers} onChange={(e) => set("charge_in_tiers", e.target.checked)} />
            Cobrar por faixas (progressivo: cada faixa cobra sua parcela)
          </label>
        </div>
      </fieldset>

      {/* Faixas */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Faixas de preço</legend>
        <p className="mb-2 text-xs text-neutral-500">
          A faixa vale a partir da quantidade informada (a próxima faixa define o teto). A primeira faixa é o preço-âncora.
        </p>
        {falhaDe("tiers") ? <p className="mb-2 text-xs text-red-600">{falhaDe("tiers")}</p> : null}
        <div className="space-y-2">
          {tiers.map((tr, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-neutral-500">a partir de</label>
              <input type="number" min={0} placeholder="qtd" value={tr.min_quantity}
                onChange={(e) => setTiers((a) => a.map((x, j) => (j === i ? { ...x, min_quantity: e.target.value } : x)))}
                className={`${inp} w-24`} />
              <label className="text-xs text-neutral-500">preço unit.</label>
              <input type="number" min={0} step="0.01" placeholder="0,00" value={tr.unit_price}
                onChange={(e) => setTiers((a) => a.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))}
                className={`${inp} w-32`} />
              {tiers.length > 1 ? (
                <button type="button" onClick={() => setTiers((a) => a.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remover</button>
              ) : null}
              {falhaTierPrefixo(i) ? <span className="text-xs text-red-600">{falhaTierPrefixo(i)}</span> : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setTiers((a) => [...a, { min_quantity: "", unit_price: "" }])} className="mt-2 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-brand">
          + Adicionar faixa
        </button>
      </fieldset>

      {/* Produtos vinculados */}
      <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
        <legend className="px-1 font-serif text-base text-brand">Produtos desta tabela</legend>
        <p className="mb-2 text-xs text-neutral-500">Selecione os produtos (do mesmo campus) que usam esta tabela de preço.</p>
        {falhaDe("product_ids") ? <p className="mb-2 text-xs text-red-600">{falhaDe("product_ids")}</p> : null}
        {produtosDoCampus.length === 0 ? (
          <p className="text-xs text-neutral-500">Nenhum produto neste campus. Cadastre produtos antes.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {produtosDoCampus.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={(e) =>
                    setProductIds((a) => (e.target.checked ? [...a, p.id] : a.filter((x) => x !== p.id)))
                  }
                />
                {p.name} <span className="text-xs text-neutral-400">({p.kind})</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Preview produtos={produtosDoCampus.filter((p) => productIds.includes(p.id))} unit={campo.unit} edicao={edicao} />

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
          {salvando ? "Salvando…" : edicao ? "Salvar alterações" : "Criar tabela"}
        </button>
        <button type="button" onClick={() => router.push("/admin/precos/tabelas")} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Pré-visualização (usa o preço VIVO no banco; reflete a versão salva) ──────
function Preview({ produtos, unit, edicao }: { produtos: { id: string; name: string }[]; unit: string; edicao: boolean }) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("4");
  const [startDate, setStartDate] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function prever() {
    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const resp = await fetch("/api/admin/catalog/price-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: Number(quantity), unit, startDate }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json?.error?.message ?? "Não foi possível pré-visualizar.");
      } else {
        setResultado(json.data);
      }
    } catch {
      setErro("Falha de rede na pré-visualização.");
    }
    setCarregando(false);
  }

  return (
    <fieldset className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
      <legend className="px-1 font-serif text-base text-brand">Pré-visualizar preço</legend>
      <p className="mb-2 text-xs text-neutral-500">
        Usa o preço vivo no banco — reflete a <b>versão salva</b> (salve antes para ver as faixas atuais).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className={`${inp} min-w-48 flex-1`}>
          <option value="">Produto…</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inp} w-24`} placeholder="qtd" />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inp} w-40`} />
        <button type="button" onClick={prever} disabled={carregando || !productId || !startDate} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-brand disabled:opacity-50">
          {carregando ? "…" : "Calcular"}
        </button>
      </div>
      {erro ? <p className="mt-2 text-xs text-red-600">{erro}</p> : null}
      {resultado ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>Qtd. cobrada: <b>{resultado.billableQuantity}</b></span>
            <span>Bruto: <b>{resultado.currency} {Number(resultado.grossAmount).toFixed(2)}</b></span>
            <span>Preço médio/un.: <b>{resultado.currency} {Number(resultado.averageUnitPrice).toFixed(2)}</b></span>
            <span>Líquido: <b>{resultado.currency} {Number(resultado.netAmount).toFixed(2)}</b></span>
          </div>
          {Array.isArray(resultado.warnings) && resultado.warnings.length ? (
            <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">
              {resultado.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────
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
