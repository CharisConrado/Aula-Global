import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores suaves para niños con TDAH/TEA
        primary: {
          50: "#f0f7ff",
          100: "#e0efff",
          200: "#b8dcff",
          300: "#7cc2ff",
          400: "#36a5ff",
          500: "#0c8aff",
          600: "#006cdb",
          700: "#0055b0",
          800: "#004790",
          900: "#003c78",
        },
        calm: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
        },
        warm: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
        },
        soft: {
          purple: "#e9d5ff",
          pink: "#fce7f3",
          blue: "#dbeafe",
          green: "#d1fae5",
          yellow: "#fef9c3",
          orange: "#ffedd5",
        },
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
      fontSize: {
        "kid-sm": ["1.125rem", { lineHeight: "1.75rem" }],
        "kid-base": ["1.25rem", { lineHeight: "1.875rem" }],
        "kid-lg": ["1.5rem", { lineHeight: "2rem" }],
        "kid-xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "kid-2xl": ["2.25rem", { lineHeight: "2.5rem" }],
      },
      borderRadius: {
        kid: "1rem",
        "kid-lg": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
