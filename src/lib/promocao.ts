// Motor de validacao/normalizacao de PROMOCAO do catalogo. PURO — sem
// rede/DB/imports de runtime — para ser testado sem mocks e reutilizado pela rota
// admin e pela UI. Espelha os checks do schema (promotion + promotion_target).
//
// A promocao e SEMPRE autoral do Admin (nao ha source_submission_id): escopada
// por fornecedor (supplier_id NOT NULL) e, opcionalmente, por campus. O motor de
// preco (src/lib/pricing.ts) consome estas colunas; aqui so validamos/normalizamos.
//
// Dinheiro: `value` e numeric(14,4); seu significado e obrigatoriedade dependem
// do promo_type (ver abaixo). max_discount_amount e numeric(14,2) (teto).

// ── Vocabulario (espelha os checks do schema) ───────────────────────────────
export const PROMO_TYPES = [
  "percent_off", "fixed_off", "free_units", "waive_fee", "free_product", "override_price",
] as const;
export const FREE_UNITS_SEMANTICS = ["bonus_on_top", "discount_on_booked"] as const;
export const APPLIES_TO = [
  "tuition", "accommodation", "insurance", "fees", "specific_fee", "total", "specific_product",
] as const;
export const TARGET_DIMENSIONS = ["market", "nationality", "campus", "partner", "product", "education_type"] as const;
export const PROMO_STATUSES = ["draft", "active", "expired"] as const;

export type PromoType = (typeof PROMO_TYPES)[number];
export type AppliesTo = (typeof APPLIES_TO)[number];
export type TargetDimension = (typeof TARGET_DIMENSIONS)[number];
export type PromoStatus = (typeof PROMO_STATUSES)[number];

// ── Resultado ───────────────────────────────────────────────────────────────
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

// Linha de promotion (sem tenant_id — injetado pelo service).
export type PromocaoCore = {
  supplier_id: string;
  campus_id: string | null;
  name: string;
  promo_type: PromoType;
  value: number | null;
  free_units_semantics: (typeof FREE_UNITS_SEMANTICS)[number] | null;
  applies_to: AppliesTo;
  applies_to_ref_id: string | null;
  min_quantity: number | null;
  max_discount_amount: number | null;
  is_stackable: boolean;
  priority: number;
  booking_from: string | null;
  booking_until: string | null;
  travel_from: string | null;
  travel_until: string | null;
  status: PromoStatus;
};

export type TargetNorm = { dimension: TargetDimension; value: string };

export type PromocaoNormalizada = { promotion: PromocaoCore; targets: TargetNorm[] };

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

function optEnum<T extends string>(raw: unknown, lista: readonly T[], campo: string, falhas: Falha[]): T | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "string" && (lista as readonly string[]).includes(raw)) return raw as T;
  falhas.push({ campo, erro: `valor inválido (esperado: ${lista.join(", ")})` });
  return null;
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

function optNumNaoNeg(raw: unknown, campo: string, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    falhas.push({ campo, erro: "número inválido (>= 0)" });
    return null;
  }
  return n;
}

function optData(raw: unknown, campo: string, falhas: Falha[]): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    falhas.push({ campo, erro: "data inválida (use YYYY-MM-DD)" });
    return null;
  }
  const [a, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    falhas.push({ campo, erro: "data inexistente no calendário" });
    return null;
  }
  return raw;
}

function optBool(raw: unknown, def: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return def;
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Tipos que EXIGEM `value` (numerico > 0). waive_fee/free_product nao usam value.
const EXIGEM_VALUE: readonly PromoType[] = ["percent_off", "fixed_off", "free_units", "override_price"];
// applies_to que EXIGEM um ref_id (o alvo especifico).
const EXIGEM_REF: readonly AppliesTo[] = ["specific_fee", "specific_product"];

// ── Entrada principal ───────────────────────────────────────────────────────
export function validarPromocao(entrada: unknown): Resultado<PromocaoNormalizada> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const raw = entrada;

  const supplierId = reqStr(raw.supplier_id, "supplier_id", falhas);
  const campusId = optStrOuNull(raw.campus_id);
  const name = reqStr(raw.name, "name", falhas);
  const promoType = reqEnum(raw.promo_type, PROMO_TYPES, "promo_type", falhas);
  const appliesTo = reqEnum(raw.applies_to, APPLIES_TO, "applies_to", falhas);
  const status = raw.status == null || raw.status === "" ? "draft" : reqEnum(raw.status, PROMO_STATUSES, "status", falhas);

  // value: obrigatorio (>0) para os tipos que descontam por numero; ignorado nos
  // demais (waive_fee/free_product) — normalizado para null.
  let value: number | null = null;
  if (EXIGEM_VALUE.includes(promoType)) {
    const n = typeof raw.value === "number" ? raw.value : Number(raw.value);
    if (raw.value === undefined || raw.value === null || raw.value === "" || !Number.isFinite(n) || n <= 0) {
      falhas.push({ campo: "value", erro: "valor obrigatório (> 0) para este tipo de promoção" });
    } else if (promoType === "percent_off" && n > 100) {
      falhas.push({ campo: "value", erro: "percentual não pode passar de 100" });
    } else {
      value = round4(n);
    }
  }

  // free_units_semantics: obrigatorio para free_units; senao null.
  let semantics: (typeof FREE_UNITS_SEMANTICS)[number] | null = null;
  if (promoType === "free_units") {
    semantics = reqEnum(raw.free_units_semantics, FREE_UNITS_SEMANTICS, "free_units_semantics", falhas);
  }

  // applies_to_ref_id: obrigatorio quando o alvo e especifico (taxa/produto).
  let refId: string | null = optStrOuNull(raw.applies_to_ref_id);
  if (EXIGEM_REF.includes(appliesTo) && !refId) {
    falhas.push({ campo: "applies_to_ref_id", erro: "informe o alvo específico (taxa ou produto)" });
  }
  if (!EXIGEM_REF.includes(appliesTo)) {
    refId = null; // ref so faz sentido para specific_fee/specific_product
  }

  const minQuantity = optIntNaoNeg(raw.min_quantity, "min_quantity", falhas);
  const maxDiscountRaw = optNumNaoNeg(raw.max_discount_amount, "max_discount_amount", falhas);
  const maxDiscount = maxDiscountRaw === null ? null : round2(maxDiscountRaw);
  const priority = optIntNaoNeg(raw.priority, "priority", falhas) ?? 100;

  const bookingFrom = optData(raw.booking_from, "booking_from", falhas);
  const bookingUntil = optData(raw.booking_until, "booking_until", falhas);
  if (bookingFrom && bookingUntil && bookingFrom > bookingUntil) {
    falhas.push({ campo: "booking_until", erro: "deve ser >= booking_from" });
  }
  const travelFrom = optData(raw.travel_from, "travel_from", falhas);
  const travelUntil = optData(raw.travel_until, "travel_until", falhas);
  if (travelFrom && travelUntil && travelFrom > travelUntil) {
    falhas.push({ campo: "travel_until", erro: "deve ser >= travel_from" });
  }

  // Segmentacao (targets): dimensao valida + valor nao-vazio; deduplicado.
  const targetsRaw = Array.isArray(raw.targets) ? raw.targets : [];
  const vistos = new Set<string>();
  const targets: TargetNorm[] = [];
  targetsRaw.forEach((t, i) => {
    if (!isObj(t)) {
      falhas.push({ campo: `targets[${i}]`, erro: "segmento inválido" });
      return;
    }
    const dim = optEnum(t.dimension, TARGET_DIMENSIONS, `targets[${i}].dimension`, falhas);
    const val = typeof t.value === "string" ? t.value.trim() : "";
    if (!val) falhas.push({ campo: `targets[${i}].value`, erro: "valor do segmento obrigatório" });
    if (dim && val) {
      const chave = `${dim}::${val}`;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        targets.push({ dimension: dim, value: val });
      }
    }
  });

  if (falhas.length > 0) return { ok: false, falhas };

  const promotion: PromocaoCore = {
    supplier_id: supplierId,
    campus_id: campusId,
    name,
    promo_type: promoType,
    value,
    free_units_semantics: semantics,
    applies_to: appliesTo,
    applies_to_ref_id: refId,
    min_quantity: minQuantity,
    max_discount_amount: maxDiscount,
    is_stackable: optBool(raw.is_stackable, false),
    priority,
    booking_from: bookingFrom,
    booking_until: bookingUntil,
    travel_from: travelFrom,
    travel_until: travelUntil,
    status,
  };

  return { ok: true, valor: { promotion, targets } };
}
