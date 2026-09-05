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

// Limites (defesa em profundidade + higiene de dados).
const MAX_DESCRICAO = 20000;
const MAX_BULLETS = 60;
const MAX_BULLET = 500;
const MAX_MIDIAS = 40;

// Padroes claramente perigosos em HTML de descricao. Nao substitui a sanitizacao
// no PONTO DE RENDERIZACAO (o portal DEVE sanitizar antes de exibir; nao usar
// dangerouslySetInnerHTML cru): e uma barreira extra na gravacao, ja que o autor
// (fornecedor) e semi-confiavel e o leitor (estudante) e de outra fronteira.
function htmlPerigoso(s: string): boolean {
  return (
    /<\s*script/i.test(s) ||
    /<\s*iframe/i.test(s) ||
    /<\s*style/i.test(s) ||
    /\son\w+\s*=/i.test(s) || // handlers de evento: onerror=, onclick=, ...
    /javascript:/i.test(s) ||
    /\bdata:text\/html/i.test(s)
  );
}

// Corta bullets ao teto (comprimento e quantidade).
function capBullets(lista: string[]): string[] {
  return lista.slice(0, MAX_BULLETS).map((x) => x.slice(0, MAX_BULLET));
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
    const highlights = capBullets(listaStr(c.highlights));
    const inclusions = capBullets(listaStr(c.inclusions));
    const exclusions = capBullets(listaStr(c.exclusions));
    // Locale sem nenhum conteudo -> descarta (nao grava linha vazia).
    if (!description && highlights.length === 0 && inclusions.length === 0 && exclusions.length === 0) {
      return;
    }
    if (description && description.length > MAX_DESCRICAO) {
      falhas.push({ campo: `content[${i}].description_html`, erro: `descrição muito longa (máx. ${MAX_DESCRICAO} caracteres)` });
      return;
    }
    if (description && htmlPerigoso(description)) {
      falhas.push({ campo: `content[${i}].description_html`, erro: "remova scripts/handlers de evento/iframe da descrição" });
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
  if (mediaRaw.length > MAX_MIDIAS) {
    falhas.push({ campo: "media", erro: `no máximo ${MAX_MIDIAS} itens de mídia` });
  }
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

// ── Sanitização no PONTO DE RENDERIZAÇÃO ─────────────────────────────────────
// O portal do estudante exibe a descrição do produto (vinda do snapshot da
// cotação). Como o autor (fornecedor/admin) é semi-confiável e o leitor é de
// outra fronteira, a descrição NUNCA vai crua para dangerouslySetInnerHTML:
// passa por este allowlist. Estratégia à prova de bypass — reconstruímos a saída
// do zero: todo texto é escapado e só re-emitimos um conjunto pequeno de tags
// SEM nenhum atributo. Assim é impossível injetar handler de evento, href
// javascript:, script/style/iframe etc., mesmo que a barreira de gravação falhe
// e mesmo com HTML malformado (uma tag mal fechada vira texto escapado).
const TAGS_PERMITIDAS = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);
const TAGS_VAZIAS = new Set(["br"]);

function escaparTexto(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizarHtml(input: unknown): string {
  if (typeof input !== "string" || input === "") return "";
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let saida = "";
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(input)) !== null) {
    // Texto antes da tag: escapado; quebras de linha viram <br> (descrições de
    // textarea costumam ser texto puro com \n).
    saida += escaparTexto(input.slice(ultimo, m.index)).replace(/\r?\n/g, "<br>");
    ultimo = tagRe.lastIndex;
    const fechamento = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (!TAGS_PERMITIDAS.has(tag)) continue; // tag não permitida: descartada (texto ao redor preservado)
    if (TAGS_VAZIAS.has(tag)) {
      if (!fechamento) saida += `<${tag}>`; // </br> é ignorado
      continue;
    }
    saida += fechamento ? `</${tag}>` : `<${tag}>`;
  }
  saida += escaparTexto(input.slice(ultimo)).replace(/\r?\n/g, "<br>");
  return saida;
}

// ── Ficha exibível a partir do snapshot ──────────────────────────────────────
// O quote_item guarda product_snapshot com `content: ConteudoLocale[]` congelado
// na emissão. Esta função deriva a ficha que o portal exibe: escolhe o locale
// pedido (fallback pt-BR → primeiro disponível), SANITIZA a descrição e devolve
// os bullets como texto (o React escapa ao renderizar). Retorna null quando não
// há conteúdo utilizável no locale escolhido.
export type FichaMidia = { url: string; kind: "image" | "video" | "document"; caption: string | null };
export type FichaProduto = {
  locale: ContentLocale;
  descriptionHtml: string; // já sanitizado (pode ser "")
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  midias: FichaMidia[];
  isMachineTranslated: boolean;
};

// Normaliza o tipo de mídia para um conjunto fechado (default seguro = image).
function normalizarKindMidia(raw: unknown): FichaMidia["kind"] {
  const k = typeof raw === "string" ? raw.toLowerCase() : "";
  if (k === "video") return "video";
  if (k === "document" || k === "documento" || k === "doc" || k === "pdf") return "document";
  return "image";
}

// Deriva a lista de mídias exibível do snapshot. DEFESA EM PROFUNDIDADE no ponto
// de render: só passam URLs http/https (nunca javascript:/data:), pois vão para
// <img src>/<a href> no portal público. Ordena por sort e corta ao teto.
function midiasDoSnapshot(media: unknown): FichaMidia[] {
  if (!Array.isArray(media)) return [];
  return media
    .filter(isObj)
    .map((m) => ({
      url: typeof m.url === "string" ? m.url.trim() : "",
      kind: normalizarKindMidia(m.kind),
      sort: optIntNaoNeg(m.sort, 0),
      caption: optStrOuNull(m.caption),
    }))
    .filter((m) => ehUrlHttp(m.url))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, MAX_MIDIAS)
    .map(({ url, kind, caption }) => ({ url, kind, caption }));
}

// `content` = ConteudoLocale[] do snapshot; `media` = MidiaItem[] do snapshot
// (opcional; snapshots antigos não têm). Retorna null só quando não há NADA
// exibível (nem texto no locale escolhido, nem mídia).
export function fichaDoSnapshot(content: unknown, locale: ContentLocale = "pt-BR", media?: unknown): FichaProduto | null {
  const linhas = Array.isArray(content) ? content.filter(isObj) : [];
  const escolhido =
    linhas.find((c) => c.locale === locale) ??
    linhas.find((c) => c.locale === "pt-BR") ??
    linhas[0] ??
    null;

  const descriptionHtml = escolhido ? sanitizarHtml(escolhido.description_html) : "";
  const highlights = escolhido ? capBullets(listaStr(escolhido.highlights)) : [];
  const inclusions = escolhido ? capBullets(listaStr(escolhido.inclusions)) : [];
  const exclusions = escolhido ? capBullets(listaStr(escolhido.exclusions)) : [];
  const midias = midiasDoSnapshot(media);

  if (!descriptionHtml && highlights.length === 0 && inclusions.length === 0 && exclusions.length === 0 && midias.length === 0) {
    return null;
  }
  const loc =
    escolhido && (CONTENT_LOCALES as readonly string[]).includes(escolhido.locale as string)
      ? (escolhido.locale as ContentLocale)
      : locale;
  return {
    locale: loc,
    descriptionHtml,
    highlights,
    inclusions,
    exclusions,
    midias,
    isMachineTranslated: escolhido ? optBool(escolhido.is_machine_translated, false) : false,
  };
}
