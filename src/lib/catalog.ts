// Helpers puros do modulo Catalogo (Marco 3 da spec de Catalogo/Preco/Cotacao).
//
// REGRAS INVIOLAVEIS (ver CLAUDE.md e spec secoes 3.3 e 3.5):
// - Funcoes PURAS: sem I/O, sem Supabase, sem next. Recebe objetos simples,
//   devolve objetos simples. Este arquivo nao importa nada local de proposito
//   (o runner node --test exige extensao .ts nos imports, mas o build rejeita
//   .ts em fonte; um unico arquivo sem imports locais evita o conflito).
// - A regra de negocio de preco pertence a lib/pricing; aqui ficam apenas a
//   resolucao de mercado (3.3) e a avaliacao de elegibilidade (3.5).
// - Identificadores/tipos/enums em INGLES (convencao da spec, secao 0);
//   comentarios em portugues.

// ---------------------------------------------------------------------------
// Mercados (spec 3.3)
// ---------------------------------------------------------------------------

/** Agrupamento nomeado de origem, usado em preco e promocao. */
export type Market = {
  id: string;
  name: string;
  /** Codigos de pais (ex.: 'BR', 'PT'). Comparacao case-insensitive. */
  countryCodes: string[];
  isDefault?: boolean;
};

/**
 * Resolve o mercado aplicavel dado o codigo de nacionalidade do estudante.
 *
 * Regra (spec 3.3): o primeiro market cujo countryCodes contem o codigo; se
 * nenhum casar, usa o market com isDefault=true; se nao houver, null. Quando o
 * codigo esta ausente, tenta direto o default. Comparacao case-insensitive.
 */
export function resolveMarket(
  nationalityCode: string | undefined,
  markets: Market[],
): Market | null {
  const defaultMarket = markets.find((m) => m.isDefault === true) ?? null;

  if (nationalityCode == null || nationalityCode.trim() === "") {
    return defaultMarket;
  }

  const code = nationalityCode.trim().toLowerCase();
  const matched = markets.find((m) =>
    m.countryCodes.some((c) => c.trim().toLowerCase() === code),
  );

  return matched ?? defaultMarket;
}

// ---------------------------------------------------------------------------
// Elegibilidade (spec 3.5)
// ---------------------------------------------------------------------------

export type EligibilityAttribute =
  | "age_at_start"
  | "nationality"
  | "residence_country"
  | "language_level"
  | "education_level"
  | "onshore_status"
  | "has_visa";

export type EligibilityOperator =
  | "between"
  | "in"
  | "not_in"
  | "gte"
  | "lte"
  | "eq";

/**
 * Regra de elegibilidade. Regras com o mesmo groupIndex combinam com E; grupos
 * diferentes combinam com OU (spec 3.5). isBlocking=true faz a falha impedir a
 * emissao da cotacao (spec 4.2); do contrario a falha e apenas um aviso.
 */
export type EligibilityRule = {
  groupIndex: number;
  attribute: EligibilityAttribute;
  operator: EligibilityOperator;
  value: unknown;
  isBlocking?: boolean;
};

/** Contexto do estudante avaliado. Datas em ISO 'YYYY-MM-DD'. */
export type StudentContext = {
  nationalityCode?: string;
  residenceCountryCode?: string;
  birthDate?: string;
  onshoreStatus?: "onshore" | "offshore";
  languageLevel?: string;
  educationLevel?: string;
  hasVisa?: boolean;
};

export type EligibilityResult = {
  eligible: boolean;
  blocking: boolean;
  failedGroups: number[];
};

/**
 * Calcula a idade em anos completos na data de referencia. Retorna null quando
 * faltar a data de nascimento ou a data de referencia (nao da para comprovar).
 */
function ageAtStart(
  birthDate: string | undefined,
  startDate: string | undefined,
): number | null {
  if (!birthDate || !startDate) return null;

  const birth = parseIsoDate(birthDate);
  const start = parseIsoDate(startDate);
  if (!birth || !start) return null;

  let age = start.year - birth.year;
  // Ainda nao fez aniversario no ano da data de inicio: subtrai um.
  if (
    start.month < birth.month ||
    (start.month === birth.month && start.day < birth.day)
  ) {
    age -= 1;
  }
  return age;
}

/** Interpreta 'YYYY-MM-DD' sem depender de fuso (evita drift de Date). */
function parseIsoDate(
  iso: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

/** Extrai o valor do contexto para o atributo. undefined = nao comprovavel. */
function contextValue(
  attribute: EligibilityAttribute,
  context: StudentContext,
  startDate: string | undefined,
): string | number | boolean | undefined {
  switch (attribute) {
    case "age_at_start":
      return ageAtStart(context.birthDate, startDate) ?? undefined;
    case "nationality":
      return context.nationalityCode;
    case "residence_country":
      return context.residenceCountryCode;
    case "language_level":
      return context.languageLevel;
    case "education_level":
      return context.educationLevel;
    case "onshore_status":
      return context.onshoreStatus;
    case "has_visa":
      return context.hasVisa;
  }
}

/** Normaliza para comparacao de string (case-insensitive, sem espacos). */
function normStr(v: unknown): string {
  return String(v).trim().toLowerCase();
}

/** Avalia uma unica regra. Valor ausente no contexto => falha (nao comprovavel). */
function evaluateRule(
  rule: EligibilityRule,
  context: StudentContext,
  startDate: string | undefined,
): boolean {
  const actual = contextValue(rule.attribute, context, startDate);
  if (actual === undefined) return false;

  const isNumeric = rule.attribute === "age_at_start";
  const isBoolean = rule.attribute === "has_visa";

  switch (rule.operator) {
    case "between": {
      if (!Array.isArray(rule.value) || rule.value.length < 2) return false;
      const min = Number(rule.value[0]);
      const max = Number(rule.value[1]);
      const n = Number(actual);
      return n >= min && n <= max;
    }
    case "in": {
      if (!Array.isArray(rule.value)) return false;
      if (isBoolean) return rule.value.some((v) => Boolean(v) === actual);
      if (isNumeric) return rule.value.some((v) => Number(v) === Number(actual));
      return rule.value.some((v) => normStr(v) === normStr(actual));
    }
    case "not_in": {
      if (!Array.isArray(rule.value)) return false;
      if (isBoolean) return !rule.value.some((v) => Boolean(v) === actual);
      if (isNumeric)
        return !rule.value.some((v) => Number(v) === Number(actual));
      return !rule.value.some((v) => normStr(v) === normStr(actual));
    }
    case "gte":
      return Number(actual) >= Number(rule.value);
    case "lte":
      return Number(actual) <= Number(rule.value);
    case "eq":
      if (isBoolean) return actual === Boolean(rule.value);
      if (isNumeric) return Number(actual) === Number(rule.value);
      return normStr(actual) === normStr(rule.value);
  }
}

/**
 * Avalia a elegibilidade do estudante contra o conjunto de regras (spec 3.5).
 *
 * - Sem regras => elegivel, nao bloqueante.
 * - Regras com o mesmo groupIndex combinam com E; grupos diferentes com OU.
 * - eligible = existe ao menos um grupo cujo E inteiro passa.
 * - blocking = NAO elegivel E alguma regra que falhou tem isBlocking=true
 *   (elegibilidade que falha vira aviso; so bloqueia se marcada bloqueante).
 * - failedGroups = indices dos grupos que nao passaram (para diagnostico).
 */
export function evaluateEligibility(
  rules: EligibilityRule[],
  context: StudentContext,
  startDate?: string,
): EligibilityResult {
  if (rules.length === 0) {
    return { eligible: true, blocking: false, failedGroups: [] };
  }

  // Agrupa por groupIndex preservando a ordem de aparicao dos grupos.
  const groups = new Map<number, EligibilityRule[]>();
  for (const rule of rules) {
    const arr = groups.get(rule.groupIndex);
    if (arr) arr.push(rule);
    else groups.set(rule.groupIndex, [rule]);
  }

  const failedGroups: number[] = [];
  const failedRules: EligibilityRule[] = [];
  let anyGroupPassed = false;

  for (const [groupIndex, groupRules] of groups) {
    const localFailures = groupRules.filter(
      (r) => !evaluateRule(r, context, startDate),
    );
    if (localFailures.length === 0) {
      anyGroupPassed = true;
    } else {
      failedGroups.push(groupIndex);
      failedRules.push(...localFailures);
    }
  }

  const eligible = anyGroupPassed;
  const blocking = !eligible && failedRules.some((r) => r.isBlocking === true);

  return { eligible, blocking, failedGroups };
}
