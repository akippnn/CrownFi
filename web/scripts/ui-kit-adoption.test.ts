import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const appShell = source("src/components/AppShell.tsx");
const manage = source("src/app/manage/page.tsx");
const setup = source("src/app/setup/page.tsx");
const account = source("src/app/account/page.tsx");
const legacyUi = source("src/components/ui.tsx");
const registry = source("src/lib/crownfiModules.ts");

assert.match(appShell, /publicPageantModules/, "AppShell must use the shared public module registry");
assert.doesNotMatch(appShell, /const contextLinks = activePageantId\s*\?\s*\[/, "AppShell must not restore a hardcoded pageant navigation array");
assert.match(appShell, /md:hidden/, "The shell must retain a distinct mobile hierarchy");

assert.match(manage, /ManageNavigation/, "Manage must use the modular navigation component");
assert.match(manage, /PageHeader/, "Manage must use the canonical page hierarchy");
assert.doesNotMatch(manage, /function (Input|Panel|TabButton)\(/, "Manage must not recreate local UI-kit controls");

assert.match(setup, /from "@\/components\/ui-kit"/, "Setup must use the canonical UI kit");
assert.doesNotMatch(setup, /function Field\(/, "Setup must not recreate a local field component");
assert.doesNotMatch(setup, /r2SecretAccessKey|r2AccessKeyId/, "Browser setup must not collect R2 access credentials");

assert.match(account, /from "@\/components\/ui-kit"/, "Account must use the canonical UI kit");
assert.match(legacyUi, /export \{ Toast \} from "@\/components\/ui-kit\/Toast"/, "Legacy Toast imports must resolve to the UI kit implementation");

for (const id of ["media", "voting", "tickets", "markets", "collectibles"]) {
  assert.match(registry, new RegExp(`id: "${id}"`), `Manage registry must retain ${id} as an independently owned module`);
}

console.log("UI-kit adoption and modular mobile-shell checks passed.");
