// Parte PURA da internalizacao de midia do catalogo (sem rede/DB): decide quais URLs
// ja estao no nosso Storage, valida a URL externa antes de baixar (so https, host
// publico com nome — nunca IP literal/localhost, para o cron nao virar proxy SSRF),
// mapeia mime -> extensao e monta caminho/URL publica no bucket. Testado.

export const BUCKET_MIDIA_CATALOGO = "midia-catalogo";
export const MIDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MIDIA_MAX_TENTATIVAS = 5;
/** Teto proprio do favicon: e um icone. Acima disso, quase certo que nao e um. */
export const FAVICON_MAX_BYTES = 512 * 1024;

const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  // .ico entra por causa do FAVICON da escola: quase todo site serve o icone nesse
  // formato. E raster puro (nao executa nada), ao contrario do SVG.
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  // SVG fica de fora de proposito: pode carregar script e seria republicado num bucket nosso.
};

/** Mime de imagem aceito -> extensao do arquivo no Storage; null = recusado. */
export function extensaoDeMime(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return EXT_POR_MIME[mime] ?? null;
}

/** true quando a URL ja aponta para o Storage do nosso projeto Supabase. */
export function ehUrlInterna(url: string, supabaseUrl: string): boolean {
  const base = supabaseUrl.replace(/\/+$/, "");
  return url.startsWith(`${base}/storage/v1/object/`);
}

/**
 * Valida a URL externa antes do download. Recusa: nao-https, credenciais na URL,
 * host vazio, IP literal (v4/v6) e nomes locais (localhost, *.local, *.internal),
 * porque a funcao roda na rede da Vercel e nao deve buscar enderecos internos.
 */
export function validarUrlExterna(url: string): { ok: true; url: URL } | { ok: false; erro: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, erro: "URL inválida" };
  }
  if (u.protocol !== "https:") return { ok: false, erro: "só https é aceito" };
  if (u.username || u.password) return { ok: false, erro: "URL com credenciais" };
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, erro: "host vazio" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host.includes(":")) {
    return { ok: false, erro: "IP literal não é aceito" };
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, erro: "host local não é aceito" };
  }
  // Porta explicita diferente da padrao nao serve imagem de site publico — serve
  // para varrer servico interno usando a nossa rede como sonda.
  if (u.port !== "" && u.port !== "443") return { ok: false, erro: "porta não permitida" };
  return { ok: true, url: u };
}

/**
 * IP privado/local/link-local (v4 e v6). Usado DEPOIS da resolucao DNS: um hostname
 * publico pode resolver para 10.x/169.254.x (DNS do dono do dominio) — a checagem
 * pelo nome nao cobre isso.
 */
export function ipEhPrivado(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast/reservado/broadcast
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // fc00::/7
  if (v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) return true; // fe80::/10
  if (v6.startsWith("::ffff:")) return ipEhPrivado(v6.slice(7)); // v4 mapeado
  return false;
}

/**
 * Quanto falta esperar para respeitar o intervalo minimo entre dois downloads do
 * MESMO host. `ultimo` = instante do download anterior naquele host (undefined = o
 * primeiro, nao espera). Puro para ser testavel sem timers.
 */
export function esperaDeHostMs(ultimo: number | undefined, agora: number, intervaloMs: number): number {
  if (ultimo === undefined) return 0;
  const falta = intervaloMs - (agora - ultimo);
  return falta > 0 ? falta : 0;
}

/** Numero de env positivo e finito; senao o default (NaN desligaria os cortes). */
export function numeroEnv(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/** Caminho no bucket: um objeto por linha de campus_media (id estavel -> upsert idempotente). */
export function caminhoStorageMidia(campusId: string, mediaId: string, ext: string): string {
  return `campus/${campusId}/${mediaId}.${ext}`;
}

/**
 * Formato REAL da imagem pelos bytes iniciais. O `Content-Type` que o site da
 * escola manda e palpite dele: como o arquivo passa a ser servido sob o NOSSO
 * dominio (o mesmo das URLs de documento), quem decide o tipo somos nos.
 * Devolve o mime canonico ou null quando nao reconhece.
 */
export function formatoDeImagem(bytes: Uint8Array): string | null {
  const b = bytes;
  const em = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length < 12) return null;
  if (em(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (em(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (em(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (em(0, 0x52, 0x49, 0x46, 0x46) && em(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  // ICO: reserved=0, type=1 (icone) e ao menos uma imagem declarada.
  if (em(0, 0x00, 0x00, 0x01, 0x00) && (b[4] | (b[5] << 8)) > 0) return "image/vnd.microsoft.icon";
  // AVIF: caixa ftyp com marca avif.
  if (em(4, 0x66, 0x74, 0x79, 0x70) && em(8, 0x61, 0x76, 0x69, 0x66)) return "image/avif";
  return null;
}

/**
 * Caminho do FAVICON da escola no bucket. Um objeto por fornecedor (id estavel ->
 * upsert idempotente): trocar o icone sobrescreve, nao acumula lixo.
 */
export function caminhoStorageFavicon(supplierId: string, impressao: string, ext: string): string {
  // A impressao do CONTEUDO entra no caminho de proposito. O objeto e servido com
  // cache de um ano; se o caminho fosse fixo, a escola trocar de logo deixaria o
  // icone velho na proposta por meses, sem jeito de invalidar.
  const chave = impressao.replace(/[^a-f0-9]/gi, "").slice(0, 16) || "0";
  return `fornecedor/${supplierId}/favicon-${chave}.${ext}`;
}

/** URL publica de um objeto do bucket publico. */
export function urlPublicaStorage(supabaseUrl: string, bucket: string, caminho: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${caminho}`;
}

/** Mensagem de erro curta e sem URL (a URL ja esta em source_url). */
export function resumirErro(msg: string): string {
  return msg.replace(/https?:\/\/\S+/g, "<url>").slice(0, 200);
}
