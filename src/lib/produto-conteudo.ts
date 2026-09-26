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
  // Perfil de aluno para quem a opcao e MENOS indicada. Nao confundir com
  // `exclusions`, que e o que NAO esta incluido no preco.
  not_ideal_for: string[];
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
// Exportada: e a mesma checagem usada no portal para qualquer href/src que vem
// do banco (site da escola, midia), e ter duas implementacoes seria uma delas
// ficar para tras.
export function ehUrlHttp(v: string): boolean {
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
export function htmlPerigoso(s: string): boolean {
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
    const notIdealFor = capBullets(listaStr(c.not_ideal_for));
    // Locale sem nenhum conteudo -> descarta (nao grava linha vazia).
    if (
      !description &&
      highlights.length === 0 &&
      inclusions.length === 0 &&
      exclusions.length === 0 &&
      notIdealFor.length === 0
    ) {
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
      not_ideal_for: notIdealFor,
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
  notIdealFor: string[];
  midias: FichaMidia[];
  isMachineTranslated: boolean;
};

// Normaliza o tipo de mídia para um conjunto fechado (default seguro = image).
function normalizarKindMidia(raw: unknown): FichaMidia["kind"] {
  const k = typeof raw === "string" ? raw.toLowerCase() : "";
  if (k === "video") return "video";
  if (k === "document" || k === "documento" || k === "doc" || k === "pdf" || k === "brochure") return "document";
  return "image"; // inclui 'photo'
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
  const notIdealFor = escolhido ? capBullets(listaStr(escolhido.not_ideal_for)) : [];
  const midias = midiasDoSnapshot(media);

  if (
    !descriptionHtml &&
    highlights.length === 0 &&
    inclusions.length === 0 &&
    exclusions.length === 0 &&
    notIdealFor.length === 0 &&
    midias.length === 0
  ) {
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
    notIdealFor,
    midias,
    isMachineTranslated: escolhido ? optBool(escolhido.is_machine_translated, false) : false,
  };
}

// ── Detalhes estruturados do snapshot (Fase A2) ──────────────────────────────
// Deriva do product_snapshot enriquecido (programDetail / accommodationDetail /
// campus{content,media}) os blocos exibidos no detalhe da opção no portal:
// Quick Info + timetable do curso, atributos da acomodação e "Sobre a escola".
// Tudo defensivo: campos ausentes (snapshots antigos, catálogo sem conteúdo)
// simplesmente não geram linha. Nada aqui é HTML injetável — a descrição da
// escola é sanitizada; o resto é texto (o React escapa no render).

export type QuickInfoLinha = { rotulo: string; valor: string };
// Bloco de aula estruturado (shape novo do timetable): inicio/fim "HH:MM" e
// descricao livre (nome da aula, ou "Intervalo"). isIntervalo e so um atalho
// visual; na ausencia dele o render tambem detecta pela descricao.
export type BlocoAula = { inicio: string | null; fim: string | null; descricao: string; isIntervalo?: boolean };
export type BlocoTimetable = { dia: string; blocos: BlocoAula[] };
export type DetalhesPrograma = { quickInfo: QuickInfoLinha[]; timetable: BlocoTimetable[] };
export type DetalhesAcomodacao = { linhas: QuickInfoLinha[] };
export type NacionalidadeLinha = { pais: string; percentual: number };
export type DetalhesEscola = {
  campusId: string | null;
  nome: string | null;
  local: string | null;
  descriptionHtml: string;
  highlights: string[];
  amenities: string[];
  accreditations: string[];
  nationalityMix: NacionalidadeLinha[];
  midias: FichaMidia[];
};
export type DetalhesSnapshot = {
  programa: DetalhesPrograma | null;
  acomodacao: DetalhesAcomodacao | null;
  escola: DetalhesEscola | null;
};

const DELIVERY_LABEL: Record<string, string> = { in_person: "Presencial", online: "Online", hybrid: "Híbrido" };
const FORMATO_LABEL: Record<string, string> = {
  group: "Em grupo", mini_group: "Mini-grupo (2 alunos)", one_to_one: "Individual", combined: "Grupo + individual",
};
const ACCOM_TYPE_LABEL: Record<string, string> = {
  homestay: "Casa de família",
  residence: "Residência estudantil",
  shared_apartment: "Apartamento compartilhado",
  studio: "Estúdio",
  hotel: "Hotel",
  other: "Outro",
};
const ROOM_LABEL: Record<string, string> = { private: "Individual", shared_2: "Duplo", shared_3plus: "Compartilhado (3+)" };
const BATH_LABEL: Record<string, string> = { private: "Privativo", shared: "Compartilhado" };
const MEAL_LABEL: Record<string, string> = {
  none: "Sem refeições",
  breakfast: "Café da manhã",
  half_board: "Meia pensão",
  full_board: "Pensão completa",
  self_catering: "Cozinha própria",
};
const WEEKDAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function labelDiaSemana(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? WEEKDAY_LABEL[n] : null;
}

function pushLinha(linhas: QuickInfoLinha[], rotulo: string, valor: unknown) {
  const v = typeof valor === "number" ? String(valor) : optStrOuNull(valor);
  if (v) linhas.push({ rotulo, valor: v });
}

// Parser tolerante do timetable jsonb. Shape canônico (fixado nesta função):
// array de dias `[{ dia, blocos: [{ inicio, fim, descricao, isIntervalo? }] }]`
// — vem do editor em src/components/ProdutoEditor.tsx. Compatível com o shape
// antigo, ainda presente em alguns registros de carga manual: objeto
// `{ "Segunda": ["08:30-10:10", ...] }` com blocos como string livre "HH:MM-HH:MM"
// (ou qualquer texto — vira uma descrição sem horário estruturado).
function parseBlocoAula(x: unknown): BlocoAula | null {
  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return null;
    // Tenta separar "08:30-10:10" (ou "08:30–10:10") em inicio/fim; o resto vira
    // descrição. Se não casar o padrão, a string toda vira descrição.
    const m = s.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*(.*)$/);
    if (m) {
      const [, inicio, fim, resto] = m;
      return { inicio, fim, descricao: resto.trim() || "Aula" };
    }
    return { inicio: null, fim: null, descricao: s };
  }
  if (isObj(x)) {
    const inicio = optStrOuNull(x.inicio ?? x.start);
    const fim = optStrOuNull(x.fim ?? x.end);
    const descricao = (optStrOuNull(x.descricao ?? x.description ?? x.nome) ?? "").slice(0, MAX_TEXTO_CURTO);
    const isIntervalo = typeof x.isIntervalo === "boolean" ? x.isIntervalo : undefined;
    if (!inicio && !fim && !descricao) return null;
    return { inicio, fim, descricao, isIntervalo };
  }
  return null;
}

function parseTimetable(raw: unknown): BlocoTimetable[] {
  const out: BlocoTimetable[] = [];
  const asBlocos = (v: unknown): BlocoAula[] =>
    Array.isArray(v)
      ? v.map(parseBlocoAula).filter((b): b is BlocoAula => b !== null).slice(0, 20)
      : [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isObj(item)) continue;
      const dia = optStrOuNull(item.dia ?? item.day);
      const blocos = asBlocos(item.blocos ?? item.slots ?? item.horarios);
      if (dia && blocos.length) out.push({ dia, blocos });
    }
  } else if (isObj(raw)) {
    for (const [dia, v] of Object.entries(raw)) {
      const blocos = asBlocos(v);
      if (dia && blocos.length) out.push({ dia, blocos });
    }
  }
  return out.slice(0, 7);
}

function detalhesPrograma(pd: unknown): DetalhesPrograma | null {
  if (!isObj(pd)) return null;
  const linhas: QuickInfoLinha[] = [];
  pushLinha(linhas, "Tipo", pd.education_type);
  pushLinha(linhas, "Área", pd.subject);
  pushLinha(linhas, "Idioma", pd.language);
  if (typeof pd.delivery_method === "string" && DELIVERY_LABEL[pd.delivery_method]) {
    linhas.push({ rotulo: "Modalidade", valor: DELIVERY_LABEL[pd.delivery_method] });
  }
  if (typeof pd.format === "string" && FORMATO_LABEL[pd.format]) {
    linhas.push({ rotulo: "Formato da aula", valor: FORMATO_LABEL[pd.format] });
  }
  if (pd.lessons_per_week != null && Number(pd.lessons_per_week) > 0) {
    linhas.push({ rotulo: "Aulas por semana", valor: String(pd.lessons_per_week) });
  }
  if (pd.hours_per_week != null && Number(pd.hours_per_week) > 0) {
    linhas.push({ rotulo: "Carga horária", valor: `${pd.hours_per_week} h/semana` });
  }
  const grades = listaStr(pd.grades);
  if (grades.length) linhas.push({ rotulo: "Níveis", valor: grades.join(", ") });
  if (optBool(pd.is_pathway, false)) linhas.push({ rotulo: "Pathway", valor: "Sim" });
  if (optBool(pd.includes_activities, false)) linhas.push({ rotulo: "Atividades incluídas", valor: "Sim" });
  const timetable = parseTimetable(pd.timetable);
  if (linhas.length === 0 && timetable.length === 0) return null;
  return { quickInfo: linhas, timetable };
}

function detalhesAcomodacao(ad: unknown): DetalhesAcomodacao | null {
  if (!isObj(ad)) return null;
  const linhas: QuickInfoLinha[] = [];
  if (typeof ad.accommodation_type === "string" && ACCOM_TYPE_LABEL[ad.accommodation_type]) {
    linhas.push({ rotulo: "Tipo", valor: ACCOM_TYPE_LABEL[ad.accommodation_type] });
  }
  if (typeof ad.room_type === "string" && ROOM_LABEL[ad.room_type]) {
    linhas.push({ rotulo: "Quarto", valor: ROOM_LABEL[ad.room_type] });
  }
  if (typeof ad.bathroom_type === "string" && BATH_LABEL[ad.bathroom_type]) {
    linhas.push({ rotulo: "Banheiro", valor: BATH_LABEL[ad.bathroom_type] });
  }
  if (typeof ad.meal_plan === "string" && MEAL_LABEL[ad.meal_plan]) {
    linhas.push({ rotulo: "Refeições", valor: MEAL_LABEL[ad.meal_plan] });
  }
  if (ad.distance_to_campus_minutes != null && Number(ad.distance_to_campus_minutes) > 0) {
    linhas.push({ rotulo: "Distância até a escola", valor: `${ad.distance_to_campus_minutes} min` });
  }
  const ci = labelDiaSemana(ad.check_in_weekday);
  const co = labelDiaSemana(ad.check_out_weekday);
  if (ci) linhas.push({ rotulo: "Check-in", valor: ci });
  if (co) linhas.push({ rotulo: "Check-out", valor: co });
  if (linhas.length === 0) return null;
  return { linhas };
}

function detalhesEscola(campus: unknown, locale: ContentLocale): DetalhesEscola | null {
  if (!isObj(campus)) return null;
  const linhasContent = Array.isArray(campus.content) ? campus.content.filter(isObj) : [];
  const escolhido =
    linhasContent.find((c) => c.locale === locale) ??
    linhasContent.find((c) => c.locale === "pt-BR") ??
    linhasContent[0] ??
    null;
  const descriptionHtml = escolhido ? sanitizarHtml(escolhido.description_html) : "";
  const highlights = escolhido ? capBullets(listaStr(escolhido.highlights)) : [];
  const midias = midiasDoSnapshot(campus.media);
  const nome = optStrOuNull(campus.name);
  const cidade = optStrOuNull(campus.city);
  const regiao = optStrOuNull(campus.region);
  const local = [cidade, regiao].filter(Boolean).join(", ") || null;
  const amenities = capBullets(listaStr(campus.amenities));
  const accreditations = capBullets(listaStr(campus.accreditations));
  const nationalityMix = parseNationalityMix(campus.nationality_mix);
  if (!descriptionHtml && highlights.length === 0 && midias.length === 0 && !nome && amenities.length === 0 && accreditations.length === 0 && nationalityMix.length === 0) return null;
  return { campusId: optStrOuNull(campus.id), nome, local, descriptionHtml, highlights, amenities, accreditations, nationalityMix, midias };
}

// Lê o nationality_mix (jsonb: array de { pais, percentual }) do snapshot.
function parseNationalityMix(raw: unknown): NacionalidadeLinha[] {
  if (!Array.isArray(raw)) return [];
  const out: NacionalidadeLinha[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!isObj(item)) continue;
    const pais = optStrOuNull(item.pais ?? item.country);
    const p = typeof item.percentual === "number" ? item.percentual : Number(item.percentual ?? item.percent);
    if (pais && Number.isFinite(p) && p >= 0 && p <= 100) out.push({ pais, percentual: p });
  }
  return out;
}

// Deriva os detalhes exibíveis do snapshot completo do item. Retorna sempre um
// objeto (com null nos blocos ausentes) para simplificar o consumo.
export function detalhesDoSnapshot(snap: unknown, locale: ContentLocale = "pt-BR"): DetalhesSnapshot {
  const s = isObj(snap) ? snap : {};
  return {
    programa: detalhesPrograma(s.programDetail),
    acomodacao: detalhesAcomodacao(s.accommodationDetail),
    escola: detalhesEscola(s.campus, locale),
  };
}

// ── Validação do program_detail (Fase B1) ────────────────────────────────────
// Ficha estruturada do curso proposta pelo fornecedor. Tudo opcional; só falha
// em enum/número inválido. Retorna as colunas de program_detail normalizadas.
export const DELIVERY_METHODS = ["in_person", "online", "hybrid"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
// Formato da aula — ver o comentario em produto.ts. Repetido aqui (e nao
// importado) pelo mesmo motivo de DELIVERY_METHODS: este modulo e a validacao
// do que a ESCOLA propoe e nao depende do editor interno.
export const CLASS_FORMATS = ["group", "mini_group", "one_to_one", "combined"] as const;
export type ClassFormat = (typeof CLASS_FORMATS)[number];

export type ProgramDetailNormalizado = {
  education_type: string | null;
  subject: string | null;
  language: string | null;
  delivery_method: DeliveryMethod | null;
  format: ClassFormat | null;
  institution_type: string | null;
  grades: string[];
  lessons_per_week: number | null;
  hours_per_week: number | null;
  is_pathway: boolean;
  includes_activities: boolean;
  timetable: BlocoTimetable[] | null;
};

const MAX_TEXTO_CURTO = 200;

function optTextoCurto(raw: unknown, campo: string, falhas: Falha[]): string | null {
  const s = optStrOuNull(raw);
  if (s && s.length > MAX_TEXTO_CURTO) {
    falhas.push({ campo, erro: `máximo ${MAX_TEXTO_CURTO} caracteres` });
    return s.slice(0, MAX_TEXTO_CURTO);
  }
  return s;
}

function optNumNaoNeg(raw: unknown, campo: string, max: number, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    falhas.push({ campo, erro: "deve ser um número ≥ 0" });
    return null;
  }
  if (n > max) {
    falhas.push({ campo, erro: `máximo ${max}` });
    return max;
  }
  return n;
}

export function validarProgramDetail(raw: unknown): Resultado<ProgramDetailNormalizado> {
  const falhas: Falha[] = [];
  const o = isObj(raw) ? raw : {};

  let delivery: DeliveryMethod | null = null;
  const dm = optStrOuNull(o.delivery_method);
  if (dm) {
    if ((DELIVERY_METHODS as readonly string[]).includes(dm)) delivery = dm as DeliveryMethod;
    else falhas.push({ campo: "delivery_method", erro: "modalidade inválida" });
  }

  let formato: ClassFormat | null = null;
  const fmt = optStrOuNull(o.format);
  if (fmt) {
    if ((CLASS_FORMATS as readonly string[]).includes(fmt)) formato = fmt as ClassFormat;
    else falhas.push({ campo: "format", erro: "formato de aula inválido" });
  }

  const valor: ProgramDetailNormalizado = {
    education_type: optTextoCurto(o.education_type, "education_type", falhas),
    subject: optTextoCurto(o.subject, "subject", falhas),
    language: optTextoCurto(o.language, "language", falhas),
    delivery_method: delivery,
    format: formato,
    institution_type: optTextoCurto(o.institution_type, "institution_type", falhas),
    grades: capBullets(listaStr(o.grades)),
    lessons_per_week: (() => {
      const n = optNumNaoNeg(o.lessons_per_week, "lessons_per_week", 100, falhas);
      return n == null ? null : Math.round(n);
    })(),
    hours_per_week: optNumNaoNeg(o.hours_per_week, "hours_per_week", 200, falhas),
    is_pathway: optBool(o.is_pathway, false),
    includes_activities: optBool(o.includes_activities, false),
    timetable: (() => {
      const tt = parseTimetable(o.timetable);
      return tt.length ? tt : null;
    })(),
  };

  if (falhas.length) return { ok: false, falhas };
  return { ok: true, valor };
}

// ── Validação do accommodation_detail (Fase B3) ──────────────────────────────
// Ficha estruturada da acomodação proposta pelo fornecedor. Tudo opcional; só
// falha em enum/número inválido. Retorna as colunas de accommodation_detail.
export const ACCOMMODATION_TYPES = ["homestay", "residence", "shared_apartment", "studio", "hotel", "other"] as const;
export const ROOM_TYPES = ["private", "shared_2", "shared_3plus"] as const;
export const BATHROOM_TYPES = ["private", "shared"] as const;
export const MEAL_PLANS = ["none", "breakfast", "half_board", "full_board", "self_catering"] as const;

export type AccommodationDetailNormalizado = {
  accommodation_type: (typeof ACCOMMODATION_TYPES)[number] | null;
  room_type: (typeof ROOM_TYPES)[number] | null;
  bathroom_type: (typeof BATHROOM_TYPES)[number] | null;
  meal_plan: (typeof MEAL_PLANS)[number] | null;
  distance_to_campus_minutes: number | null;
  check_in_weekday: number | null;
  check_out_weekday: number | null;
};

function optEnum<T extends string>(raw: unknown, permitidos: readonly T[], campo: string, falhas: Falha[]): T | null {
  const s = optStrOuNull(raw);
  if (!s) return null;
  if ((permitidos as readonly string[]).includes(s)) return s as T;
  falhas.push({ campo, erro: "valor inválido" });
  return null;
}

function optWeekday(raw: unknown, campo: string, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 6) {
    falhas.push({ campo, erro: "dia da semana inválido (0-6)" });
    return null;
  }
  return n;
}

export function validarAccommodationDetail(raw: unknown): Resultado<AccommodationDetailNormalizado> {
  const falhas: Falha[] = [];
  const o = isObj(raw) ? raw : {};
  const distRaw = o.distance_to_campus_minutes;
  let distancia: number | null = null;
  if (distRaw !== undefined && distRaw !== null && distRaw !== "") {
    const n = typeof distRaw === "number" ? distRaw : Number(distRaw);
    if (!Number.isFinite(n) || n < 0) falhas.push({ campo: "distance_to_campus_minutes", erro: "deve ser ≥ 0" });
    else if (n > 600) falhas.push({ campo: "distance_to_campus_minutes", erro: "máximo 600 minutos" });
    else distancia = Math.round(n);
  }
  const valor: AccommodationDetailNormalizado = {
    accommodation_type: optEnum(o.accommodation_type, ACCOMMODATION_TYPES, "accommodation_type", falhas),
    room_type: optEnum(o.room_type, ROOM_TYPES, "room_type", falhas),
    bathroom_type: optEnum(o.bathroom_type, BATHROOM_TYPES, "bathroom_type", falhas),
    meal_plan: optEnum(o.meal_plan, MEAL_PLANS, "meal_plan", falhas),
    distance_to_campus_minutes: distancia,
    check_in_weekday: optWeekday(o.check_in_weekday, "check_in_weekday", falhas),
    check_out_weekday: optWeekday(o.check_out_weekday, "check_out_weekday", falhas),
  };
  if (falhas.length) return { ok: false, falhas };
  return { ok: true, valor };
}

// ── Validação da DISPONIBILIDADE (duração/janela) do produto ────────────────
// Bloco proposto pelo fornecedor para editar min_duration/max_duration (em
// SEMANAS — mesma unidade usada na criação do produto, ver
// catalog-disponibilidade.ts/NovoCursoForm) e available_from/available_until
// (colunas de `product`, ver supabase/schema.sql). Kind-agnostico: vale tanto
// para curso quanto para acomodação. Tudo opcional (produto sem limite/janela
// definida é válido); só falha em número/data mal formados. É o MESMO padrao
// dos outros blocos deste arquivo — puro, sem rede/DB.
export type DisponibilidadeNormalizada = {
  min_duration: number | null;
  max_duration: number | null;
  available_from: string | null;
  available_until: string | null;
};

const MAX_DURACAO_SEMANAS = 520; // ~10 anos: teto de sanidade, nao regra de negocio

function optDataOuNull(raw: unknown, campo: string, falhas: Falha[]): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    falhas.push({ campo, erro: "data inválida (use AAAA-MM-DD)" });
    return null;
  }
  return s;
}

function optDuracaoOuNull(raw: unknown, campo: string, falhas: Falha[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    falhas.push({ campo, erro: "deve ser um número inteiro ≥ 0" });
    return null;
  }
  if (n > MAX_DURACAO_SEMANAS) {
    falhas.push({ campo, erro: `máximo ${MAX_DURACAO_SEMANAS} semanas` });
    return null;
  }
  return n;
}

export function validarDisponibilidadeProduto(raw: unknown): Resultado<DisponibilidadeNormalizada> {
  const falhas: Falha[] = [];
  const o = isObj(raw) ? raw : {};

  const minDuration = optDuracaoOuNull(o.min_duration, "min_duration", falhas);
  const maxDuration = optDuracaoOuNull(o.max_duration, "max_duration", falhas);
  if (minDuration != null && maxDuration != null && minDuration > maxDuration) {
    falhas.push({ campo: "max_duration", erro: "duração máxima não pode ser menor que a mínima" });
  }

  const availableFrom = optDataOuNull(o.available_from, "available_from", falhas);
  const availableUntil = optDataOuNull(o.available_until, "available_until", falhas);
  if (availableFrom && availableUntil && availableUntil < availableFrom) {
    falhas.push({ campo: "available_until", erro: "data final não pode ser antes da inicial" });
  }

  if (falhas.length) return { ok: false, falhas };
  return {
    ok: true,
    valor: { min_duration: minDuration, max_duration: maxDuration, available_from: availableFrom, available_until: availableUntil },
  };
}
