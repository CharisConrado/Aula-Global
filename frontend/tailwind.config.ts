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
        // ── Paleta oficial Aula Global ──────────────────────────────
        primary: {
          50:  "#f0f7fb",
          100: "#daedf7",
          200: "#b5daf0",
          300: "#8fc8e8",
          400: "#7FB3D5",  // Primary_Brand
          500: "#5a9ec2",
          600: "#4587a9",
          700: "#356f8c",
          800: "#2a5a74",
          900: "#1e4258",
        },
        calm: {
          50:  "#f2fbf2",
          100: "#e2f6e1",
          200: "#c5edc3",
          300: "#a8e4a7",
          400: "#A2D9A1",  // Support_Green
          500: "#7dc97c",
          600: "#5eba5d",
          700: "#3d9e3e",
        },
        warm: {
          50:  "#fff5ed",
          100: "#ffe8d4",
          200: "#ffd1a9",
          300: "#ffba7f",
          400: "#FFB37B",  // Action_CTA
          500: "#ff9450",
          600: "#f97825",
          700: "#df6219",
        },
        reward: {
          50:  "#fffdf0",
          100: "#fef9db",
          200: "#fef0b3",
          300: "#fde88c",
          400: "#F9E79F",  // Reward_Yellow
          500: "#f7db6d",
          600: "#f5ce40",
        },
        cream:  "#FDF8F2",
        canvas: "#E1EFFF",
        "text-main":   "#34495E",
        "border-soft": "#D5DBDB",
        soft: {
          purple: "#ede9fe",
          pink:   "#fce7f3",
          blue:   "#E1EFFF",
          green:  "#e2f6e1",
          yellow: "#fef9db",
          orange: "#ffe8d4",
        },
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
      fontSize: {
        "kid-sm":   ["1.125rem", { lineHeight: "1.75rem" }],
        "kid-base": ["1.25rem",  { lineHeight: "1.875rem" }],
        "kid-lg":   ["1.5rem",   { lineHeight: "2rem" }],
        "kid-xl":   ["1.875rem", { lineHeight: "2.25rem" }],
        "kid-2xl":  ["2.25rem",  { lineHeight: "2.5rem" }],
      },
      borderRadius: {
        kid:      "1rem",
        "kid-lg": "1.5rem",
        "kid-xl": "2rem",
      },
      boxShadow: {
        soft:       "0 2px 16px rgba(127, 179, 213, 0.12)",
        "soft-lg":  "0 4px 32px rgba(127, 179, 213, 0.18)",
        brand:      "0 4px 20px rgba(127, 179, 213, 0.30)",
        action:     "0 4px 20px rgba(255, 179, 123, 0.40)",
        green:      "0 4px 20px rgba(162, 217, 161, 0.35)",
        card:       "0 1px 8px rgba(52, 73, 94, 0.07), 0 4px 24px rgba(127, 179, 213, 0.10)",
      },
      backgroundImage: {
        "brand-gradient":  "linear-gradient(135deg, #7FB3D5 0%, #A2D9A1 100%)",
        "action-gradient": "linear-gradient(135deg, #FFB37B 0%, #ff9450 100%)",
        "page-gradient":   "linear-gradient(160deg, #FDF8F2 0%, #E1EFFF 60%, #e2f6e1 100%)",
        "card-shine":      "linear-gradient(145deg, #ffffff 0%, #f8fdff 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
