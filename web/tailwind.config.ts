import type { Config } from "tailwindcss";

// CrownFi light theme tokens. White background, gold accent.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ink (primary text) and navy for headings.
        ink: "#23252f",
        navy: { DEFAULT: "#1a1f35", 2: "#2a2f52" },
        // Gold accent. Use `gold` for fills, `gold-ink` for gold TEXT on white (contrast-safe).
        gold: { DEFAULT: "#d4af37", soft: "#e6cf8f", deep: "#b8912f", ink: "#a97f16" },
        // Warm off-white surfaces + borders.
        cream: "#faf7ef",
        line: "#e7e2d3",
        emerald: { DEFAULT: "#10b981", ink: "#0f6e56", soft: "#e1f5ee" },
        ruby: { DEFAULT: "#e11d48", soft: "#fbe9ef" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
