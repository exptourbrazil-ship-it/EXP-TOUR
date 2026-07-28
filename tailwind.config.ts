import type { Config } from "tailwindcss";

const config: Config = {
    content: [
          "./src/app/**/*.{ts,tsx}",
          "./src/components/**/*.{ts,tsx}",
        ],
    theme: {
          extend: {
                  colors: {
                            brand: {
                                        DEFAULT: "#042f1b",
                                        gold: "#c9a35e",
                                        golddark: "#8a6a2f",
                                        cream: "#f5ead9",
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
