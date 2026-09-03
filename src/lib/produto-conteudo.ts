// Motor de validacao/normalizacao do CONTEUDO editorial e da MIDIA de um produto
// (product_content por locale + product_media). PURO — sem rede/DB/imports de
// runtime — para ser testado sem mocks e reutilizado pela rota admin e pela UI.
//
// Conteudo e por LOCALE (pt-BR/en/es): descricao + destaques/inclusoes/exclusoes
// (listas de bullets). Midia e uma lista de URLs (imagem/video/documento) com
// legenda e ordem. Um locale sem nenhum conteudo e descartado (nao grava linha
// vazia). A validacao real de posse (produto do tenant) e feita no service.

// ── Vocabulario ─────────────────────────────────────────────────────────────
export const CONTENT_LOCALES = ["pt-BR", "en", "es"] as const;
export const MEDIA_KINDS = ["image", "video", "document"] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

// ── Resultado ───────────────────────────────────────────────────────────────
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

export type ConteudoLocale = {
  locale: ContentLocale;
  description_html: string | null;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  is_machine_translated: boolean;
};

export type MidiaItem = {
  url: string;
  kind: string | null;
  sort: number;
  caption: string | null;
};

export type ConteudoNormalizado = {
  product_id: string;
  content: ConteudoLocale[];
  media: MidiaItem[];
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

function optBool(raw: unknown, def: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return def;
}

// Lista de strings (bullets): aceita array ou string com quebras de linha.
function listaStr(raw: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") arr = raw.split("\n");
  return arr.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x !== "");
}

function optIntNaoNeg(raw: unknown, def: number): number {
  if (raw === undefined || raw === null || raw === "") return def;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : def;
}

// URL http/https simples (sem espacos). Evita javascript:/data: e caminhos soltos.
function ehUrlHttp(v: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(v);
}

// ── Entrada principal ───────────────────────────────────────────────────────
// entrada = { product_id, content: [...], media: [...] }. Conteudo/midia vazios
// sao validos (produto sem ficha). O service injeta o product_id da URL.
export function validarConteudoProduto(entrada: unknown): Resultado<ConteudoNormalizado> {
  const falhas: Falha[] = [];
  if (!isObj(entrada)) {
    return { ok: false, falhas: [{ campo: "_", erro: "corpo inválido" }] };
  }
  const productId = reqStr(entrada.product_id, "product_id", falhas);

  // Conteudo por locale.
  const contentRaw = Array.isArray(entrada.content) ? entrada.content : [];
  const locaisVistos = new Set<string>();
  const content: ConteudoLocale[] = [];
  contentRaw.forEach((c, i) => {
    if (!isObj(c)) {
      falhas.push({ campo: `content[${i}]`, erro: "conteúdo inválido" });
      return;
    }
    const locale = c.locale;
    if (typeof locale !== "string" || !(CONTENT_LOCALES as readonly string[]).includes(locale)) {
      falhas.push({ campo: `content[${i}].locale`, erro: `locale inválido (esperado: ${CONTENT_LOCALES.join(", ")})` });
      return;
    }
    if (locaisVistos.has(locale)) {
      falhas.push({ campo: `content[${i}].locale`, erro: "locale duplicado" });
      return;
    }
    locaisVistos.add(locale);

    const description = optStrOuNull(c.description_html);
    const highlights = listaStr(c.highlights);
    const inclusions = listaStr(c.inclusions);
    const exclusions = listaStr(c.exclusions);
    // Locale sem nenhum conteudo -> descarta (nao grava linha vazia).
    if (!description && highlights.length === 0 && inclusions.length === 0 && exclusions.length === 0) {
      return;
    }
    content.push({
      locale: locale as ContentLocale,
      description_html: description,
      highlights,
      inclusions,
      exclusions,
      is_machine_translated: optBool(c.is_machine_translated, false),
    });
  });

  // Midia.
  const mediaRaw = Array.isArray(entrada.media) ? entrada.media : [];
  const media: MidiaItem[] = [];
  mediaRaw.forEach((m, i) => {
    if (!isObj(m)) {
      falhas.push({ campo: `media[${i}]`, erro: "mídia inválida" });
      return;
    }
    const url = typeof m.url === "string" ? m.url.trim() : "";
    if (!url) {
      falhas.push({ campo: `media[${i}].url`, erro: "URL obrigatória" });
      return;
    }
    if (!ehUrlHttp(url)) {
      falhas.push({ campo: `media[${i}].url`, erro: "URL inválida (use http:// ou https://)" });
      return;
    }
    media.push({
      url,
      kind: optStrOuNull(m.kind),
      sort: optIntNaoNeg(m.sort, i),
      caption: optStrOuNull(m.caption),
    });
  });

  if (falhas.length > 0) return { ok: false, falhas };
  return { ok: true, valor: { product_id: productId, content, media } };
}
