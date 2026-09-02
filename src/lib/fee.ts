// Motor de validacao/normalizacao de TAXA (fee) do catalogo. PURO — sem
// rede/DB/imports de runtime — para ser testado sem mocks e reutilizado pela
// rota admin e pela UI. Espelha os checks do schema (fee + fee_product).
//
// Regra central (schema): fee_amount_xor_template — a taxa tem valor FIXO
// (amount) XOR valor DERIVADO de uma tabela de preco (price_template_id), nunca
// os dois nem nenhum. Alvo: applies_to_kinds (por tipo de produto) e/ou
// fee_product (produtos especificos) — exige-se ao menos um.
//
// Dinheiro: amount, quando informado, sempre > 0 (uma taxa fixa de zero e um
// engano — basta omiti-la), arredondado a centavos (numeric(14,2)).

// ── Vocabulario (espelha os checks do schema) ───────────────────────────────
export const FEE_TYPES = [
  "registration", "material", "bank", "placement", "service", "courier", "courier_of_documents", "custom",
] as const;
export const CHARGE_BASES = ["once_per_quote", "once_per_item", "per_unit", "per_person"] as const;
// Tipos de produto a que a taxa pode se aplicar (espelha product.kind).
export const FEE_APPLIES_KINDS = ["program", "accommodation", "insurance", "other", "package"] as const;

export type FeeType = (typeof FEE_TYPES)[number];
export type ChargeBasis = (typeof CHARGE_BASES)[number];

// ── Resultado ───────────────────────────────────────────────────────────────
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

// Linha de fee (sem tenant_id — injetado pelo service; source_submission_id NULL
// para a criada a mao). Exatamente um de amount/price_template_id e nao-nulo.
export type TaxaCore = {
  campus_id: string;
  name: string;
  fee_type: FeeType;
  charge_basis: ChargeBasis;
  amount: number | null;
  currency: string | null;
  price_template_id: string | null;
  is_refundable: boolean;
  is_mandatory: boolean;
  applies_to_kinds: string[];
  valid_from: string | null;
  valid_until: string | null;
};

export type TaxaNormalizada = { fee: TaxaCore; product_ids: string[] };

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

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Entrada principal ───────────────────────────────────────────────────────
export function validarTaxa(entrada: unknown): Resultado<TaxaNormalizada> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const raw = entrada;

  const campusId = reqStr(raw.campus_id, "campus_id", falhas);
  const name = reqStr(raw.name, "name", falhas);
  const feeType = reqEnum(raw.fee_type, FEE_TYPES, "fee_type", falhas);
  const chargeBasis = reqEnum(raw.charge_basis, CHARGE_BASES, "charge_basis", falhas);

  // XOR valor fixo vs derivado de tabela.
  const templateId = optStrOuNull(raw.price_template_id);
  const temAmount = raw.amount !== undefined && raw.amount !== null && raw.amount !== "";
  let amount: number | null = null;
  let currency: string | null = null;

  if (temAmount && templateId) {
    falhas.push({ campo: "amount", erro: "informe o valor fixo OU a tabela de preço, não os dois" });
  } else if (!temAmount && !templateId) {
    falhas.push({ campo: "amount", erro: "informe um valor fixo ou uma tabela de preço" });
  } else if (temAmount) {
    const n = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
    if (!Number.isFinite(n) || n <= 0) {
      falhas.push({ campo: "amount", erro: "valor inválido (> 0)" });
    } else {
      amount = centavos(n);
    }
    // Valor fixo exige moeda (3 letras).
    const cur = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(cur)) {
      falhas.push({ campo: "currency", erro: "moeda obrigatória para valor fixo (3 letras, ex.: BRL)" });
    } else {
      currency = cur;
    }
  }
  // Modo derivado de tabela: currency vem da tabela; nao exigimos aqui.

  // Alvo: applies_to_kinds (por tipo) e/ou product_ids (produtos). Ao menos um.
  const kindsRaw = Array.isArray(raw.applies_to_kinds) ? raw.applies_to_kinds : [];
  const kinds = Array.from(new Set(kindsRaw.map((x) => (typeof x === "string" ? x.trim() : ""))))
    .filter((x) => x !== "");
  for (const k of kinds) {
    if (!(FEE_APPLIES_KINDS as readonly string[]).includes(k)) {
      falhas.push({ campo: "applies_to_kinds", erro: `tipo inválido: ${k}` });
    }
  }
  const prodRaw = Array.isArray(raw.product_ids) ? raw.product_ids : [];
  const productIds = Array.from(new Set(prodRaw.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x !== "")));
  if (kinds.length === 0 && productIds.length === 0) {
    falhas.push({ campo: "applies_to_kinds", erro: "defina o alvo: ao menos um tipo de produto ou produtos específicos" });
  }

  const validFrom = optData(raw.valid_from, "valid_from", falhas);
  const validUntil = optData(raw.valid_until, "valid_until", falhas);
  if (validFrom && validUntil && validFrom > validUntil) {
    falhas.push({ campo: "valid_until", erro: "deve ser >= valid_from" });
  }

  if (falhas.length > 0) return { ok: false, falhas };

  const fee: TaxaCore = {
    campus_id: campusId,
    name,
    fee_type: feeType,
    charge_basis: chargeBasis,
    amount,
    currency,
    price_template_id: templateId,
    is_refundable: optBool(raw.is_refundable, false),
    is_mandatory: optBool(raw.is_mandatory, true),
    applies_to_kinds: kinds,
    valid_from: validFrom,
    valid_until: validUntil,
  };

  return { ok: true, valor: { fee, product_ids: productIds } };
}
