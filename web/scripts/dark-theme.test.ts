import { readFileSync } from "node:fs";

function requireCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const tailwind = readFileSync("tailwind.config.ts", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

requireCondition(
  /darkMode:\s*["']class["']/.test(tailwind),
  "Tailwind dark variants must be controlled by the root class, not the operating-system preference.",
);
requireCondition(
  /:root\s*\{[\s\S]*?color-scheme:\s*dark;/.test(globals),
  "The root color scheme must default to dark for native controls and browser rendering.",
);
requireCondition(
  !globals.includes("@media (prefers-color-scheme: dark)"),
  "The live theme must not depend on prefers-color-scheme.",
);
requireCondition(
  globals.includes(':root[data-theme="light"]'),
  "The preserved light palette must remain behind an explicit opt-in selector.",
);
requireCondition(
  layout.includes("${body.variable} dark"),
  "The root layout must keep the explicit Tailwind dark class.",
);

console.log("Dark-only theme policy verified.");
