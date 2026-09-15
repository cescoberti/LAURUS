import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Institutional palette — EU blue as the primary, on an off-white
        // ground (shared with the361 / viz-parlamento tokens).
        eu: {
          50: "#eef2fb",
          100: "#dbe3f6",
          200: "#b7c6ec",
          600: "#1f3f9e",
          700: "#14307f",
          800: "#0b2466",
          900: "#003399",
          950: "#001a4d",
        },
        // LAURUS mark — the laurel sprig that resolves into a checkmark.
        // Green is the brand's own note and the colour of "done": final
        // list, verified VL, alert on.
        laurel: {
          50: "#f0f7f2",
          100: "#dcecdf",
          200: "#b9d9c1",
          300: "#8fc19c",
          600: "#2d6a4f",
          700: "#1f5138",
          800: "#163d2a",
          900: "#0f2c1e",
          950: "#0a1f15",
        },
        // EU gold — surface and accent only, never text on a light ground.
        gold: {
          300: "#ffcc00",
          400: "#d4af37",
          500: "#c99a3b",
          600: "#a97e28",
        },
        ink: {
          900: "#141a2b",
          700: "#3a4256",
          500: "#5d667a",
          300: "#9aa2b3",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,26,43,0.05), 0 8px 24px -12px rgba(20,26,43,0.12)",
        sheet: "0 24px 60px -20px rgba(20,26,43,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
