/** @type {import('next').NextConfig} */

// Cabecalhos de seguranca. O portal renderiza saldo, CPF e QR Code Pix com
// cookie de sessao `sameSite: lax` — que E enviado em navegacao de topo dentro
// de frame. Sem `frame-ancestors`, uma pagina de terceiro conseguia enquadrar
// /parcelas ou /admin/financeiro e fazer clickjacking dos botoes de gerar
// cobranca e ajustar parcela. Nao havia nenhum controle compensatorio.
//
// A CSP e propositalmente conservadora: 'unsafe-inline' em script-src ainda e
// necessario para o runtime do Next (bootstrap inline). O ganho real aqui esta
// em frame-ancestors, form-action e base-uri.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // data: cobre os QR Codes Pix, que chegam como data:image/png;base64.
  "img-src 'self' data: blob: https://*.supabase.co https://exp-tour.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  // Nao anunciar a stack.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // A proposta publica e legitimamente acessivel por link, mas nao deve
      // ser indexada: expoe nome e valor do programa a quem tiver o token.
      { source: "/proposta/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

module.exports = nextConfig;
