# CrownFi security audit notes

Audit date: 2026-07-06  
CodeQL enablement update: 2026-07-12
Scope: `web/` Next.js API routes, wallet/session flow, package supply chain, GitHub Actions security checks, and a source-level review of `contracts/` Soroban contracts.

## Executive summary

CrownFi is a credible hackathon MVP, but it should be presented as **testnet/demo software**, not production voting infrastructure. The architecture is directionally correct: high-volume voting is off-chain, while Stellar anchors proofs and handles ownership/payment primitives. The main risks were in web/API authorization and transaction confirmation, not in the Merkle idea itself.

This pass fixed several high-signal issues that a judge or reviewer could quickly notice:

- admin mutation routes now require a server-verified, wallet-signed admin session;
- live purchase/anchor confirmation now checks that the signed XDR matches a server-prepared intent;
- direct mock mint endpoints are blocked in live mode;
- organizer request review, fan listing, contestant creation, round creation, and round closing are no longer protected only by client UI;
- npm audit is clean after overriding the vulnerable transitive PostCSS copy;
- scheduled GitHub Actions run npm audit, TypeScript/Merkle checks, Rust format/test, blocking Rust vulnerability audit, non-blocking Rust advisory reporting, and a secret smoke test; CodeQL advanced setup now uploads JavaScript/TypeScript, Rust, and GitHub Actions findings to GitHub code scanning.


## Hackathon/VPS deployment posture

This audit is intentionally scoped for a hackathon MVP and a cautious VPS-hosted testnet demo. CrownFi should show that security is understood and that obvious demo-risk issues have been addressed, but the project should not spend hackathon time chasing every theoretical production-grade issue.

For judging and demos, the intended posture is:

- off-chain voting with database duplicate prevention;
- Stellar/Soroban used for audit commitments, tickets, collectibles, and payments where appropriate;
- raw voter personal data not placed on-chain;
- server-side admin checks for organizer/tabulator actions;
- transaction-intent validation for signed XDR confirmation flows;
- clear mock/testnet labels when flows are not live;
- baseline CI checks that do not depend on CodeQL, plus uploaded CodeQL code-scanning results now that repository access is enabled.

For a VPS-hosted demo, the minimum expectation is HTTPS in front of the app/API, private Postgres/Redis networking, strong secrets, a dedicated testnet platform wallet, and no real customer data. This remains a testnet MVP and not production voting or real-money infrastructure.

## Changes made in this pass

| Area | Status | Change |
|---|---:|---|
| NPM dependency audit | Fixed | `postcss` upgraded/overridden to `^8.5.10`; `npm audit --audit-level=moderate` now reports 0 vulnerabilities. |
| Admin auth | Fixed for MVP | Added Freighter `signMessage` challenge/verify flow, httpOnly admin cookie, HMAC session token, and server-side allowlist checks. |
| Admin API routes | Fixed for MVP | Protected admin mutations and sensitive admin reads with `requireAdmin()`. |
| Signed XDR confirmation | Fixed for MVP | Added short-lived transaction intents; confirmation must match the server-prepared XDR body hash and expected source account. |
| Live-mode direct mint bypass | Fixed | Legacy `POST /api/tickets` and `POST /api/collectibles` now reject in live mode and require prepare/confirm flow. |
| Faucet abuse | Improved | Added IP rate limiting and capped per-request mint amount. |
| Local artifacts | Fixed | Removed tracked `.claude/settings.local.json` and `web/tsconfig.tsbuildinfo`; ignored them going forward. |
| CI/security automation | Updated | Retained scheduled + PR/push dependency, TypeScript/Merkle, Rust, and secret checks; enabled full CodeQL advanced setup with uploaded JavaScript/TypeScript, Rust, and GitHub Actions results. |

## Verification performed

Commands run locally:

```bash
cd web
npm audit --audit-level=moderate --omit=dev
npm audit --audit-level=moderate
npm run test:merkle
```

Results:

- `npm audit --audit-level=moderate --omit=dev`: **0 vulnerabilities**
- `npm audit --audit-level=moderate`: **0 vulnerabilities**
- `npm run test:merkle`: **passed**

Not fully run locally in the patch container:

- `npm run typecheck`: blocked in this container because Prisma tried to download engines from `binaries.prisma.sh` and DNS/network access failed. The GitHub workflow runs `npm ci` normally and then `prisma generate && tsc --noEmit`.
- `cargo test`, `cargo fmt`, `cargo audit`: not run in the patch container because it does not have `cargo`/`rustc`. The GitHub workflow installs/uses Rust stable and runs these checks.

Follow-up validation on the reviewer machine passed:

- `npm ci`
- `npm audit --audit-level=moderate`
- `npm audit --audit-level=moderate --omit=dev`
- `npm run typecheck`
- `npm run test:merkle`
- `cargo fmt --all -- --check`
- `cargo test --workspace --locked`
- committed-secret smoke test

`cargo audit --deny warnings` reports transitive advisory warnings from the Soroban/Stellar dependency chain. The workflow now keeps `cargo audit` as a blocking vulnerability check and reports `cargo audit --deny warnings` as a non-blocking advisory step.

## Fixed findings

### 1. Admin routes were client-gated only

**Severity:** High  
**Status:** Fixed for MVP

Before this pass, the admin page hid controls unless the connected wallet was in `NEXT_PUBLIC_ADMIN_WALLETS`, but routes such as contestant creation, round creation, round closing, and organizer request approval were callable directly.

Affected examples:

- `POST /api/rounds`
- `POST /api/contestants`
- `POST /api/rounds/:id/close`
- `POST /api/rounds/:id/prepare-close`
- `POST /api/rounds/:id/confirm-close`
- `GET/PATCH /api/organizer-requests`
- `GET /api/fans`

Mitigation added:

- `POST /api/admin/challenge`
- `POST /api/admin/verify`
- Freighter `signMessage()` challenge signing
- server verification of the SEP-53-style signature hash
- httpOnly `crownfi_admin` cookie
- HMAC session token with short TTL
- `requireAdmin()` on sensitive routes

Production note: set `ADMIN_SESSION_SECRET` in deployment. The dev fallback intentionally throws in production if missing.

### 2. Purchase/anchor confirmation trusted client-submitted XDR too broadly

**Severity:** High  
**Status:** Fixed for MVP

Before this pass, a client could submit `signedXdr` during confirm. The app would submit it and then mint/record a ticket or collectible, without checking that the signed transaction was exactly the one CrownFi prepared.

Mitigation added:

- prepare routes now create a short-lived transaction intent;
- the intent stores the prepared transaction body hash and expected source account;
- confirm routes require `intentId`;
- `submitSignedXdr()` verifies the signed transaction source and transaction body hash before submitting.

This prevents “submit unrelated signed XDR, then get a CrownFi mint” in the MVP flow.

Production note: in-memory intents are enough for a single demo server, but production/serverless deployments should store them in Redis or Postgres.

### 3. Live direct mint bypass

**Severity:** High  
**Status:** Fixed

The legacy mock endpoints could mint/record tickets or collectibles directly. In live mode, this could bypass the USDC payment flow.

Mitigation added:

- `POST /api/tickets` rejects in live mode;
- `POST /api/collectibles` rejects in live mode;
- live purchases must use prepare/sign/confirm.

### 4. Organizer and fan data exposure

**Severity:** Medium  
**Status:** Improved

`GET /api/organizer-requests` exposed organizer contact names/emails to anyone who knew the route. `GET /api/fans` exposed fan records.

Mitigation added:

- `GET /api/organizer-requests` now requires admin auth;
- `PATCH /api/organizer-requests` now requires admin auth;
- `GET /api/fans` now requires admin auth.

### 5. Test faucet abuse

**Severity:** Medium  
**Status:** Improved

The faucet allowed arbitrary requested amounts.

Mitigation added:

- per-IP rate limit;
- amount must be finite, positive, and `<= 100` USDC per request.

Production note: replace the in-memory limiter with Upstash/Redis before any public deployment.

### 6. Vulnerable transitive PostCSS copy

**Severity:** Moderate  
**Status:** Fixed

`npm audit` reported a moderate PostCSS advisory through Next's nested dependency tree. `postcss` is now upgraded/overridden to `^8.5.10`, and audit is clean.

### 7. Local/generated artifacts committed

**Severity:** Low  
**Status:** Fixed

Removed tracked local artifacts:

- `.claude/settings.local.json`
- `web/tsconfig.tsbuildinfo`

These are now ignored. This helps reduce the “AI-generated/vibecoded repo dump” signal and avoids committing local tool state.

## Open findings / next fixes

### A. Fan wallet login is still not cryptographically proven server-side

**Severity:** High  
**Status:** Open

`POST /api/fans/connect` still accepts a wallet address from the browser and upserts a fan. The browser obtained that address from Freighter, but the server does not yet verify a wallet signature for normal fan sessions.

Impact:

- a malicious client could claim another wallet address;
- voting uses `fanId`, so a client that discovers or creates fan records may attempt impersonation flows;
- dashboard/purchase flows should eventually require a signed fan session, not just a posted `fanId`.

Recommended fix:

- reuse the admin challenge pattern for all fans;
- issue an httpOnly `crownfi_fan` session cookie;
- make `/api/vote`, `/api/dashboard`, ticket purchase, collectible purchase, and receipt lookup derive `fanId` from the session instead of trusting request body/query parameters.

### B. Payment and mint are not atomic

**Severity:** High for real money  
**Status:** Open

The live purchase flow submits the buyer's USDC split, then separately mints the NFT using the platform account. If payment succeeds but minting fails, reconciliation is manual.

Recommended fix:

- move payment + mint into one Soroban contract transaction;
- or add an idempotent server-side settlement table with retry/refund states.

### C. In-memory challenges, sessions, rate limits, and tx intents are demo-only

**Severity:** Medium  
**Status:** Open

The new challenge and intent stores use process memory. This is acceptable for a single local demo server, but not for multiple instances, serverless cold starts, or production.

Recommended fix:

- Redis/Upstash for rate limits and short-lived challenges/intents;
- Postgres table for purchase settlement state.

### D. Soroban contracts need CI build/test confirmation

**Severity:** Medium  
**Status:** Open until CI passes

The Rust/Soroban source review is promising, especially `audit-anchor` and `sale-splitter`, but local build/test could not be run in this environment. The new GitHub workflow should be the source of truth.

Extra concern:

- `ticket` and `collectible` depend on OpenZeppelin Stellar crates and macros. Verify the exact `stellar-tokens` API and `ContractOverrides` pattern against the pinned crate version in CI.

### E. Rust dependency advisory warnings are transitive through Soroban

**Severity:** Low/Medium supply-chain visibility  
**Status:** Documented / non-blocking CI report

`cargo audit --deny warnings` reports advisory warnings for Rust crates pulled through the Soroban/Stellar dependency chain:

- `derivative 2.2.0` — unmaintained, pulled through Arkworks/Soroban dependencies;
- `paste 1.0.15` — unmaintained, pulled through Arkworks/Soroban dependencies;
- `num-bigint 0.4.7` — yanked, pulled through Arkworks/Soroban dependencies.

These are not direct CrownFi dependencies. The project keeps `cargo audit` as a blocking vulnerability check, while `cargo audit --deny warnings` is retained as a non-blocking visibility check. Revisit this when upgrading Soroban/Stellar SDK versions. Do not force random overrides into the Soroban dependency tree without verifying compatibility.

### F. Voting privacy is only pseudonymous

**Severity:** Medium  
**Status:** Open

The Merkle leaf is `sha256(fanId|contestantId|roundId)`. This keeps raw voter data off-chain, but if the database leaks, fan IDs and vote choices are linkable.

Recommended fix:

- derive leaf commitments from a server-held round salt or voter-specific blind nonce;
- preserve receipt verification without exposing the full mapping.

### G. Round IDs are compressed to `u32` on-chain

**Severity:** Low/Medium  
**Status:** Open

The backend hashes CUID round IDs into `u32` for the audit-anchor contract. Collisions are unlikely in a small demo, but avoidable.

Recommended fix:

- use `BytesN<32>` or `String` round identifiers in the contract storage key instead of `u32`.

### H. Server-side admin auth should also check request origin

**Severity:** Low/Medium  
**Status:** Open

The httpOnly cookie uses `SameSite=Strict`, which helps. For production, mutation routes should additionally verify `Origin`/`Host` to reduce CSRF and cross-site misuse risk.


### I. Platform refactor introduces a Rust API surface

**Severity:** Medium until fully wired  
**Status:** In progress

The `refactor/platform-architecture` work adds a Rust/Axum API skeleton and Docker Compose path. This is the correct direction for a more production-like deployment, but the Rust service currently starts as an MVP scaffold and uses mock/in-memory flows while behavior is migrated from Next.js API routes.

Security expectations for this refactor:

- do not remove the existing wallet-signed admin checks while moving routes;
- keep transaction intents and signed-XDR body/source validation;
- keep duplicate-vote prevention at the database layer;
- move rate limits, sessions, challenges, and tx intents to Redis/Postgres before any multi-instance deployment;
- expose Postgres/Redis only on private Docker networks or VPS firewall rules;
- keep mock mode clearly labelled.

This is acceptable for hackathon architecture work as long as the README, SECURITY.md, and deployment docs continue to say that the system is testnet/MVP only.


### J. UI/component duplication can hide security copy and flow regressions

**Severity:** Low/Medium  
**Status:** In progress

Large page files made it easy to duplicate ticketing UI, anti-scalping language, seat assignment controls, and test/demo links. This is not a direct exploit by itself, but it increases the chance that a future UI redesign changes one flow while missing another duplicate component.

Mitigation in progress:

- extract ticketing UI into `web/src/components/tickets/*`;
- centralize ticketing copy in `web/src/lib/tickets/ticketCopy.ts`;
- centralize seat formatting helpers in `web/src/lib/tickets/seat.ts`;
- keep pages as composition layers where possible.

Future UI redesign work should modify shared components rather than cloning page sections.

## CI added

### `.github/workflows/security.yml`

Runs on PR, push to `main`, weekly schedule, and manual dispatch. These baseline dependency, test, contract, and secret checks remain independent of CodeQL so they continue to provide useful failures even if code scanning is temporarily unavailable.

- `npm ci`;
- `npm audit --audit-level=moderate`;
- npm lockfile integrity smoke check;
- `npm run typecheck`;
- `npm run test:merkle`;
- Rust format/test for contracts;
- blocking `cargo audit` vulnerability check;
- non-blocking `cargo audit --deny warnings` advisory report;
- secret smoke test for committed Stellar secret keys and real-looking DB URLs.

### `.github/workflows/codeql.yml`

Runs CodeQL advanced setup for JavaScript/TypeScript, Rust, and GitHub Actions workflows using parallel matrix jobs and `build-mode: none`. The workflow grants the required `security-events: write` permission, uses the `security-extended` and `security-and-quality` query suites, and uploads findings to the repository Security tab.

### Repository-security follow-up

CodeQL upload is now enabled. Confirm and configure these supply-chain features separately because CodeQL access does not automatically prove that they are enabled:

- Dependency graph / Dependency Review;
- Dependabot alerts and version/security update PRs.

## Recommended presentation wording

Use this framing during judging:

> CrownFi is not pretending that blockchain makes voting magically faster. Votes are ingested off-chain for scale, then a tamper-evident Merkle root and tally hash are anchored on Stellar for auditability. Tickets, collectibles, and USDC settlement use Stellar where ownership and payments matter. We also added wallet-signed admin sessions, dependency auditing, CodeQL, and recurring CI security checks so the project can be reviewed like an engineering project, not only a demo UI.

