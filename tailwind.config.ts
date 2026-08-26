import type { Config } from "tailwindcss";

const config: Config = {
    content: [
          "./src/app/**/*.{ts,tsx}",
          "./src/components/**/*.{ts,tsx}",
        ],
    theme: {
          extend: {
                  colors: {
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
                            serif: ["Bellefair", "Georgia", "Times New Roman", "serif"],
                            sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
                  },
          },
    },
    plugins: [],
};

export default config;
