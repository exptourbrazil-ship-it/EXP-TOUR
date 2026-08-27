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

// Tema do PDF de marca (server, @react-pdf/renderer). O react-pdf nao le
// variaveis CSS: precisa de cores hex explicitas. Espelha o --p-* do portal em
// valores de impressao. Fontes ficam no fallback Helvetica (react-pdf embute
// so as 14 fontes padrao; nao empacotamos arquivos de fonte).
export type PdfTheme = {
  bar: string;         // fundo da faixa do cabecalho (letterhead)
  barLine: string | null; // regua sob o cabecalho (null = sem regua)
  wordFg: string;      // cor do wordmark no cabecalho
  sub: string;         // cor da assinatura/tagline
  brand: string;       // estrutural forte (titulos, totais, valores)
  accentInk: string;   // texto do selo "Recomendada"
  accentSoft: string;  // fundo do selo "Recomendada"
  ink: string;
  muted: string;
  faint: string;
  line: string;
  wordmark: string;    // texto do logotipo
  tagline: string;     // "" para omitir
  dot: string | null;  // ponto de destaque apos o wordmark (null = sem)
  font: string;        // familia base (texto regular). Ex.: "Helvetica" | "Inter"
  fontBold: string;    // familia p/ enfase (titulos/totais)
  boldWeight?: number; // peso da enfase quando a familia usa fontWeight (Inter=500)
};

// Tema dos e-mails (Resend, HTML inline). Sem variavel CSS (clientes de e-mail
// nao suportam): cores hex diretas. Estrutura comum "moldura escura + cartao
// claro"; cada tenant so troca a paleta, a fonte e o logo. O remetente vem de
// uma env por tenant (dominio proprio precisa estar verificado no Resend).
export type EmailTheme = {
  frame: string;       // fundo externo (moldura)
  card: string;        // fundo do cartao
  ink: string;         // texto no cartao
  accentBg: string;    // botoes e chip de codigo (fundo)
  accentFg: string;    // botoes e chip de codigo (texto) + wordmark de fallback
  footerFg: string;    // texto do rodape sobre a moldura
  line: string;        // divisores/bordas sutis
  boxBg: string;       // fundo de caixas realcadas no cartao (ex.: Pix copia-e-cola)
  font: string;        // font stack inline
  fontLink: string;    // <link> de webfont ("" para nenhum)
  logoBasename: string; // arquivo em public/email/
  logoWidth: number;   // largura do <img> no cabecalho
  wordmarkTop: string; // fallback textual (linha 1) quando nao ha logo hospedado
  wordmarkSub: string; // fallback textual (linha 2); "" para omitir
  footerLabel: string; // assinatura no rodape
  brandName: string;   // nome da marca (assuntos de e-mail)
  fromEnv: string;     // env var do remetente deste tenant
};

export type TenantBrand = {
  slug: string;
  theme: TenantTheme;
  /** Logo a renderizar quando o tenant nao tem logo_url proprio. */
  logo: TenantLogo;
  /** Variaveis CSS para aplicar no `style` do wrapper do portal. */
  styleVars: CSSProperties;
  /** Tema do PDF de marca (cores de impressao). */
  pdf: PdfTheme;
  /** Tema dos e-mails transacionais (Resend). */
  email: EmailTheme;
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
  // PDF EXP Tour: mantem exatamente o letterhead atual (verde profundo/bronze).
  pdf: {
    bar: "#0f3d3e",
    barLine: null,
    wordFg: "#ffffff",
    sub: "#8a6d3b",
    brand: "#0f3d3e",
    accentInk: "#8a6d3b",
    accentSoft: "#efe7d6",
    ink: "#1f2937",
    muted: "#6b7280",
    faint: "#9ca3af",
    line: "#e5e7eb",
    wordmark: "EXP TOUR",
    tagline: "TRAVEL EXPERIENCE",
    dot: null,
    font: "Helvetica",
    fontBold: "Helvetica-Bold",
  },
  // E-mail EXP Tour: iguala o visual atual (moldura verde, cartao creme, dourado).
  email: {
    frame: "#042f1b",
    card: "#F5EAD9",
    ink: "#042f1b",
    accentBg: "#042f1b",
    accentFg: "#c9a35e",
    footerFg: "#F5EAD9",
    line: "#d8c7a8",
    boxBg: "#ffffff", // branco se destaca sobre o cartao creme
    font: "'Bellefair',Georgia,'Times New Roman',serif",
    fontLink:
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bellefair&display=swap" rel="stylesheet">',
    logoBasename: "logo-exp-tour.png",
    logoWidth: 150,
    wordmarkTop: "EXP TOUR",
    wordmarkSub: "TRAVEL EXPERIENCE",
    footerLabel: "EXP Tour — Área do Cliente",
    brandName: "EXP Tour",
    fromEnv: "RESEND_FROM_EMAIL",
  },
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
  // PDF Forio: letterhead claro (light-first), wordmark Night + regua Portal
  // Blue; selo em Amber Gate; totais em Night. Sem tagline.
  pdf: {
    bar: "#ffffff",
    barLine: "#3b4dc9",
    wordFg: "#0f1020",
    sub: "#3b4dc9",
    brand: "#0f1020",
    accentInk: "#8a6410",
    accentSoft: "#fbf0d8",
    ink: "#0f1020",
    muted: "#4a4e6a",
    faint: "#8a8ea8",
    line: "#e4e5ee",
    wordmark: "forio",
    tagline: "",
    dot: "#3b4dc9",
    font: "Inter",
    fontBold: "Inter",
    boldWeight: 500, // Inter Medium — o manual usa 400/500, sem bold sintetico
  },
  // E-mail Forio: light-first dentro da estrutura de e-mail — moldura Night,
  // cartao branco, tinta Night, acento Portal Blue. Remetente proprio via env
  // RESEND_FROM_EMAIL_FORIO (dominio precisa estar verificado no Resend; sem a
  // env, cai no remetente padrao).
  email: {
    frame: "#0f1020",
    card: "#ffffff",
    ink: "#0f1020",
    accentBg: "#3b4dc9",
    accentFg: "#ffffff",
    footerFg: "#c7cbe8",
    line: "#e4e5ee",
    boxBg: "#f4f5ff", // Mist: destaca a caixa sobre o cartao branco
    font: "'Inter',Arial,Helvetica,sans-serif",
    fontLink:
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">',
    logoBasename: "logo-forio.png",
    logoWidth: 56,
    wordmarkTop: "Forio",
    wordmarkSub: "",
    footerLabel: "Forio — Área do Cliente",
    brandName: "Forio",
    fromEnv: "RESEND_FROM_EMAIL_FORIO",
  },
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
