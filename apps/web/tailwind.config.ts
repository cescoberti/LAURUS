import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // LAURUS brand — deep laurel green + warm gold accent.
        laurel: {
          50: "#f0f7f2",
          100: "#dcecdf",
          600: "#2d6a4f",
          700: "#1f5138",
          800: "#163d2a",
          900: "#0f2c1e",
          950: "#0a1f15",
        },
        gold: {
          400: "#d4af37",
          500: "#c99a3b",
          600: "#a97e28",
        },
        ink: {
          900: "#0f1b16",
          700: "#374842",
          500: "#5c6b64",
          300: "#9aa8a1",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,44,30,0.04), 0 1px 3px rgba(15,44,30,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
