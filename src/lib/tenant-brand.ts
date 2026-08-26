// Registro de MARCA por tenant. Fonte unica dos tokens visuais de cada
// instancia (EXP Tour, Forio). Produz um mapa de variaveis CSS aplicado no
// wrapper do portal do estudante (ver src/app/p/[token]/page.tsx), de modo que
// a MESMA tela vista a identidade do tenant sem duplicar componentes.
//
// Duas camadas de token, ambas resolvidas por variavel CSS:
//  - Marca global (--brand*, em tripla RGB) — usada pelas classes Tailwind
//    `brand-*` em todo o app; o default (:root em globals.css) e a EXP Tour.
//  - Semanticos do portal (--p-*, em hex) — papeis especificos da tela do
//    estudante (tinta, CTA, recomendada, escolhida, cabecalho, tipografia).
//
// A EXP Tour reproduz exatamente o visual atual (verde/dourado, titulo serif);
// a Forio aplica o Design System (Night, Portal Blue, Mist, Amber Gate,
// Confirmed, tipografia Inter). Marca nao suportada -> EXP Tour (default seguro).

import type { CSSProperties } from "react";

export type TenantTheme = "exptour" | "forio";
export type TenantLogo = "exptour" | "forio";

export type TenantBrand = {
  slug: string;
  theme: TenantTheme;
  /** Logo a renderizar quando o tenant nao tem logo_url proprio. */
  logo: TenantLogo;
  /** Variaveis CSS para aplicar no `style` do wrapper do portal. */
  styleVars: CSSProperties;
};

const INTER = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// EXP Tour: iguala os defaults de :root — a tela renderiza como hoje.
const EXP_TOUR: TenantBrand = {
  slug: "exp-tour",
  theme: "exptour",
  logo: "exptour",
  styleVars: {
    // Marca global (tripla RGB, sem virgula — casa com rgb(var(--brand) / a)).
    "--brand": "4 47 27",
    "--brand-gold": "201 163 94",
    "--brand-golddark": "138 106 47",
    "--brand-cream": "245 234 217",
    // Semanticos do portal.
    "--p-page": "#f6eddd",
    "--p-header-bg": "#042f1b",
    "--p-header-fg": "#ffffff",
    "--p-header-line": "transparent",
    "--p-ink": "#042f1b",
    "--p-muted": "#525252",
    "--p-surface": "#ffffff",
    "--p-line": "#e5e5e5",
    "--p-cta": "#042f1b",
    "--p-cta-fg": "#ffffff",
    "--p-accent": "#c9a35e",
    "--p-accent-ink": "#8a6a2f",
    "--p-accent-soft": "#f5ead9",
    "--p-success": "#042f1b",
    "--p-success-ink": "#042f1b",
    "--p-success-soft": "#eef4f0",
    "--p-heading": '"Bellefair", Georgia, "Times New Roman", serif',
    "--p-body": "ui-sans-serif, system-ui, -apple-system, sans-serif",
  } as CSSProperties,
};

// Forio (Manual da Marca v1.1): light-first, sem gradientes, Inter 400/500.
// Sky Indigo (#7080F4) e EXCLUSIVO do logo/Altus — nao entra na UI.
const FORIO: TenantBrand = {
  slug: "forio",
  theme: "forio",
  logo: "forio",
  styleVars: {
    "--brand": "15 16 32",      /* Night #0F1020 */
    "--brand-gold": "232 168 56", /* Amber Gate #E8A838 */
    "--brand-golddark": "138 100 16",
    "--brand-cream": "244 245 255", /* Mist #F4F5FF */
    "--p-page": "#eeeff6",
    "--p-header-bg": "#ffffff",
    "--p-header-fg": "#0f1020",
    "--p-header-line": "#e4e5ee",
    "--p-ink": "#0f1020",       /* Night */
    "--p-muted": "#4a4e6a",     /* Slate */
    "--p-surface": "#ffffff",
    "--p-line": "#e4e5ee",
    "--p-cta": "#3b4dc9",       /* Portal Blue */
    "--p-cta-fg": "#ffffff",
    "--p-accent": "#e8a838",    /* Amber Gate — recomendada/atencao */
    "--p-accent-ink": "#8a6410",
    "--p-accent-soft": "#fbf0d8",
    "--p-success": "#1c8c6a",   /* Confirmed */
    "--p-success-ink": "#12634b",
    "--p-success-soft": "#e6f4ee",
    "--p-heading": INTER,
    "--p-body": INTER,
  } as CSSProperties,
};

const REGISTRO: Record<string, TenantBrand> = {
  "exp-tour": EXP_TOUR,
  exptour: EXP_TOUR,
  forio: FORIO,
};

/**
 * Marca do tenant pelo slug. Slug desconhecido/ausente -> EXP Tour (default
 * seguro; :root ja carrega os mesmos valores, entao nada quebra).
 */
export function getTenantBrand(slug: string | null | undefined): TenantBrand {
  if (!slug) return EXP_TOUR;
  return REGISTRO[slug.trim().toLowerCase()] ?? EXP_TOUR;
}
