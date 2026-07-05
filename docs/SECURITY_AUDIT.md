# CrownFi security audit notes

Audit date: 2026-07-06  
Scope: `web/` Next.js API routes, wallet/session flow, package supply chain, GitHub Actions security checks, and a source-level review of `contracts/` Soroban contracts.

## Executive summary

CrownFi is a credible hackathon MVP, but it should be presented as **testnet/demo software**, not production voting infrastructure. The architecture is directionally correct: high-volume voting is off-chain, while Stellar anchors proofs and handles ownership/payment primitives. The main risks were in web/API authorization and transaction confirmation, not in the Merkle idea itself.

This pass fixed several high-signal issues that a judge or reviewer could quickly notice:

- admin mutation routes now require a server-verified, wallet-signed admin session;
- live purchase/anchor confirmation now checks that the signed XDR matches a server-prepared intent;
- direct mock mint endpoints are blocked in live mode;
- organizer request review, fan listing, contestant creation, round creation, and round closing are no longer protected only by client UI;
- npm audit is clean after overriding the vulnerable transitive PostCSS copy;
- scheduled GitHub Actions now run CodeQL, dependency review, npm audit, Rust tests/audit, and a secret smoke test.

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
| CI/security automation | Added | Added scheduled + PR/push workflows for CodeQL, dependency review, npm audit, Rust checks, cargo-audit, and secret smoke tests. |

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

Not fully run locally:

- `npm run typecheck`: blocked in this container because Prisma tried to download engines from `binaries.prisma.sh` and DNS/network access failed. The GitHub workflow runs `npm ci` normally and then `prisma generate && tsc --noEmit`.
- `cargo test`, `cargo fmt`, `cargo audit`: not run locally because this container does not have `cargo`/`rustc`. The GitHub workflow installs/uses Rust stable and runs these checks.

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

### E. Voting privacy is only pseudonymous

**Severity:** Medium  
**Status:** Open

The Merkle leaf is `sha256(fanId|contestantId|roundId)`. This keeps raw voter data off-chain, but if the database leaks, fan IDs and vote choices are linkable.

Recommended fix:

- derive leaf commitments from a server-held round salt or voter-specific blind nonce;
- preserve receipt verification without exposing the full mapping.

### F. Round IDs are compressed to `u32` on-chain

**Severity:** Low/Medium  
**Status:** Open

The backend hashes CUID round IDs into `u32` for the audit-anchor contract. Collisions are unlikely in a small demo, but avoidable.

Recommended fix:

- use `BytesN<32>` or `String` round identifiers in the contract storage key instead of `u32`.

### G. Server-side admin auth should also check request origin

**Severity:** Low/Medium  
**Status:** Open

The httpOnly cookie uses `SameSite=Strict`, which helps. For production, mutation routes should additionally verify `Origin`/`Host` to reduce CSRF and cross-site misuse risk.

## CI added

### `.github/workflows/security.yml`

Runs on PR, push to `main`, weekly schedule, and manual dispatch:

- Dependency Review Action on PRs;
- `npm ci`;
- `npm run typecheck`;
- `npm run test:merkle`;
- `npm audit --audit-level=moderate`;
- Rust format/test/audit for contracts;
- secret smoke test for committed Stellar secret keys and real-looking DB URLs.

### `.github/workflows/codeql.yml`

Runs CodeQL for JavaScript/TypeScript with `security-extended` and `security-and-quality` queries.

## Recommended presentation wording

Use this framing during judging:

> CrownFi is not pretending that blockchain makes voting magically faster. Votes are ingested off-chain for scale, then a tamper-evident Merkle root and tally hash are anchored on Stellar for auditability. Tickets, collectibles, and USDC settlement use Stellar where ownership and payments matter. We also added wallet-signed admin sessions, dependency auditing, CodeQL, and recurring CI security checks so the project can be reviewed like an engineering project, not only a demo UI.

