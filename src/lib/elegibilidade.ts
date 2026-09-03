// Motor de validacao/normalizacao das REGRAS DE ELEGIBILIDADE de um produto.
// PURO — sem rede/DB/imports de runtime — para ser testado sem mocks e
// reutilizado pela rota admin e pela UI. Espelha os checks do schema
// (eligibility_rule) e a semantica do avaliador src/lib/catalog.ts
// (evaluateEligibility): mesmo group_index = E; grupos diferentes = OU.
//
// O `value` e jsonb e seu FORMATO depende do operador e do atributo:
//  - between: [min, max] numericos (so faz sentido para age_at_start), min<=max
//  - in / not_in: lista nao-vazia (numeros para age; senao strings)
//  - gte / lte: escalar numerico (so age_at_start)
//  - eq: escalar — booleano para has_visa; 'onshore'/'offshore' para onshore_status;
//        numero para age_at_start; senao string
// Aqui validamos e normalizamos o value para a forma canonica que o avaliador espera.

// ── Vocabulario (espelha os checks do schema e os tipos de catalog.ts) ───────
export const ELIG_ATTRIBUTES = [
  "age_at_start", "nationality", "residence_country", "language_level", "education_level", "onshore_status", "has_visa",
] as const;
export const ELIG_OPERATORS = ["between", "in", "not_in", "gte", "lte", "eq"] as const;
export const ONSHORE_VALUES = ["onshore", "offshore"] as const;

export type EligAttribute = (typeof ELIG_ATTRIBUTES)[number];
export type EligOperator = (typeof ELIG_OPERATORS)[number];

// ── Resultado ───────────────────────────────────────────────────────────────
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

export type RegraNorm = {
  group_index: number;
  attribute: EligAttribute;
  operator: EligOperator;
  value: unknown; // ja normalizado (array ou escalar) para o jsonb
  is_blocking: boolean;
};

export type ElegibilidadeNormalizada = { product_id: string; regras: RegraNorm[] };

// ── Helpers puros ───────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function reqStr(raw: unknown, campo: string, falhas: Falha[]): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) falhas.push({ campo, erro: "obrigatório" });
  return s;
}

function reqEnum<T extends string>(raw: unknown, lista: readonly T[], campo: string, falhas: Falha[]): T {
  if (typeof raw === "string" && (lista as readonly string[]).includes(raw)) return raw as T;
  falhas.push({ campo, erro: `valor inválido (esperado: ${lista.join(", ")})` });
  return lista[0];
}

function optIntNaoNeg(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function optBool(raw: unknown, def: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return def;
}

function ehBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return null;
}

function ehNum(raw: unknown): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Normaliza o `value` conforme atributo + operador. Empurra falhas em `campo`.
function normalizarValor(
  attribute: EligAttribute,
  operator: EligOperator,
  raw: unknown,
  campo: string,
  falhas: Falha[],
): unknown {
  const numerico = attribute === "age_at_start";
  const booleano = attribute === "has_visa";
  const onshore = attribute === "onshore_status";

  // has_visa: so eq booleano.
  if (booleano) {
    if (operator !== "eq") {
      falhas.push({ campo, erro: "has_visa só aceita o operador 'eq'" });
      return null;
    }
    const b = ehBool(raw);
    if (b === null) {
      falhas.push({ campo, erro: "valor booleano obrigatório (sim/não)" });
      return null;
    }
    return b;
  }

  switch (operator) {
    case "between": {
      if (!numerico) {
        falhas.push({ campo, erro: "'between' só se aplica a age_at_start" });
        return null;
      }
      const arr = Array.isArray(raw) ? raw : [];
      if (arr.length !== 2) {
        falhas.push({ campo, erro: "informe [mínimo, máximo]" });
        return null;
      }
      const a = ehNum(arr[0]);
      const b = ehNum(arr[1]);
      if (a === null || b === null) {
        falhas.push({ campo, erro: "mínimo e máximo devem ser números" });
        return null;
      }
      if (a > b) {
        falhas.push({ campo, erro: "mínimo deve ser <= máximo" });
        return null;
      }
      return [a, b];
    }
    case "gte":
    case "lte": {
      if (!numerico) {
        falhas.push({ campo, erro: `'${operator}' só se aplica a age_at_start` });
        return null;
      }
      const n = ehNum(raw);
      if (n === null) {
        falhas.push({ campo, erro: "valor numérico obrigatório" });
        return null;
      }
      return n;
    }
    case "in":
    case "not_in": {
      const arr = Array.isArray(raw) ? raw : [];
      if (arr.length === 0) {
        falhas.push({ campo, erro: "informe ao menos um valor na lista" });
        return null;
      }
      if (numerico) {
        const nums = arr.map((x) => ehNum(x));
        if (nums.some((n) => n === null)) {
          falhas.push({ campo, erro: "todos os valores devem ser números" });
          return null;
        }
        return nums;
      }
      const strs = Array.from(new Set(arr.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x !== "")));
      if (strs.length === 0) {
        falhas.push({ campo, erro: "informe ao menos um valor na lista" });
        return null;
      }
      if (onshore && strs.some((v) => !(ONSHORE_VALUES as readonly string[]).includes(v))) {
        falhas.push({ campo, erro: "onshore_status aceita apenas 'onshore'/'offshore'" });
        return null;
      }
      return strs;
    }
    case "eq": {
      if (numerico) {
        const n = ehNum(raw);
        if (n === null) {
          falhas.push({ campo, erro: "valor numérico obrigatório" });
          return null;
        }
        return n;
      }
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) {
        falhas.push({ campo, erro: "valor obrigatório" });
        return null;
      }
      if (onshore && !(ONSHORE_VALUES as readonly string[]).includes(s)) {
        falhas.push({ campo, erro: "onshore_status aceita apenas 'onshore'/'offshore'" });
        return null;
      }
      return s;
    }
    default:
      falhas.push({ campo, erro: "operador inválido" });
      return null;
  }
}

// ── Entrada principal ───────────────────────────────────────────────────────
// Valida o conjunto de regras de UM produto. entrada = { product_id, regras: [...] }.
// Um conjunto VAZIO e valido (produto sem restricao de elegibilidade).
export function validarElegibilidade(entrada: unknown): Resultado<ElegibilidadeNormalizada> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const productId = reqStr(entrada.product_id, "product_id", falhas);

  const regrasRaw = Array.isArray(entrada.regras) ? entrada.regras : [];
  const regras: RegraNorm[] = [];
  regrasRaw.forEach((r, i) => {
    if (!isObj(r)) {
      falhas.push({ campo: `regras[${i}]`, erro: "regra inválida" });
      return;
    }
    const attribute = reqEnum(r.attribute, ELIG_ATTRIBUTES, `regras[${i}].attribute`, falhas);
    const operator = reqEnum(r.operator, ELIG_OPERATORS, `regras[${i}].operator`, falhas);
    const groupIndex = optIntNaoNeg(r.group_index);
    const isBlocking = optBool(r.is_blocking, false);
    const value = normalizarValor(attribute, operator, r.value, `regras[${i}].value`, falhas);
    if (value !== null) {
      regras.push({ group_index: groupIndex, attribute, operator, value, is_blocking: isBlocking });
    }
  });

  if (falhas.length > 0) return { ok: false, falhas };
  return { ok: true, valor: { product_id: productId, regras } };
}
