import type { Config } from "tailwindcss";

// CrownFi light theme tokens. White background, gold accent.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Luxury Dark Theme Colors:
        // Ink is primary light text, navy is obsidian/black background.
        ink: "#f5f5f7",
        navy: { DEFAULT: "#09090b", 2: "#141417" },
        // Premium gold accents. Soft gold for highlights, deep for shadows.
        gold: { DEFAULT: "#d4af37", soft: "#f3e5ab", deep: "#b8912f", ink: "#f3e5ab" },
        // Obsidian background surfaces and delicate gold borders.
        cream: "#121215",
        line: "rgba(212, 175, 55, 0.15)",
        emerald: { DEFAULT: "#10b981", ink: "#34d399", soft: "rgba(16, 185, 129, 0.15)" },
        ruby: { DEFAULT: "#f43f5e", soft: "rgba(244, 63, 94, 0.15)" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
