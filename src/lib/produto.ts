// Motor de validacao/normalizacao de PRODUTO do catalogo (admin write, todos os
// verticais). PURO — sem rede/DB/imports de runtime — para ser testado sem mocks
// e reutilizado pela rota admin e pela UI. Espelha o schema de `product` +
// tabelas de detalhe por `kind` (program/accommodation/insurance/other/package).
//
// Entrada: objeto cru (do corpo da requisicao). Saida: ou { ok:true, valor } com
// as linhas ja normalizadas em snake_case (prontas para o service persistir), ou
// { ok:false, falhas } com os campos invalidos. O motor NAO toca no banco nem
// resolve tenant/campus — quem chama injeta tenant_id/campus_id/actor.

// ── Vocabulario (espelha os checks do schema) ───────────────────────────────
export const KINDS = ["program", "accommodation", "insurance", "other", "package"] as const;
export type Kind = (typeof KINDS)[number];

export const SOURCES = ["internal", "supplier"] as const;
export const VISIBILITIES = ["hidden", "internal", "quotable", "sellable"] as const;
export const STATUSES = ["draft", "active", "inactive"] as const;
// default_unit nao tem check no banco, mas curamos uma lista para evitar typos
// que quebrariam o motor de preco. Uniao das unidades de cobranca + semana/mes.
export const UNITS = ["once", "day", "night", "week", "month", "person", "unit"] as const;

export const DELIVERY_METHODS = ["in_person", "online", "hybrid"] as const;
export const ACCOMMODATION_TYPES = [
  "homestay", "residence", "shared_apartment", "studio", "hotel", "other",
] as const;
export const ROOM_TYPES = ["private", "shared_2", "shared_3plus"] as const;
export const BATHROOM_TYPES = ["private", "shared"] as const;
export const MEAL_PLANS = ["none", "breakfast", "half_board", "full_board", "self_catering"] as const;
export const POLICY_UNITS = ["day", "week", "month"] as const;
export const CHARGE_UNITS = ["once", "day", "night", "week", "person", "unit"] as const;
export const PRICING_MODES = ["sum_of_items", "fixed_price"] as const;

// ── Resultado ───────────────────────────────────────────────────────────────
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

// Linha de `product` (core), sem tenant_id/campus_id/created_by — injetados pelo
// service. attributes e um jsonb livre (default {}).
export type ProdutoCore = {
  kind: Kind;
  name: string;
  internal_code: string | null;
  source: (typeof SOURCES)[number];
  visibility: (typeof VISIBILITIES)[number];
  status: (typeof STATUSES)[number];
  default_unit: string;
  min_duration: number | null;
  max_duration: number | null;
  available_from: string | null;
  available_until: string | null;
  attributes: Record<string, unknown>;
};

export type ProgramDetalhe = {
  education_type: string | null;
  subject: string | null;
  language: string | null;
  delivery_method: (typeof DELIVERY_METHODS)[number] | null;
  format: string | null;
  institution_type: string | null;
  grades: string[] | null;
  lessons_per_week: number | null;
  hours_per_week: number | null;
  is_pathway: boolean | null;
  includes_activities: boolean | null;
  timetable: Record<string, unknown> | null;
};

export type AccommodationDetalhe = {
  accommodation_type: (typeof ACCOMMODATION_TYPES)[number] | null;
  room_type: (typeof ROOM_TYPES)[number] | null;
  bathroom_type: (typeof BATHROOM_TYPES)[number] | null;
  meal_plan: (typeof MEAL_PLANS)[number] | null;
  distance_to_campus_minutes: number | null;
  check_in_weekday: number | null;
  check_out_weekday: number | null;
};

export type InsuranceDetalhe = {
  provider_name: string | null;
  coverage_summary: string | null;
  policy_unit: (typeof POLICY_UNITS)[number] | null;
  max_duration_days: number | null;
};

export type OtherDetalhe = {
  charge_unit: (typeof CHARGE_UNITS)[number];
  category: string | null;
};

export type PacoteItem = {
  item_product_id: string;
  quantity: number | null;
  unit: string | null;
  is_optional: boolean;
  sort: number;
};

export type PackageDetalhe = {
  valid_from: string | null;
  valid_until: string | null;
  pricing_mode: (typeof PRICING_MODES)[number];
  itens: PacoteItem[];
};

export type Detalhe =
  | { kind: "program"; program: ProgramDetalhe }
  | { kind: "accommodation"; accommodation: AccommodationDetalhe }
  | { kind: "insurance"; insurance: InsuranceDetalhe }
  | { kind: "other"; other: OtherDetalhe }
  | { kind: "package"; package: PackageDetalhe };

export type ProdutoNormalizado = { core: ProdutoCore; detalhe: Detalhe };

// ── Helpers puros de validacao ──────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// String obrigatoria e nao-vazia (trim). Vazio/ausente -> falha.
function reqStr(raw: unknown, campo: string, falhas: Falha[]): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) falhas.push({ campo, erro: "obrigatório" });
  return s;
}

// String opcional -> string | null (trim; vazio vira null).
function optStr(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s === "" ? null : s;
}

// Enum obrigatorio dentro de uma lista.
function reqEnum<T extends string>(raw: unknown, lista: readonly T[], campo: string, falhas: Falha[]): T | null {
  if (typeof raw === "string" && (lista as readonly string[]).includes(raw)) return raw as T;
  falhas.push({ campo, erro: `valor inválido (esperado: ${lista.join(", ")})` });
  return null;
}

// Enum opcional: ausente/null/"" -> null; presente invalido -> falha.
function optEnum<T extends string>(raw: unknown, lista: readonly T[], campo: string, falhas: Falha[]): T | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "string" && (lista as readonly string[]).includes(raw)) return raw as T;
  falhas.push({ campo, erro: `valor inválido (esperado: ${lista.join(", ")})` });
  return null;
}

// Inteiro opcional >= 0 (aceita number ou string numerica). Invalido -> falha.
function optIntNaoNeg(raw: unknown, campo: string, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    falhas.push({ campo, erro: "inteiro inválido (>= 0)" });
    return null;
  }
  return n;
}

// Numero opcional finito >= 0 (aceita number ou string numerica). Invalido -> falha.
function optNumNaoNeg(raw: unknown, campo: string, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    falhas.push({ campo, erro: "número inválido (>= 0)" });
    return null;
  }
  return n;
}

// Dia da semana opcional 0..6 (0=domingo).
function optWeekday(raw: unknown, campo: string, falhas: Falha[]): number | null {
  const n = optIntNaoNeg(raw, campo, falhas);
  if (n === null) return null;
  if (n > 6) {
    falhas.push({ campo, erro: "dia da semana inválido (0..6)" });
    return null;
  }
  return n;
}

// Booleano opcional (aceita bool, "true"/"false", 1/0). Ausente -> null.
function optBool(raw: unknown): boolean | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return null;
}

// Data opcional no formato ISO YYYY-MM-DD (valida calendario). Invalida -> falha.
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

// Lista de strings opcional (grades). Filtra vazios; ausente/nao-array -> null.
function optListaStr(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const arr = raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x !== "");
  return arr.length ? arr : null;
}

// ── Validacao por vertical ──────────────────────────────────────────────────
function validarPrograma(raw: Record<string, unknown>, falhas: Falha[]): ProgramDetalhe {
  return {
    education_type: optStr(raw.education_type),
    subject: optStr(raw.subject),
    language: optStr(raw.language),
    delivery_method: optEnum(raw.delivery_method, DELIVERY_METHODS, "delivery_method", falhas),
    format: optStr(raw.format),
    institution_type: optStr(raw.institution_type),
    grades: optListaStr(raw.grades),
    lessons_per_week: optIntNaoNeg(raw.lessons_per_week, "lessons_per_week", falhas),
    hours_per_week: optNumNaoNeg(raw.hours_per_week, "hours_per_week", falhas),
    is_pathway: optBool(raw.is_pathway),
    includes_activities: optBool(raw.includes_activities),
    timetable: isObj(raw.timetable) ? raw.timetable : null,
  };
}

function validarAcomodacao(raw: Record<string, unknown>, falhas: Falha[]): AccommodationDetalhe {
  return {
    accommodation_type: optEnum(raw.accommodation_type, ACCOMMODATION_TYPES, "accommodation_type", falhas),
    room_type: optEnum(raw.room_type, ROOM_TYPES, "room_type", falhas),
    bathroom_type: optEnum(raw.bathroom_type, BATHROOM_TYPES, "bathroom_type", falhas),
    meal_plan: optEnum(raw.meal_plan, MEAL_PLANS, "meal_plan", falhas),
    distance_to_campus_minutes: optIntNaoNeg(raw.distance_to_campus_minutes, "distance_to_campus_minutes", falhas),
    check_in_weekday: optWeekday(raw.check_in_weekday, "check_in_weekday", falhas),
    check_out_weekday: optWeekday(raw.check_out_weekday, "check_out_weekday", falhas),
  };
}

function validarSeguro(raw: Record<string, unknown>, falhas: Falha[]): InsuranceDetalhe {
  return {
    provider_name: optStr(raw.provider_name),
    coverage_summary: optStr(raw.coverage_summary),
    policy_unit: optEnum(raw.policy_unit, POLICY_UNITS, "policy_unit", falhas),
    max_duration_days: optIntNaoNeg(raw.max_duration_days, "max_duration_days", falhas),
  };
}

function validarOutro(raw: Record<string, unknown>, falhas: Falha[]): OtherDetalhe {
  // charge_unit e NOT NULL no banco -> obrigatorio aqui.
  const charge = reqEnum(raw.charge_unit, CHARGE_UNITS, "charge_unit", falhas);
  return {
    charge_unit: (charge ?? "once") as (typeof CHARGE_UNITS)[number],
    category: optStr(raw.category),
  };
}

function validarPacote(raw: Record<string, unknown>, falhas: Falha[]): PackageDetalhe {
  // pricing_mode e NOT NULL no banco -> obrigatorio aqui.
  const modo = reqEnum(raw.pricing_mode, PRICING_MODES, "pricing_mode", falhas);
  const validFrom = optData(raw.valid_from, "valid_from", falhas);
  const validUntil = optData(raw.valid_until, "valid_until", falhas);
  if (validFrom && validUntil && validFrom > validUntil) {
    falhas.push({ campo: "valid_until", erro: "deve ser >= valid_from" });
  }

  const itensRaw = Array.isArray(raw.itens) ? raw.itens : Array.isArray(raw.items) ? raw.items : [];
  const itens: PacoteItem[] = [];
  itensRaw.forEach((it, i) => {
    if (!isObj(it)) {
      falhas.push({ campo: `itens[${i}]`, erro: "item inválido" });
      return;
    }
    const itemId = reqStr(it.item_product_id, `itens[${i}].item_product_id`, falhas);
    const quantity = optNumNaoNeg(it.quantity, `itens[${i}].quantity`, falhas);
    const sort = optIntNaoNeg(it.sort, `itens[${i}].sort`, falhas) ?? i;
    itens.push({
      item_product_id: itemId,
      quantity,
      unit: optEnumUnit(it.unit),
      is_optional: optBool(it.is_optional) ?? false,
      sort,
    });
  });
  // sum_of_items sem nenhum item e um pacote vazio — provavelmente um engano.
  if (modo === "sum_of_items" && itens.length === 0) {
    falhas.push({ campo: "itens", erro: "pacote por soma exige ao menos um item" });
  }

  return { valid_from: validFrom, valid_until: validUntil, pricing_mode: (modo ?? "sum_of_items") as (typeof PRICING_MODES)[number], itens };
}

// unit do item do pacote: opcional; se vier, tem que ser uma unidade conhecida.
function optEnumUnit(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  return typeof raw === "string" && (UNITS as readonly string[]).includes(raw) ? raw : null;
}

// ── Entrada principal ───────────────────────────────────────────────────────
// Valida e normaliza o corpo de criacao/edicao de um produto. `kind` decide o
// bloco de detalhe; detalhes de outros verticais no corpo sao IGNORADOS (nunca
// gravamos o detalhe errado). campus_id e validado como presente (o banco exige
// NOT NULL); tenant_id/actor entram no service.
export function validarProduto(entrada: unknown): Resultado<ProdutoNormalizado & { campus_id: string }> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const raw = entrada;

  const kind = reqEnum(raw.kind, KINDS, "kind", falhas);
  const name = reqStr(raw.name, "name", falhas);
  const campusId = reqStr(raw.campus_id, "campus_id", falhas);

  const minDur = optIntNaoNeg(raw.min_duration, "min_duration", falhas);
  const maxDur = optIntNaoNeg(raw.max_duration, "max_duration", falhas);
  if (minDur !== null && maxDur !== null && minDur > maxDur) {
    falhas.push({ campo: "max_duration", erro: "deve ser >= min_duration" });
  }
  const from = optData(raw.available_from, "available_from", falhas);
  const until = optData(raw.available_until, "available_until", falhas);
  if (from && until && from > until) {
    falhas.push({ campo: "available_until", erro: "deve ser >= available_from" });
  }

  const core: ProdutoCore = {
    kind: (kind ?? "program") as Kind,
    name,
    internal_code: optStr(raw.internal_code),
    source: optEnum(raw.source, SOURCES, "source", falhas) ?? "internal",
    visibility: optEnum(raw.visibility, VISIBILITIES, "visibility", falhas) ?? "internal",
    status: optEnum(raw.status, STATUSES, "status", falhas) ?? "draft",
    default_unit: reqEnum(raw.default_unit ?? "week", UNITS, "default_unit", falhas) ?? "week",
    min_duration: minDur,
    max_duration: maxDur,
    available_from: from,
    available_until: until,
    attributes: isObj(raw.attributes) ? raw.attributes : {},
  };

  // Detalhe por vertical (so o do kind escolhido).
  const det = isObj(raw.detail) ? raw.detail : isObj(raw.detalhe) ? raw.detalhe : {};
  let detalhe: Detalhe;
  switch (core.kind) {
    case "program":
      detalhe = { kind: "program", program: validarPrograma(det, falhas) };
      break;
    case "accommodation":
      detalhe = { kind: "accommodation", accommodation: validarAcomodacao(det, falhas) };
      break;
    case "insurance":
      detalhe = { kind: "insurance", insurance: validarSeguro(det, falhas) };
      break;
    case "other":
      detalhe = { kind: "other", other: validarOutro(det, falhas) };
      break;
    case "package":
      detalhe = { kind: "package", package: validarPacote(det, falhas) };
      break;
    default:
      detalhe = { kind: "program", program: validarPrograma(det, falhas) };
  }

  if (falhas.length > 0) return { ok: false, falhas };
  return { ok: true, valor: { core, detalhe, campus_id: campusId } };
}
