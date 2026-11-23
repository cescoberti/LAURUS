import type { Config } from "tailwindcss";

/**
 * The design system is declared here and nowhere else. Three levers do most
 * of the work across the whole app, because the UI already speaks in these
 * utilities: the neutral scale (`slate-*`), the radii, and the shadows.
 * Refining them here lifts every surface at once instead of file by file.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Institutional palette — EU blue as the primary, on an off-white
        // ground (shared with the361 / viz-parlamento tokens).
        eu: {
          50: "#f2f5fc",
          100: "#e4eaf7",
          200: "#c6d2ee",
          300: "#93a8dc",
          600: "#22418f",
          700: "#182f6f",
          800: "#102356",
          900: "#003399",
          950: "#0a1636",
        },
        // LAURUS mark — the laurel sprig that resolves into a checkmark.
        // Green is the brand's own note and the colour of "done": final
        // list, verified VL, alert on.
        laurel: {
          50: "#f1f6f2",
          100: "#dfeae1",
          200: "#bfd6c5",
          300: "#93bfa0",
          600: "#2d6a4f",
          700: "#1f5138",
          800: "#163d2a",
          900: "#0f2c1e",
          950: "#0a1f15",
        },
        // EU gold — surface and accent only, never text on a light ground.
        // The pure #ffcc00 is kept for dark grounds; on paper the muted
        // brass reads expensive where the primary yellow reads cheap.
        gold: {
          200: "#f0e3b8",
          300: "#ffcc00",
          400: "#d4af37",
          500: "#b8923a",
          600: "#8f7026",
        },
        ink: {
          900: "#141a2b",
          700: "#3f465a",
          500: "#5f6779",   /* 5.6:1 on the paper ground */
          400: "#767e90",   /* 4.5:1 — the lightest tone allowed to carry words */
          300: "#8d95a4",   /* decorative only: placeholders, inert glyphs */
        },
        /**
         * The neutral ground. Deliberately warm — a hint of paper against
         * the cool ink — and very low in contrast, so a 1px border reads as
         * a hairline rather than a drawn line. `slate` keeps its name because
         * the whole app already asks for it by that name.
         */
        slate: {
          50: "#f7f6f2",
          100: "#efeee9",
          200: "#e6e4dd",
          300: "#cfcdc4",
          400: "#aaa8a0",
          500: "#84827b",
          600: "#62615b",
          700: "#4a4944",
          800: "#32312e",
          900: "#1d1c1a",
          950: "#121211",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      /** Display sizes carry their own tracking and leading: large type needs
       *  negative tracking, small caps-tracked labels need positive. */
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.14em" }],
        "display-sm": ["clamp(1.5rem,2.4vw,1.875rem)", { lineHeight: "1.12", letterSpacing: "-0.022em" }],
        "display-md": ["clamp(2rem,3.4vw,2.75rem)", { lineHeight: "1.06", letterSpacing: "-0.03em" }],
        "display-lg": ["clamp(2.125rem,5vw,4rem)", { lineHeight: "1.02", letterSpacing: "-0.036em" }],
        "display-xl": ["clamp(3rem,7vw,5.5rem)", { lineHeight: "0.98", letterSpacing: "-0.042em" }],
        stat: ["clamp(2.25rem,3.6vw,3.25rem)", { lineHeight: "1", letterSpacing: "-0.035em" }],
      },
      /** A fixed scale. Section rhythm lives at the top of it. */
      spacing: {
        4.5: "1.125rem",
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
        30: "7.5rem",
        34: "8.5rem",
        section: "7.5rem",
        "section-lg": "10rem",
      },
      maxWidth: {
        prose: "40rem",
        shell: "78rem",
      },
      borderRadius: {
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1.125rem",
        "2xl": "1.5rem",
        "3xl": "1.875rem",
        "4xl": "2.5rem",
      },
      /**
       * Elevation is layered and nearly invisible: a contact shadow, a soft
       * mid spread, and a wide ambient pool. One heavy shadow reads cheap;
       * three light ones read like a physical object on paper.
       */
      boxShadow: {
        hairline: "0 0 0 1px rgba(20,26,43,0.05)",
        sm: "0 1px 2px rgba(20,26,43,0.04), 0 1px 1px rgba(20,26,43,0.03)",
        card: "0 1px 1px rgba(20,26,43,0.03), 0 4px 12px -4px rgba(20,26,43,0.05), 0 18px 44px -24px rgba(20,26,43,0.10)",
        lift: "0 1px 1px rgba(20,26,43,0.03), 0 10px 24px -8px rgba(20,26,43,0.08), 0 32px 64px -28px rgba(20,26,43,0.16)",
        sheet: "0 2px 4px rgba(20,26,43,0.04), 0 32px 80px -24px rgba(20,26,43,0.28)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.7)",
        "glow-eu": "0 10px 30px -12px rgba(0,51,153,0.45)",
        "glow-gold": "0 10px 30px -14px rgba(184,146,58,0.5)",
      },
      transitionTimingFunction: {
        lux: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      backgroundImage: {
        "paper-top": "radial-gradient(120% 70% at 50% -10%, rgba(0,51,153,0.055) 0%, rgba(0,51,153,0) 62%)",
        "paper-warm": "radial-gradient(80% 50% at 85% 8%, rgba(184,146,58,0.07) 0%, rgba(184,146,58,0) 60%)",
        "navy-deep": "linear-gradient(145deg, #0a1636 0%, #102356 48%, #182f6f 100%)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "none" },
        },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        rise: "rise 700ms cubic-bezier(0.22,1,0.36,1) both",
        fade: "fade 500ms cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
