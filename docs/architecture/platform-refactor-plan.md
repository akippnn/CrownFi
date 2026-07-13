# CrownFi platform refactor plan

This document is the compact architecture transition plan. The detailed roadmap and release gates live in:

- [`../planning/PLATFORM_V1_EXECUTION_PLAN.md`](../planning/PLATFORM_V1_EXECUTION_PLAN.md)
- [`../testing/PLATFORM_ACCEPTANCE_MATRIX.md`](../testing/PLATFORM_ACCEPTANCE_MATRIX.md)
- [`../planning/CAPABILITY_AND_HARDCODING_INVENTORY.md`](../planning/CAPABILITY_AND_HARDCODING_INVENTORY.md)

## Goal

Move CrownFi from a one-pageant hackathon MVP with duplicated Next.js business routes and process-local Rust prototypes into a production-shaped Stellar Testnet platform with:

- Next.js for UI, routing, and wallet approval;
- Rust/Axum for business workflows and authorization;
- PostgreSQL/SQLx for durable application state;
- Redis for distributed coordination, rate limits, and jobs;
- Cloudflare R2 for public/product/pageant media;
- Stellar/Soroban for audit commitments, payments, tickets, collectibles, ownership, and settlement;
- workers, indexing, and reconciliation for partial-failure recovery.

## Current state

The repository already contains:

- a working Next.js MVP;
- a Rust/Axum service and platform Compose path;
- PostgreSQL and Redis containers;
- Soroban contracts and Testnet-capable helpers;
- Freighter wallet flows;
- voting proof, ticket, and collectible prototypes;
- a reconstructed prediction-market contract/API boundary;
- shared UI-kit, security, CI, and deployment work.

The repository does **not** yet contain:

- SQLx migrations and canonical Rust repositories;
- persistent organizations/pageants/contestants in Rust;
- R2 media upload and asset records;
- durable transaction intents and jobs;
- a chain indexer/reconciliation service;
- production KYC/provider integration;
- complete Testnet deployment verification.

## Transition principles

1. Preserve working behavior until its replacement passes acceptance tests.
2. Migrate one vertical capability at a time.
3. Do not merge unrelated repository histories or reintegrate ZIP snapshots.
4. Do not silently fall back from Testnet to mock behavior.
5. Do not store raw KYC documents in CrownFi's general media storage.
6. Do not use floating-point values for money.
7. Do not declare chain ownership or settlement successful before confirmation.
8. Keep `main` deployable and use the current integration branch as the collaboration base.

## Milestone A — Canonical runtime baseline

Status: **in progress**.

Completed or established:

- canonical architecture and responsibility boundaries;
- collaboration and PR rules;
- capability/hardcoding inventory;
- acceptance matrix;
- reconstruction/integration branch;
- safe local environment defaults;
- explicit web/API health endpoints;
- canonical Compose health checks;
- clean-clone smoke script and human procedure;
- Testnet contract registry structure;
- SQLx migration ownership decision;
- corrected README/current architecture documentation.

Still required:

- run and pass the clean-clone procedure on a genuinely fresh environment;
- record evidence and any undocumented setup step;
- populate and independently verify Testnet contract deployments;
- decide/implement the separate worker and Stellar processing boundary;
- stabilize and promote the integration branch to `integration/platform-v1`;
- confirm all acceptance checks on the final Milestone A commit.

## Milestone B — Platform/database/media foundation

- add SQLx and versioned migrations;
- add PostgreSQL connection pooling and repositories;
- add users, Stellar accounts, organizations, memberships, roles, and audit logs;
- add pageants, categories, contestants, pageant participation, and dynamic sections;
- add Cloudflare R2 media assets and variants;
- make Rust the canonical read/write API for migrated platform data;
- keep demo content behind an explicit seed command.

## Milestone C — Stellar collectible eCommerce and KYC

- product catalogue and integer Stellar asset prices;
- orders, payment attempts, provider events, and refunds;
- persistent transaction intents and signed-envelope validation;
- worker-driven mint fulfillment and retry;
- indexed ownership and payout reconciliation;
- action-based KYC/policy decisions with provider-held identity documents.

## Milestone D — Durable voting and audit anchoring

- persistent voting rounds, rules, votes, receipts, and snapshots;
- database-level duplicate protection and concurrency tests;
- Merkle proof material and independent verification;
- administrator-approved Soroban anchoring;
- indexing and reconciliation of the commitment.

## Milestone E — Ticketing and operations

- ticket products, inventory, reservations, and expiry;
- Stellar issuance and ownership verification;
- replay-resistant check-in;
- organizer/admin operational dashboards;
- staging deployment, monitoring, backups, and recovery.

## Milestone F — Engagement and gated prediction markets

- append-only loyalty ledger;
- rewards and redemptions;
- pageant-aware leaderboards;
- Testnet-only, moderated, policy-gated prediction markets;
- chain-authoritative positions and settlement reconciliation.

## Milestone A acceptance rule

The baseline is not complete until a new tester can, from a fresh clone and without private instructions:

1. create the documented local environment;
2. build the canonical Compose stack;
3. reach PostgreSQL and Redis health;
4. reach Rust API health/readiness;
5. reach Next.js health and the application;
6. identify that local mode is mock-only;
7. produce the recorded smoke evidence;
8. explain which expected future services are still missing.

Run:

```bash
bash scripts/acceptance/clean-clone-smoke.sh
```

See [`../setup/clean-clone.md`](../setup/clean-clone.md).
