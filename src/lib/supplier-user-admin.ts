// Helpers PUROS (sem rede/DB) do convite de usuario do fornecedor pelo admin.
// Validam/normalizam o payload do formulario antes de gravar em supplier_user.
// Testados em supplier-user-admin.test.ts (runner nativo do Node).

// Papeis de um usuario do portal do fornecedor (espelha o CHECK de supplier_user).
export const PAPEIS_SUPPLIER_USER = [
  "supplier_admin",
  "admissions",
  "finance",
  "marketing",
] as const;
export type PapelSupplierUser = (typeof PAPEIS_SUPPLIER_USER)[number];

// Rotulos (PT) para a UI do admin. O valor no banco e o slug em ingles.
export const PAPEL_SUPPLIER_USER_LABEL: Record<PapelSupplierUser, string> = {
  supplier_admin: "Administrador",
  admissions: "Admissões",
  finance: "Financeiro",
  marketing: "Marketing",
};

export const IDIOMAS_SUPPLIER_USER = ["en", "pt"] as const;
export type IdiomaSupplierUser = (typeof IDIOMAS_SUPPLIER_USER)[number];

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Mesmo formato aceito no resto do portal (nao valida MX, so a forma).
export function emailValido(v: unknown): boolean {
  const e = texto(v).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export type ConviteEntrada = {
  supplierId?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
  language?: unknown;
};

export type ConviteDados = {
  supplierId: string;
  name: string;
  email: string;
  role: PapelSupplierUser;
  language: IdiomaSupplierUser;
};

export type ResultadoConvite =
  | { ok: true; dados: ConviteDados }
  | { ok: false; erro: string };

// Valida e normaliza o convite. Regras:
//  - supplierId obrigatorio (a escola dona do acesso);
//  - nome obrigatorio (identifica a pessoa no portal e na saudacao do e-mail);
//  - e-mail obrigatorio e valido (e o login: guardamos sempre em minusculas);
//  - papel: quando vazio, assume 'admissions' (default do banco); se vier
//    preenchido, precisa ser um dos papeis conhecidos;
//  - idioma: quando vazio, assume 'en'; se vier, precisa ser 'en' ou 'pt'.
export function validarConvite(entrada: ConviteEntrada): ResultadoConvite {
  const supplierId = texto(entrada.supplierId);
  if (!supplierId) return { ok: false, erro: "Selecione o fornecedor (escola)." };

  const name = texto(entrada.name);
  if (!name) return { ok: false, erro: "Informe o nome da pessoa." };

  const email = texto(entrada.email).toLowerCase();
  if (!email) return { ok: false, erro: "Informe o e-mail de acesso." };
  if (!emailValido(email)) return { ok: false, erro: "E-mail inválido." };

  const roleRaw = texto(entrada.role);
  const role = (roleRaw || "admissions") as PapelSupplierUser;
  if (!(PAPEIS_SUPPLIER_USER as readonly string[]).includes(role)) {
    return { ok: false, erro: "Papel inválido." };
  }

  const langRaw = texto(entrada.language).toLowerCase();
  const language = (langRaw || "en") as IdiomaSupplierUser;
  if (!(IDIOMAS_SUPPLIER_USER as readonly string[]).includes(language)) {
    return { ok: false, erro: "Idioma inválido." };
  }

  return { ok: true, dados: { supplierId, name, email, role, language } };
}
