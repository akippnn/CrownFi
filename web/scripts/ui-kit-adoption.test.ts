import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const appShell = source("src/components/AppShell.tsx");
const manage = source("src/app/manage/page.tsx");
const manageNavigation = source("src/components/manage/ManageNavigation.tsx");
const pageantHome = source("src/components/pageant/PageantHomeExperience.tsx");
const pageantHomeRoute = source("src/components/pageant/PageantHomeRoute.tsx");
const pageantHomeEditor = source("src/components/manage/PageantHomeEditor.tsx");
const publicPageant = source("src/app/platform/pageants/[pageantId]/page.tsx");
const setup = source("src/app/setup/page.tsx");
const account = source("src/app/account/page.tsx");
const legacyUi = source("src/components/ui.tsx");
const registry = source("src/lib/crownfiModules.ts");
const widgetRegistry = source("src/lib/pageantHome.ts");

assert.match(appShell, /publicPageantModules/, "AppShell must use the shared public module registry");
assert.doesNotMatch(appShell, /Active pageant navigation/, "Desktop must not restore a second pageant navigation bar");
assert.match(appShell, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/, "Desktop navigation must retain an independently centered middle column");
assert.match(appShell, /if \(isControlPanel\)/, "Manage must bypass the public shell for a full-screen control panel");
assert.match(appShell, /fixed left-4 top-4/, "Mobile navigation controls must float instead of using a fixed top bar");
assert.match(appShell, /fixed bottom-3 left-3 right-3/, "The mobile bottom navigation must float as a contained bar");
assert.match(appShell, /Change pageant/, "The shell must expose a hierarchical pageant chooser");

assert.match(manage, /PageantHomeEditor/, "Manage must provide the modular pageant home editor");
assert.match(manage, /Exit control panel/, "The full-screen control panel must provide an explicit exit");
assert.match(manage, /ManageNavigation/, "Manage must use the modular navigation component");
assert.match(manage, /PageHeader/, "Manage must use the canonical page hierarchy");
assert.doesNotMatch(manage, /function (Input|Panel|TabButton)\(/, "Manage must not recreate local UI-kit controls");
assert.match(manageNavigation, /min-h-\[calc\(100vh-86px\)\]/, "Desktop Manage navigation must fill the control-panel workspace");

assert.match(publicPageant, /PageantHomeRoute/, "The public pageant route must use the shared route bridge");
assert.match(pageantHomeRoute, /PageantHomeExperience/, "The route bridge must render the shared widget experience");
assert.match(pageantHomeRoute, /window\.localStorage\.getItem/, "Editor preview must read the pageant-scoped draft without serializing it into a long URL");
assert.match(pageantHomeEditor, /src=\{previewUrl\}/, "The editor preview must load the exact public route");
assert.match(pageantHomeEditor, /Exact public experience/, "The editor must clearly identify the shared-route preview");
assert.doesNotMatch(pageantHomeEditor, /HeroSection|OrnatePortrait|PromoSection/, "The editor must not duplicate user-facing widget markup");
assert.match(pageantHome, /HeroSection/, "The pageant renderer must reuse the original landing hero component");
assert.match(pageantHome, /ThreeDCarousel/, "The pageant renderer must reuse the delegate carousel");
assert.match(pageantHome, /NFTCollectibleWithPedestal/, "The pageant renderer must reuse collectible presentation");
assert.match(pageantHome, /PromoSection/, "The pageant renderer must reuse ticket promotion presentation");

for (const id of ["hero", "delegates", "categories", "collectible", "tickets", "about", "footer"]) {
  assert.match(widgetRegistry, new RegExp(`id: "${id}"`), `Pageant home registry must retain the ${id} widget`);
}

assert.match(setup, /from "@\/components\/ui-kit"/, "Setup must use the canonical UI kit");
assert.doesNotMatch(setup, /function Field\(/, "Setup must not recreate a local field component");
assert.doesNotMatch(setup, /r2SecretAccessKey|r2AccessKeyId/, "Browser setup must not collect R2 access credentials");
assert.match(account, /from "@\/components\/ui-kit"/, "Account must use the canonical UI kit");
assert.match(legacyUi, /export \{ Toast \} from "@\/components\/ui-kit\/Toast"/, "Legacy Toast imports must resolve to the UI kit implementation");

for (const id of ["home", "media", "voting", "tickets", "markets", "collectibles"]) {
  assert.match(registry, new RegExp(`id: "${id}"`), `Manage registry must retain ${id} as an independently owned module`);
}

console.log("UI-kit adoption, full-screen control, and shared pageant-widget checks passed.");
