// Validação/normalização PURA do CONTEÚDO de ESCOLA (campus) — Fase B2. Sem
// rede/DB, para ser testado sem mocks e reutilizado pela rota do fornecedor e
// pela materialização admin. Espelha produto-conteudo, mas com o shape do campus
// (highlights_footer, mídia photo/video/brochure) + amenities/acreditações/
// nationality mix. A barreira htmlPerigoso é reusada de produto-conteudo; a
// sanitização de exibição acontece no render (portal), como no resto do app.
// NB: PURO e self-contained (sem imports locais) para rodar sob `node --test`
// (que não resolve o alias `@/` nem extensões .ts). Reespelha CONTENT_LOCALES/
// htmlPerigoso/Falha/Resultado de produto-conteudo — mesmos valores.
const CONTENT_LOCALES = ["pt-BR", "en", "es"] as const;
type ContentLocale = (typeof CONTENT_LOCALES)[number];
export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; falhas: Falha[] };

// Barreira de HTML perigoso na gravação (espelha produto-conteudo.htmlPerigoso).
// A sanitização de exibição continua no render (portal).
function htmlPerigoso(s: string): boolean {
  return (
    /<\s*script/i.test(s) ||
    /<\s*iframe/i.test(s) ||
    /<\s*style/i.test(s) ||
    /\son\w+\s*=/i.test(s) ||
    /javascript:/i.test(s) ||
    /\bdata:text\/html/i.test(s)
  );
}

export const CAMPUS_MEDIA_KINDS = ["photo", "video", "brochure"] as const;
export type CampusMediaKind = (typeof CAMPUS_MEDIA_KINDS)[number];

export type CampusContentLocale = {
  locale: ContentLocale;
  description_html: string | null;
  highlights: string[];
  highlights_footer: string | null;
  is_machine_translated: boolean;
};
export type CampusMidia = { url: string; kind: CampusMediaKind; sort: number; caption: string | null };
export type NationalityMixItem = { pais: string; percentual: number };
export type CampusContentPayload = {
  content: CampusContentLocale[];
  media: CampusMidia[];
  amenities: string[];
  accreditations: string[];
  nationalityMix: NationalityMixItem[];
};

const MAX_DESCRICAO = 20000;
const MAX_BULLETS = 60;
const MAX_BULLET = 500;
const MAX_MIDIAS = 40;
const MAX_LISTA = 40;
const MAX_ROTULO = 120;
const MAX_NACIONALIDADES = 30;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const optStrOuNull = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s === "" ? null : s;
};
const optBool = (raw: unknown, def: boolean): boolean => {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return def;
};
function listaStr(raw: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") arr = raw.split("\n");
  return arr.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x !== "");
}
const ehUrlHttp = (v: string): boolean => /^https?:\/\/[^\s]+$/i.test(v);
const capLista = (l: string[], n: number, cap: number): string[] => l.slice(0, n).map((x) => x.slice(0, cap));

function normalizarKindCampus(raw: unknown): CampusMediaKind {
  const k = typeof raw === "string" ? raw.toLowerCase() : "";
  if (k === "video") return "video";
  if (k === "brochure" || k === "document" || k === "doc" || k === "pdf") return "brochure";
  return "photo"; // inclui 'image'
}

function normalizarNationalityMix(raw: unknown, falhas: Falha[]): NationalityMixItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NationalityMixItem[] = [];
  raw.slice(0, MAX_NACIONALIDADES).forEach((item, i) => {
    if (!isObj(item)) return;
    const pais = optStrOuNull(item.pais ?? item.country);
    if (!pais) return;
    const pRaw = item.percentual ?? item.percent;
    const p = typeof pRaw === "number" ? pRaw : Number(pRaw);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      falhas.push({ campo: `nationalityMix[${i}].percentual`, erro: "percentual deve estar entre 0 e 100" });
      return;
    }
    out.push({ pais: pais.slice(0, MAX_ROTULO), percentual: Math.round(p * 10) / 10 });
  });
  return out;
}

export function validarCampusContentPayload(raw: unknown): Resultado<CampusContentPayload> {
  const falhas: Falha[] = [];
  const o = isObj(raw) ? raw : {};

  // Conteúdo por locale (descarta locale totalmente vazio).
  const contentRaw = Array.isArray(o.content) ? o.content : [];
  const vistos = new Set<string>();
  const content: CampusContentLocale[] = [];
  contentRaw.forEach((linha, i) => {
    if (!isObj(linha)) return;
    const locale = linha.locale;
    if (typeof locale !== "string" || !(CONTENT_LOCALES as readonly string[]).includes(locale)) {
      falhas.push({ campo: `content[${i}].locale`, erro: "locale inválido" });
      return;
    }
    if (vistos.has(locale)) {
      falhas.push({ campo: `content[${i}].locale`, erro: "locale duplicado" });
      return;
    }
    vistos.add(locale);
    const description = optStrOuNull(linha.description_html);
    if (description && description.length > MAX_DESCRICAO) {
      falhas.push({ campo: `content[${i}].description_html`, erro: `descrição muito longa (máx. ${MAX_DESCRICAO})` });
    }
    if (description && htmlPerigoso(description)) {
      falhas.push({ campo: `content[${i}].description_html`, erro: "HTML não permitido (script/handler/iframe)" });
    }
    const highlights = capLista(listaStr(linha.highlights), MAX_BULLETS, MAX_BULLET);
    const footer = optStrOuNull(linha.highlights_footer);
    const imt = optBool(linha.is_machine_translated, false);
    if (!description && highlights.length === 0 && !footer) return; // locale vazio: descarta
    content.push({ locale: locale as ContentLocale, description_html: description, highlights, highlights_footer: footer, is_machine_translated: imt });
  });

  // Mídia.
  const mediaRaw = Array.isArray(o.media) ? o.media : [];
  const media: CampusMidia[] = [];
  mediaRaw.slice(0, MAX_MIDIAS + 1).forEach((m, i) => {
    if (!isObj(m)) return;
    const url = typeof m.url === "string" ? m.url.trim() : "";
    if (!url) { falhas.push({ campo: `media[${i}].url`, erro: "obrigatória" }); return; }
    if (!ehUrlHttp(url)) { falhas.push({ campo: `media[${i}].url`, erro: "URL deve ser http/https" }); return; }
    media.push({ url, kind: normalizarKindCampus(m.kind), sort: media.length, caption: optStrOuNull(m.caption) });
  });
  if (media.length > MAX_MIDIAS) falhas.push({ campo: "media", erro: `máximo ${MAX_MIDIAS} itens` });

  const amenities = capLista(listaStr(o.amenities), MAX_LISTA, MAX_ROTULO);
  const accreditations = capLista(listaStr(o.accreditations), MAX_LISTA, MAX_ROTULO);
  const nationalityMix = normalizarNationalityMix(o.nationalityMix, falhas);

  if (falhas.length) return { ok: false, falhas };
  return { ok: true, valor: { content, media: media.slice(0, MAX_MIDIAS), amenities, accreditations, nationalityMix } };
}
