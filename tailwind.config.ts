import type { Config } from "tailwindcss";

const config: Config = {
    content: [
          "./src/app/**/*.{ts,tsx}",
          "./src/components/**/*.{ts,tsx}",
        ],
    theme: {
          extend: {
                  // LEGIBILIDADE: os cinzas claros do Tailwind reprovavam no contraste
                  // (neutral-400 dava 2,5:1 no branco e 2,1:1 sobre o creme da marca,
                  // contra os 4,5:1 exigidos). Como 400/500 so eram usados em TEXTO
                  // (nenhum bg-neutral-400/500 no projeto), escurecemos a escala nesses
                  // tons: 704 usos passam a cumprir AA sem tocar em nenhuma tela.
                  // As bordas (200/300) ficam como estavam, para nao pesar o desenho.
                  fontSize: {
                            // 12px era pequeno demais para texto de apoio, que e o grosso
                            // do portal (734 usos de text-xs). Sobe um ponto e ganha
                            // entrelinha; o mesmo para text-sm, o tamanho mais comum.
                            xs: ["0.8125rem", { lineHeight: "1.45" }],   // 13px
                            sm: ["0.9375rem", { lineHeight: "1.5" }],    // 15px
                            base: ["1rem", { lineHeight: "1.6" }],       // 16px
                  },
                  colors: {
                            neutral: {
                                        400: "#696969", // 5,4:1 no branco | 4,6:1 no creme
                                        500: "#585858", // 7,0:1 | 5,9:1
                                        600: "#464646", // 9,2:1 | 7,8:1
                            },
                            // Tokens de marca por TENANT: os valores vem de variaveis CSS
                            // (triplas RGB, p/ suportar opacidade tipo bg-brand/40). Os
                            // defaults ficam em globals.css (:root = EXP Tour); o portal do
                            // estudante sobrescreve por tenant (ver src/lib/tenant-brand.ts).
                            brand: {
                                        DEFAULT: "rgb(var(--brand) / <alpha-value>)",
                                        gold: "rgb(var(--brand-gold) / <alpha-value>)",
                                        golddark: "rgb(var(--brand-golddark) / <alpha-value>)",
                                        cream: "rgb(var(--brand-cream) / <alpha-value>)",
                            },
                            // Cor do CALL-TO-ACTION por tenant (--p-cta/--p-cta-fg em
                            // globals.css + tenant-brand.ts). EXP Tour: verde (= brand);
                            // Forio: Portal Blue. Botoes de acao primaria usam bg-cta.
                            cta: {
                                        DEFAULT: "var(--p-cta)",
                                        fg: "var(--p-cta-fg)",
                            },
                  },
                  keyframes: {
                            "fade-in-up": {
                                        "0%": { opacity: "0", transform: "translateY(6px)" },
                                        "100%": { opacity: "1", transform: "translateY(0)" },
                            },
                            "scale-in": {
                                        "0%": { opacity: "0", transform: "scale(0.97)" },
                                        "100%": { opacity: "1", transform: "scale(1)" },
                            },
                  },
                  animation: {
                            "fade-in-up": "fade-in-up 0.35s ease-out both",
                            "scale-in": "scale-in 0.2s ease-out both",
                  },
                  fontFamily: {
                            // Titulos por TENANT: --p-heading resolve para Bellefair (EXP
                            // Tour) ou Inter (Forio). Assim `font-serif` acompanha a marca
                            // sem editar cada pagina. Fallbacks se a var faltar.
                            serif: ["var(--p-heading)", "Bellefair", "Georgia", "Times New Roman", "serif"],
                            sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
                  },
          },
    },
    plugins: [],
};

export default config;
