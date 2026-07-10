import type { Config } from "tailwindcss";

// CrownFi light theme tokens. White background, gold accent.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgba(var(--text-ink), <alpha-value>)",
        navy: {
          DEFAULT: "var(--bg-navy)",
          2: "var(--bg-navy-2)",
        },
        gold: {
          DEFAULT: "#d4af37",
          soft: "rgba(var(--color-gold-soft), <alpha-value>)",
          deep: "#b8912f",
          ink: "var(--color-gold-ink)",
        },
        cream: "rgba(var(--bg-cream), <alpha-value>)",
        line: "var(--color-line)",
        emerald: {
          DEFAULT: "#10b981",
          ink: "var(--color-emerald-ink)",
          soft: "var(--color-emerald-soft)",
        },
        ruby: {
          DEFAULT: "var(--color-ruby)",
          soft: "var(--color-ruby-soft)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
