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
DEFAULT: "#0f3d2e",
  gold: "#c9a35e",
  },
},
},
},
plugins: [],
  };

export default config;
