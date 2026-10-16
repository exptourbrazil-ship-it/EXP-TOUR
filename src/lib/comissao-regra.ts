// Regras de COMISSAO por escola (PURO, sem rede/DB).
//
// Hierarquia — a regra MAIS ESPECIFICA vigente vence:
//   1. produto/programa/servico especifico (supplier_commission_rule, scope='product')
//   2. tipo de item: curso, acomodacao, pacote, seguro, servico, taxa (scope='kind')
//   3. acordo padrao da escola (supplier_agreement)
// Quem grava e o servico; aqui ficam a resolucao e a validacao.
import type { BaseComissao, TipoComissao } from "@/lib/comissao-fatura";

export const KINDS_COMISSAO = ["program", "accommodation", "package", "insurance", "other", "fee"] as const;
export type KindComissao = (typeof KINDS_COMISSAO)[number];

export const KIND_ROTULO: Record<KindComissao, string> = {
  program: "Curso/programa",
  accommodation: "Acomodação",
  package: "Pacote",
  insurance: "Seguro",
  other: "Serviço/outros",
  fee: "Taxa (matrícula etc.)",
};

export type RegraComissao = {
  basis: BaseComissao;
  type: TipoComissao;
  value: number;
  currency: string | null;
};

export type OrigemRegra = "produto" | "tipo" | "padrao";

export type RegraResolvida = RegraComissao & { origem: OrigemRegra };

export type RegraArmazenada = {
  scope: "kind" | "product";
  kind: string | null;
  product_id: string | null;
  commission_basis: string;
  commission_type: string;
  commission_value: number | string;
  currency: string | null;
  valid_from: string;
  valid_until: string | null;
};

const BASES: readonly string[] = ["tuition", "tuition_plus_fees", "total", "none"];
const TIPOS: readonly string[] = ["percent", "fixed_per_sale", "fixed_per_week"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function vigente(r: { valid_from: string; valid_until: string | null }, hoje: string): boolean {
  if (r.valid_from > hoje) return false;
  if (r.valid_until && String(r.valid_until) < hoje) return false;
  return true;
}

function paraRegra(r: RegraArmazenada): RegraComissao {
  return {
    basis: r.commission_basis as BaseComissao,
    type: r.commission_type as TipoComissao,
    value: Number(r.commission_value),
    currency: r.currency ?? null,
  };
}

/**
 * Resolve a regra aplicavel a um item: produto especifico > tipo de item > padrao da
 * escola. Retorna null quando nada cobre o item (a fatura exige comissao informada).
 */
export function resolverRegra(args: {
  kind: string | null | undefined;
  productId?: string | null;
  hoje: string;
  regras: RegraArmazenada[];
  padrao: RegraComissao | null;
}): RegraResolvida | null {
  const { kind, productId, hoje, regras, padrao } = args;
  if (productId) {
    const p = regras.find((r) => r.scope === "product" && r.product_id === productId && vigente(r, hoje));
    if (p) return { ...paraRegra(p), origem: "produto" };
  }
  if (kind) {
    const k = regras.find((r) => r.scope === "kind" && r.kind === kind && vigente(r, hoje));
    if (k) return { ...paraRegra(k), origem: "tipo" };
  }
  if (padrao) return { ...padrao, origem: "padrao" };
  return null;
}

/** Texto curto da regra: "25% sobre a mensalidade", "sem comissão", "US$ 300 por venda". */
export function descreverRegra(r: RegraComissao): string {
  if (r.basis === "none") return "sem comissão";
  const base = r.basis === "tuition" ? "a mensalidade" : r.basis === "tuition_plus_fees" ? "mensalidade + taxas" : "o valor total";
  if (r.type === "percent") return `${r.value}% sobre ${base}`;
  const moeda = r.currency ? `${r.currency} ` : "";
  return r.type === "fixed_per_sale" ? `${moeda}${r.value} por venda` : `${moeda}${r.value} por semana`;
}

export type EntradaRegra = {
  scope?: unknown;
  kind?: unknown;
  productId?: unknown;
  basis?: unknown;
  type?: unknown;
  value?: unknown;
  currency?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  notes?: unknown;
};

export type RegraNormalizada = {
  scope: "kind" | "product";
  kind: KindComissao | null;
  productId: string | null;
  basis: BaseComissao;
  type: TipoComissao;
  value: number;
  currency: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
};

function dataOpc(v: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, valor: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return { ok: false };
  const [y, m, d] = v.trim().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? { ok: true, valor: v.trim() } : { ok: false };
}

export function validarRegra(e: EntradaRegra): { ok: true; valor: RegraNormalizada } | { ok: false; erro: string } {
  if (e.scope !== "kind" && e.scope !== "product") return { ok: false, erro: "Escolha se a regra vale para um tipo de item ou para um produto." };
  let kind: KindComissao | null = null;
  let productId: string | null = null;
  if (e.scope === "kind") {
    if (typeof e.kind !== "string" || !(KINDS_COMISSAO as readonly string[]).includes(e.kind)) return { ok: false, erro: "Escolha o tipo de item." };
    kind = e.kind as KindComissao;
  } else {
    if (typeof e.productId !== "string" || !UUID.test(e.productId.trim())) return { ok: false, erro: "Escolha o produto." };
    productId = e.productId.trim();
  }
  if (typeof e.basis !== "string" || !BASES.includes(e.basis)) return { ok: false, erro: "Base da comissão inválida." };
  if (typeof e.type !== "string" || !TIPOS.includes(e.type)) return { ok: false, erro: "Tipo de comissão inválido." };
  const basis = e.basis as BaseComissao;
  const type = e.type as TipoComissao;
  let value = typeof e.value === "number" ? e.value : Number(String(e.value ?? "").replace(",", "."));
  if (basis === "none") value = 0;
  if (!Number.isFinite(value) || value < 0) return { ok: false, erro: "Valor da comissão inválido." };
  if (type === "percent" && value > 100) return { ok: false, erro: "O percentual não pode passar de 100%." };
  let currency: string | null = null;
  if (e.currency !== undefined && e.currency !== null && e.currency !== "") {
    const c = typeof e.currency === "string" ? e.currency.toUpperCase().trim() : "";
    if (!/^[A-Z]{3}$/.test(c)) return { ok: false, erro: "Moeda inválida (3 letras)." };
    currency = c;
  }
  if (type !== "percent" && basis !== "none" && !currency) return { ok: false, erro: "Informe a moeda do valor fixo." };
  const de = dataOpc(e.validFrom);
  const ate = dataOpc(e.validUntil);
  if (!de.ok) return { ok: false, erro: "Data de início inválida." };
  if (!ate.ok) return { ok: false, erro: "Data de fim inválida." };
  if (de.valor && ate.valor && ate.valor < de.valor) return { ok: false, erro: "O fim não pode ser antes do início." };
  const notes = typeof e.notes === "string" && e.notes.trim() ? e.notes.trim().slice(0, 500) : null;
  return { ok: true, valor: { scope: e.scope, kind, productId, basis, type, value, currency, validFrom: de.valor, validUntil: ate.valor, notes } };
}
