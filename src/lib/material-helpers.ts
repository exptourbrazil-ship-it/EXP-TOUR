// Helpers PUROS dos materiais do fornecedor (doc 06 secao 3.3). Sem rede/DB:
// validam/normalizam a entrada (o que a escola digita ou o metadado do upload).
// Testado em material-helpers.test.ts.

export const TIPOS_MATERIAL = ["brochura", "price_list", "foto", "video", "apresentacao", "midia_kit", "logotipo", "termos", "outro"] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

export const TIPO_MATERIAL_LABEL: Record<TipoMaterial, string> = {
  brochura: "Brochura",
  price_list: "Price list (PDF)",
  foto: "Foto",
  video: "Vídeo",
  apresentacao: "Apresentação",
  midia_kit: "Mídia kit",
  logotipo: "Logotipo",
  termos: "Termos / políticas",
  outro: "Outro",
};

export const IDIOMAS_MATERIAL = ["en", "pt", "es"] as const;
export type IdiomaMaterial = (typeof IDIOMAS_MATERIAL)[number];

export const PERMISSOES_MATERIAL = ["interno", "cliente"] as const;
export type PermissaoMaterial = (typeof PERMISSOES_MATERIAL)[number];
export const PERMISSAO_LABEL: Record<PermissaoMaterial, string> = {
  interno: "Uso interno do representante",
  cliente: "Pode ser exposto ao cliente",
};

export type EntradaMaterial = {
  tipo: TipoMaterial;
  titulo: string;
  idioma: IdiomaMaterial;
  programa: string | null;
  validade: string | null; // ISO YYYY-MM-DD ou null
  permissao: PermissaoMaterial;
  linkUrl: string | null; // quando for material por link (video etc.)
};

function texto(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Data ISO estrita (rejeita 2026-13-40 que passaria num regex solto).
export function dataIsoValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// URL http/https valida (link de video ou material externo). Bloqueia outros
// esquemas (javascript:, data:, etc.).
export function linkValido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Normaliza/valida a entrada de metadados de um material. `exigirLink` = o
// material e por link (nao ha arquivo) -> o link e obrigatorio e valido. Puro.
export function normalizarEntradaMaterial(
  raw: unknown,
  opts: { exigirLink: boolean }
): { ok: true; dados: EntradaMaterial } | { ok: false; erro: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const titulo = texto(r.titulo, 160);
  if (!titulo) return { ok: false, erro: "Informe o título do material." };

  const tipo = texto(r.tipo, 40) as TipoMaterial;
  if (!(TIPOS_MATERIAL as readonly string[]).includes(tipo)) return { ok: false, erro: "Tipo de material inválido." };

  const idiomaRaw = texto(r.idioma, 2).toLowerCase();
  const idioma = ((IDIOMAS_MATERIAL as readonly string[]).includes(idiomaRaw) ? idiomaRaw : "en") as IdiomaMaterial;

  const permissaoRaw = texto(r.permissao, 20).toLowerCase();
  const permissao = ((PERMISSOES_MATERIAL as readonly string[]).includes(permissaoRaw) ? permissaoRaw : "interno") as PermissaoMaterial;

  const programa = texto(r.programa, 160) || null;

  let validade: string | null = null;
  const validadeRaw = texto(r.validade, 10);
  if (validadeRaw) {
    if (!dataIsoValida(validadeRaw)) return { ok: false, erro: "Validade inválida (use AAAA-MM-DD)." };
    validade = validadeRaw;
  }

  let linkUrl: string | null = null;
  const linkRaw = texto(r.linkUrl ?? (r as any).link, 2000);
  if (linkRaw) {
    if (!linkValido(linkRaw)) return { ok: false, erro: "Link inválido (use uma URL http/https)." };
    linkUrl = linkRaw;
  }
  if (opts.exigirLink && !linkUrl) return { ok: false, erro: "Informe o link (URL) do material." };

  return { ok: true, dados: { tipo, titulo, idioma, programa, validade, permissao, linkUrl } };
}

// Material vencido? (validade < hoje). Puro — usado na Fatia 2 (cron/UI).
export function materialVencido(validade: string | null, hojeISO: string): boolean {
  if (!validade || !dataIsoValida(validade)) return false;
  return validade < hojeISO;
}
