// Motor de validacao/normalizacao de CAMPUS (unidade/escola de um fornecedor).
// PURO — sem rede/DB/imports de runtime — para ser testado sem mocks e reutilizado
// pela rota admin e pela UI. Espelha os checks do schema (tabela campus):
// name/country_code(2)/city/timezone/base_currency(3) obrigatorios; status em
// draft|active|inactive.
//
// Regra de negocio que vem do banco: existe UM indice unico parcial
// (idx_campus_supplier_draft) que permite so 1 campus em RASCUNHO por fornecedor.
// Por isso um campus criado pelo admin nasce 'active' por padrao; o conflito de
// rascunho duplicado e tratado no servico (codigo do Postgres 23505).

// ── Vocabulario (espelha os checks do schema) ───────────────────────────────
export const CAMPUS_STATUSES = ["draft", "active", "inactive"] as const;
export type CampusStatus = (typeof CAMPUS_STATUSES)[number];

// Sugestoes para a UI (datalist) — livre, nao restringe o valor.
export const MOEDAS_COMUNS = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "BRL", "CHF", "ZAR", "IEP", "MYT"] as const;
export const FUSOS_COMUNS = [
  "UTC",
  "America/Toronto",
  "America/Vancouver",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Valletta",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Seoul",
] as const;

export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

export type CampusNormalizado = {
  name: string;
  country_code: string; // ISO-2, maiusculo
  region: string | null;
  city: string;
  address: string | null;
  postal_code: string | null;
  timezone: string;
  base_currency: string; // ISO-3, maiusculo
  phone: string | null;
  email: string | null;
  website: string | null;
  status: CampusStatus;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function reqStr(raw: unknown, campo: string, falhas: Falha[], max = 200): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) {
    falhas.push({ campo, erro: "obrigatório" });
    return "";
  }
  if (s.length > max) {
    falhas.push({ campo, erro: `no máximo ${max} caracteres` });
    return s.slice(0, max);
  }
  return s;
}

function optStr(raw: unknown, campo: string, falhas: Falha[], max = 300): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    falhas.push({ campo, erro: "texto inválido" });
    return null;
  }
  const s = raw.trim();
  if (!s) return null;
  if (s.length > max) {
    falhas.push({ campo, erro: `no máximo ${max} caracteres` });
    return s.slice(0, max);
  }
  return s;
}

function reqEnum<T extends string>(raw: unknown, opcoes: readonly T[], campo: string, falhas: Falha[]): T {
  if (typeof raw === "string" && (opcoes as readonly string[]).includes(raw)) return raw as T;
  falhas.push({ campo, erro: `valor inválido (use: ${opcoes.join(", ")})` });
  return opcoes[0];
}

// Fusos IANA conhecidos pelo runtime (cache preguicoso). Se o runtime nao expuser
// supportedValuesOf (muito antigo), aceita o que passou no gate estrutural.
let fusosCache: Set<string> | null = null;
function fusoConhecido(tz: string): boolean {
  if (!fusosCache) {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    fusosCache = new Set(typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : []);
  }
  return fusosCache.size === 0 || fusosCache.has(tz);
}

// ── Entrada principal ───────────────────────────────────────────────────────
export function validarCampus(entrada: unknown): Resultado<CampusNormalizado> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const raw = entrada;

  const name = reqStr(raw.name, "name", falhas);
  const city = reqStr(raw.city, "city", falhas);

  // Pais: ISO-2 (2 letras). Normaliza para maiusculo.
  const countryRaw = typeof raw.country_code === "string" ? raw.country_code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(countryRaw)) {
    falhas.push({ campo: "country_code", erro: "use o código do país com 2 letras (ex.: CA, IE, AU)" });
  }

  // Moeda: ISO-3 (3 letras). Normaliza para maiusculo.
  const currencyRaw = typeof raw.base_currency === "string" ? raw.base_currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currencyRaw)) {
    falhas.push({ campo: "base_currency", erro: "use o código da moeda com 3 letras (ex.: CAD, EUR, USD)" });
  }

  // Fuso: IANA (Area/Cidade) ou UTC. Gate estrutural + lista real do runtime
  // (Intl.supportedValuesOf, built-in — mantem o motor puro). "Foo/Bar" e barrado
  // aqui, antes de algum consumidor usar campus.timezone num Intl e estourar.
  const tz = reqStr(raw.timezone, "timezone", falhas, 64);
  if (tz && tz !== "UTC") {
    const estrutural = /^[A-Za-z_]+\/[A-Za-z0-9_+\-\/]+$/.test(tz);
    if (!estrutural || !fusoConhecido(tz)) {
      falhas.push({ campo: "timezone", erro: "fuso inválido (ex.: America/Toronto, Europe/Dublin ou UTC)" });
    }
  }

  const region = optStr(raw.region, "region", falhas, 120);
  const address = optStr(raw.address, "address", falhas, 300);
  const postalCode = optStr(raw.postal_code, "postal_code", falhas, 32);
  const phone = optStr(raw.phone, "phone", falhas, 40);

  const email = optStr(raw.email, "email", falhas, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    falhas.push({ campo: "email", erro: "e-mail inválido" });
  }

  let website = optStr(raw.website, "website", falhas, 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  // Status: default 'active' (campus criado pelo admin ja e operacional; evita
  // colidir com o unico rascunho auto-provisionado por fornecedor).
  const status: CampusStatus =
    raw.status == null || raw.status === "" ? "active" : reqEnum(raw.status, CAMPUS_STATUSES, "status", falhas);

  // Placeholders do auto-provisionamento (catalog-disponibilidade: country 'ZZ',
  // city '(a definir)') so valem em RASCUNHO. Um campus ativo/inativo precisa de
  // pais e cidade reais — senao a cotacao mostraria "ZZ" ao estudante.
  if (status !== "draft") {
    if (countryRaw === "ZZ") falhas.push({ campo: "country_code", erro: "informe o país real antes de ativar o campus" });
    if (/^\(a definir\)$/i.test(city)) falhas.push({ campo: "city", erro: "informe a cidade real antes de ativar o campus" });
  }

  if (falhas.length) return { ok: false, falhas };

  return {
    ok: true,
    valor: {
      name,
      country_code: countryRaw,
      region,
      city,
      address,
      postal_code: postalCode,
      timezone: tz,
      base_currency: currencyRaw,
      phone,
      email: email ? email.toLowerCase() : null,
      website,
      status,
    },
  };
}
