// Motor de validacao/normalizacao de TABELA DE PRECO manual (price_template +
// price_tier + vinculo a produtos). PURO — sem rede/DB/imports de runtime — para
// ser testado sem mocks e reutilizado pela rota admin e pela UI. Espelha os
// checks do schema (price_template, price_tier, price_template_product).
//
// Semantica de faixa (tier): guardada pelo LIMITE INFERIOR (min_quantity); nao ha
// max — a proxima faixa (min_quantity maior) define o teto da anterior. Por isso
// os min_quantity precisam ser UNICOS e a primeira faixa ancora o preco base.
//
// Dinheiro: unit_price sempre > 0 (uma faixa com preco zero/negativo e invalida);
// normalizado para 2 casas (a coluna e numeric(14,2)).

// ── Vocabulario (espelha os checks do schema) ───────────────────────────────
export const PRICE_BASES = ["duration", "quantity", "fixed", "per_person"] as const;
export const DURATION_TYPES = ["flexible", "fixed_sessions"] as const;
export const TEMPLATE_STATUSES = ["draft", "active", "expired"] as const;

export type PriceBasis = (typeof PRICE_BASES)[number];
export type DurationType = (typeof DURATION_TYPES)[number];
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

// ── Resultado ───────────────────────────────────────────────────────────────
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

// Linha de price_template (sem tenant_id — injetado pelo service; source_submission_id
// fica NULL para o criado a mao, e nunca e expirado pelo supersede).
export type TemplateCore = {
  campus_id: string;
  name: string;
  price_basis: PriceBasis;
  duration_type: DurationType;
  unit: string;
  currency: string;
  min_quantity: number | null;
  max_quantity: number | null;
  charge_in_tiers: boolean;
  market_id: string | null;
  valid_from: string;
  valid_until: string | null;
  status: TemplateStatus;
};

export type TierNorm = { min_quantity: number; unit_price: number; sort: number };

export type TabelaPrecoNormalizada = {
  template: TemplateCore;
  tiers: TierNorm[];
  product_ids: string[];
};

// ── Helpers puros ───────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function reqStr(raw: unknown, campo: string, falhas: Falha[]): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) falhas.push({ campo, erro: "obrigatório" });
  return s;
}

function optStrOuNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s === "" ? null : s;
}

function reqEnum<T extends string>(raw: unknown, lista: readonly T[], campo: string, falhas: Falha[]): T {
  if (typeof raw === "string" && (lista as readonly string[]).includes(raw)) return raw as T;
  falhas.push({ campo, erro: `valor inválido (esperado: ${lista.join(", ")})` });
  return lista[0];
}

// Moeda: 3 letras A-Z (ISO 4217), normalizada em maiuscula.
function reqCurrency(raw: unknown, falhas: Falha[]): string {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(s)) {
    falhas.push({ campo: "currency", erro: "moeda inválida (3 letras, ex.: BRL, USD)" });
    return "";
  }
  return s;
}

function optIntNaoNeg(raw: unknown, campo: string, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    falhas.push({ campo, erro: "inteiro inválido (>= 0)" });
    return null;
  }
  return n;
}

function reqData(raw: unknown, campo: string, falhas: Falha[]): string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    falhas.push({ campo, erro: "data obrigatória (YYYY-MM-DD)" });
    return "";
  }
  const [a, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    falhas.push({ campo, erro: "data inexistente no calendário" });
    return "";
  }
  return raw;
}

function optData(raw: unknown, campo: string, falhas: Falha[]): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  return reqData(raw, campo, falhas) || null;
}

function optBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  return false;
}

// Arredonda para centavos (numeric(14,2)).
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Entrada principal ───────────────────────────────────────────────────────
// Valida e normaliza o corpo de criacao/edicao de uma tabela de preco. tenant_id
// e injetado pelo service; a posse de campus/produtos e conferida la (aqui so
// validamos formato/coerencia).
export function validarTabelaPreco(entrada: unknown): Resultado<TabelaPrecoNormalizada> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const raw = entrada;

  const campusId = reqStr(raw.campus_id, "campus_id", falhas);
  const name = reqStr(raw.name, "name", falhas);
  const priceBasis = reqEnum(raw.price_basis, PRICE_BASES, "price_basis", falhas);
  const durationType = raw.duration_type == null || raw.duration_type === ""
    ? "flexible"
    : reqEnum(raw.duration_type, DURATION_TYPES, "duration_type", falhas);
  const unit = reqStr(raw.unit, "unit", falhas);
  const currency = reqCurrency(raw.currency, falhas);
  const status = raw.status == null || raw.status === ""
    ? "draft"
    : reqEnum(raw.status, TEMPLATE_STATUSES, "status", falhas);

  const minQ = optIntNaoNeg(raw.min_quantity, "min_quantity", falhas);
  const maxQ = optIntNaoNeg(raw.max_quantity, "max_quantity", falhas);
  if (minQ !== null && maxQ !== null && minQ > maxQ) {
    falhas.push({ campo: "max_quantity", erro: "deve ser >= min_quantity" });
  }

  const validFrom = reqData(raw.valid_from, "valid_from", falhas);
  const validUntil = optData(raw.valid_until, "valid_until", falhas);
  if (validFrom && validUntil && validFrom > validUntil) {
    falhas.push({ campo: "valid_until", erro: "deve ser >= valid_from" });
  }

  // Produtos vinculados: ao menos um (a tabela precisa mirar um produto para
  // valer numa cotacao). A posse (mesmo tenant) e conferida no service.
  const prodRaw = Array.isArray(raw.product_ids) ? raw.product_ids : [];
  const productIds = Array.from(
    new Set(prodRaw.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x !== "")),
  );
  if (productIds.length === 0) {
    falhas.push({ campo: "product_ids", erro: "vincule ao menos um produto" });
  }

  // Faixas: ao menos uma; min_quantity unico; unit_price > 0. Ordenadas por
  // min_quantity crescente e reindexadas (sort).
  const tiersRaw = Array.isArray(raw.tiers) ? raw.tiers : [];
  const vistos = new Set<number>();
  const tiersTmp: { min_quantity: number; unit_price: number }[] = [];
  tiersRaw.forEach((t, i) => {
    if (!isObj(t)) {
      falhas.push({ campo: `tiers[${i}]`, erro: "faixa inválida" });
      return;
    }
    const mq = optIntNaoNeg(t.min_quantity, `tiers[${i}].min_quantity`, falhas);
    const upRaw = typeof t.unit_price === "number" ? t.unit_price : Number(t.unit_price);
    if (!Number.isFinite(upRaw) || upRaw <= 0) {
      falhas.push({ campo: `tiers[${i}].unit_price`, erro: "preço inválido (> 0)" });
    }
    if (mq !== null) {
      if (vistos.has(mq)) {
        falhas.push({ campo: `tiers[${i}].min_quantity`, erro: "faixa duplicada (min_quantity repetido)" });
      } else {
        vistos.add(mq);
      }
      if (Number.isFinite(upRaw) && upRaw > 0) {
        tiersTmp.push({ min_quantity: mq, unit_price: centavos(upRaw) });
      }
    }
  });
  if (tiersRaw.length === 0) {
    falhas.push({ campo: "tiers", erro: "informe ao menos uma faixa de preço" });
  }

  if (falhas.length > 0) return { ok: false, falhas };

  const tiers: TierNorm[] = tiersTmp
    .sort((a, b) => a.min_quantity - b.min_quantity)
    .map((t, i) => ({ ...t, sort: i }));

  const template: TemplateCore = {
    campus_id: campusId,
    name,
    price_basis: priceBasis,
    duration_type: durationType,
    unit,
    currency,
    min_quantity: minQ,
    max_quantity: maxQ,
    charge_in_tiers: optBool(raw.charge_in_tiers),
    market_id: optStrOuNull(raw.market_id),
    valid_from: validFrom,
    valid_until: validUntil,
    status,
  };

  return { ok: true, valor: { template, tiers, product_ids: productIds } };
}
