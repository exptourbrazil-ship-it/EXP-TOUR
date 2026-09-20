// Redes sociais da escola, exibidas como ícones com hyperlink na proposta
// pública do estudante.
//
// A validação aqui não é burocracia: o ícone do Instagram numa página que vai
// para o cliente é um selo de confiança. Se alguém gravar, sob a rede
// "instagram", uma URL que não é do Instagram, o estudante clica achando que
// vai para o perfil da escola. Por isso cada rede tem HOSTS permitidos e a URL
// precisa bater — não basta ser http/https.
//
// NB: módulo PURO — sem dependência de rede/DB. Testado em redes-sociais.test.ts.

export type Rede = "instagram" | "facebook" | "youtube" | "linkedin" | "tiktok" | "x";

/** Ordem de exibição dos ícones (a mais usada primeiro). */
export const REDES: Rede[] = ["instagram", "facebook", "youtube", "linkedin", "tiktok", "x"];

export const REDE_LABEL: Record<Rede, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X (Twitter)",
};

// Hosts aceitos por rede (sem "www.", que é removido antes da comparação).
const HOSTS: Record<Rede, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "m.facebook.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
};

export type LinkSocial = { rede: Rede; url: string };

function ehRede(v: unknown): v is Rede {
  return typeof v === "string" && (REDES as string[]).includes(v);
}

/**
 * Valida uma URL para uma rede: http/https e host da própria rede (aceita
 * subdomínio, ex.: `br.linkedin.com`). Devolve a URL normalizada ou null.
 */
export function urlDaRede(rede: Rede, bruta: unknown): string | null {
  if (typeof bruta !== "string") return null;
  const s = bruta.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const permitido = HOSTS[rede].some((h) => host === h || host.endsWith(`.${h}`));
  if (!permitido) return null;
  // Perfil precisa de caminho: "https://instagram.com" sozinho não leva a lugar
  // nenhum e o ícone prometeria o que não entrega.
  if (u.pathname === "/" || u.pathname === "") return null;
  return u.toString();
}

/**
 * Lê o jsonb gravado em `supplier.social` e devolve só o que é exibível.
 * Descarta rede desconhecida, URL inválida e repetição da mesma rede.
 */
export function parseRedes(raw: unknown): LinkSocial[] {
  if (!Array.isArray(raw)) return [];
  const vistas = new Set<Rede>();
  const out: LinkSocial[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rede = (item as any).rede;
    if (!ehRede(rede) || vistas.has(rede)) continue;
    const url = urlDaRede(rede, (item as any).url);
    if (!url) continue;
    vistas.add(rede);
    out.push({ rede, url });
  }
  // Ordem fixa de exibição, independente da ordem de gravação.
  return out.sort((a, b) => REDES.indexOf(a.rede) - REDES.indexOf(b.rede));
}

/** URL http/https simples, para o favicon (host livre: é o site da escola). */
export function urlFavicon(bruta: unknown): string | null {
  if (typeof bruta !== "string") return null;
  const s = bruta.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
