# CrownFi implementation status

**Snapshot date:** 2026-07-17

**Code baseline:** `main` at `a6408c7bf23afe84f9e3d39859d9331b3561d5f5`, immediately before this documentation-only consolidation update.

This document separates repository truth into four states:

1. **Merged implementation** — code is present on the default branch.
2. **Passing automated evidence** — a named check passed for an exact branch/SHA.
3. **Open acceptance concern** — required authorization, Testnet, browser, concurrency, restart, recovery, deployment, or independent evidence is incomplete.
4. **Mock/demo/planned** — not live or accepted behavior.

A merged PR, issue checkbox, branch commit, submitted transaction, or database status is not by itself proof that a capability is deployed or accepted.

## July 2026 PR consolidation

The following old-lineage PRs were reconstructed as focused diffs on the restored `main` history and merged:

| PR | Merged SHA | Integrated implementation | Acceptance still open |
|---|---|---|---|
| #48 | `f5da657d24319d806cda948869c5e7c22ee4bfc1` | Full-screen Manage shell, pageant-aware navigation, modular pageant-home editor/renderer, responsive UI-kit integration | Role/device/accessibility/pageant-context/R2/browser/deployed-SHA gates |
| #42 | `bc81bf94129e65e387a979763e6449f55f0745bc` | Durable SQLx voting, receipts, snapshots, Merkle proofs, anchor intent/evidence records, public ballot/receipt UI | Central ACL, rules versioning, Redis controls, real Testnet/indexer/reconciliation, load/restart/recovery/browser/deployment |
| #40 | `dfe58e6c3996686968d874c352bdc8a1bd6070ce` | Buildah remote cache, configurable jobs, `cargo-chef`, release-profile API validation, evolved smoke contract | Cold/warm timing, cache permissions/retention/pruning/hit-rate evidence |
| #43 | `5c0e756e2bbc76caadab4c0b5eea37ce63bb9d2e` | Durable ticket catalogue, inventory/reservations, issuance, ownership/transfer evidence, verification, check-in | Central ACL, seat/GA model, cancellation/refund, real Testnet payment/issuance/indexer, restart/replay/operator/browser/deployment |
| #44 | `927ee17165d9c16b340e5e3324cec7f472b155b8` | Testnet-only accepted positions, exposure, deterministic settlement/refund planning, submitted/confirmed evidence, frontend summaries | Policy/KYC, authority separation, central ACL, real XDR/Freighter/indexer/transfers, dispute/recovery/browser/deployment |
| #45 | `dfe229eff6dbe62cfa6370cf4d7e21085a7beab6` | Narrow fail-closed legacy Arcturus preflight compatibility integrated with current cache/image-policy flow | Upgrade host and prove current authenticated preflight/deployment path |
| #112 | `a6408c7bf23afe84f9e3d39859d9331b3561d5f5` | Same-asset media completion serialization and eight-request PostgreSQL/MinIO regression smoke | Full media lifecycle, lock timeout/operator visibility, browser/deployment evidence |

The archived old heads remain only for audit. They are not collaboration bases or release candidates.

## Merged platform and persistence

The Rust API owns versioned SQLx migrations under `services/api/migrations/`. The merged migration set covers:

- users, linked Stellar accounts, organizations, memberships, pageants, categories, contestants, pageant participation, sections, and audit logs;
- media assets, variants, contestant relationships, and lifecycle evidence;
- products, integer prices, inventory, orders, items, and payment attempts/events;
- persistent Stellar transaction intents, transactions, contract deployments, chain cursors/evidence, and reconciliation results;
- collectible fulfillment jobs, mint evidence, payout rules, batches, and transfers;
- site settings, administrators, wallet challenges, integration settings, and authorization-decision records;
- durable voting, ticketing, prediction position, governance, and settlement/refund records.

`infra/docker-compose.yml` runs SQLx migration initialization through the Rust API image. Prisma remains a compatibility layer in the separate `legacy` schema.

## Merged application surfaces

### Platform, identity, and Manage

- first-administrator setup and wallet challenge/consume flow;
- site and organization roles/memberships;
- pageant/category/contestant/section management;
- full-screen management workspace and pageant-context switching;
- modular pageant-home editor/renderer using shared components;
- responsive desktop/mobile navigation foundation;
- capability/scope authorization middleware and decision logging.

### Media and commerce

- server-side R2/S3-compatible upload intent and completion flow;
- stored-byte size/SHA verification and contestant attachment;
- PostgreSQL advisory-lock serialization for same-asset completion;
- product catalogue, prices, inventory, orders, payment attempts/events;
- durable Stellar transaction intents, submission/evidence/reconciliation records;
- collectible fulfillment and payout state.

### Voting

- PostgreSQL-backed rounds, contestants, votes, idempotency, receipts, and tallies;
- immutable snapshots, tally hash, Merkle root/leaves, and inclusion proofs;
- audit-anchor intent, submission, and accepted-evidence records;
- public round discovery, ballot integration, receipt verification, and anchor status.

### Ticketing

- ticket events/products, sale lifecycle, inventory, and atomic reservations;
- accepted-payment evidence gating and exactly-once issuance state;
- ownership/transfer evidence and public verification;
- replay-resistant check-in records and phone-oriented check-in UI.

### Prediction markets

- Testnet-gated market/policy/stake-intent foundation;
- accepted position evidence and exposure projections;
- deterministic settlement/refund plans;
- submitted-versus-confirmed settlement evidence and public status UI.

Prediction markets are not enabled or certified as a production service.

### Deployment and QA

- canonical Compose startup and clean-clone scripts;
- explicit, repeatable demo seed;
- main-only immutable Arcturus release path;
- image-size enforcement, Buildah remote caching, `cargo-chef`, and slim standalone web runtime;
- temporary legacy-preflight compatibility;
- secret scanning, Rust/web checks, CodeQL, and focused smoke workflows.

## Exact-head automated evidence at the PR #112 candidate

At `7d12863001bd4408705f5eca4f81bfc56894c544`:

Passed:

- media completion concurrency smoke;
- Rust API format/tests;
- SQLx migrations and repeatability;
- authorization ACL smoke;
- CodeQL;
- production manifest smoke;
- commerce catalogue/orders;
- Stellar intents/reconciliation;
- collectible fulfillment;
- payout reconciliation;
- secret and contract checks.

Failed and still requiring repair/re-run on current `main`:

- web TypeScript check in the security workflow;
- organizer web write smoke;
- persistent platform web smoke;
- prediction-market foundation smoke;
- platform clean-clone smoke.

Those failures are open integration evidence. The successful focused media/Rust checks justify the isolated #112 race fix; they do not make the full consolidated head accepted.

## Transitional behavior

The legacy Rust routes in `services/api/src/app.rs` still use process-local fixtures:

```text
GET  /events
GET  /events/:event_id
GET  /events/:event_id/contestants
POST /events/:event_id/vote
GET  /events/:event_id/tally
POST /admin/events/:event_id/snapshot
POST /admin/snapshots/:snapshot_id/anchor
GET  /snapshots/:snapshot_id
GET  /snapshots/:snapshot_id/verify
```

They are compatibility/demo endpoints, not proof of durable voting or ledger reconciliation.

Other transitional boundaries:

- selected Next.js API routes still contain business logic and Prisma access;
- `legacy-db-init` still applies the compatibility schema and seed;
- Redis is present but not yet the complete distributed rate-limit/job system;
- OpenAPI publication and generated TypeScript clients are incomplete;
- media variants, authoritative dimensions, expiry, orphan cleanup, replacement/removal, and retirement remain incomplete;
- KYC/payment-provider integration is incomplete;
- real contract deployments and transaction claims require independent Testnet verification.

## Milestone interpretation

| Milestone | Current interpretation |
|---|---|
| A — canonical baseline | Implementation baseline and branch consolidation are substantial; exact-head full CI, two-machine clean clone, registry, deployment, rollback, and host-upgrade evidence remain open. |
| B — platform and management foundation | Backend and UI foundations are merged; complete ACL, Redis, OpenAPI/client, media lifecycle, browser/role/device/accessibility, and deployment acceptance remain open. |
| C — voting | Durable implementation merged; authorization, real Testnet/indexer/reconciliation, scale/restart/recovery, browser, and deployed-SHA gates remain open. |
| D — ticketing | Durable implementation merged; authorization, payment/issuance/indexer, inventory/refund recovery, operator/browser, and deployed-SHA gates remain open. |
| E — prediction markets | Deterministic Testnet-only implementation merged; policy/KYC, authority, ACL, real XDR/indexer/transfers, dispute/recovery/browser, and deployment gates remain open. |

## Update rule

When implementation or evidence changes:

1. record the exact source and deployed SHA;
2. distinguish merged code, passing automated evidence, human acceptance, Testnet proof, and deployment proof;
3. retain explicit gaps from milestone issues;
4. update architecture, API, feature, setup, and acceptance documents together;
5. attach commands, logs, screenshots, database evidence, Explorer links, and recovery records where required.
