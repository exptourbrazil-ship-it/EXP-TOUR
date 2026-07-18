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
                                        cream: "#f5ead9",
                            },
                  },
                  fontFamily: {
                            serif: ["Bellefair", "Georgia", "Times New Roman", "serif"],
                  },
          },
    },
    plugins: [],
};

export default config;
