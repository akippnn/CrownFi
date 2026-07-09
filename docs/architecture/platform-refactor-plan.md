# CrownFi platform refactor plan

This branch is the starting point for the broader CrownFi architecture refactor after the security hardening and ticketing PRs are merged.

## Goal

Move CrownFi from a hackathon MVP with Next.js API routes into a clearer full-stack architecture aligned with the hackathon technical plan:

- `apps/web` for the Next.js frontend.
- `services/api` for a Rust/Axum backend.
- `contracts/crownfi_audit` for the Soroban audit checkpoint contract.
- `packages/shared` for shared request/response schemas and types.
- `infra/docker-compose.yml` for local Postgres and Redis.

## Current state

The current MVP already demonstrates the core product narrative:

- off-chain vote intake for speed and privacy;
- database-level duplicate-vote prevention;
- Merkle/tally proofs for published results;
- Soroban/Stellar anchoring for audit checkpoints;
- Freighter wallet flows;
- ticketing and collectible demo flows;
- security hardening around admin sessions and transaction intents.

However, backend logic is still inside Next.js route handlers, and the repo layout is not yet the desired long-term monorepo structure.

## Refactor phases

### Phase 0 — create a working platform path

Status: started in this branch.

- Add `services/api` as a Rust/Axum service.
- Add a local in-memory proof-of-flow API for events, votes, tallies, snapshots, and mock anchoring.
- Add `infra/docker-compose.yml` with Postgres, Redis, API, and web services.
- Add `docs/LOCAL_MVP_TESTING.md` and `docs/PRODUCTION_COMPOSE_PATH.md` so the team has an explicit testing path and production-like path.
- Keep the existing `web/` app and Next.js routes running until each critical flow is migrated and tested.

### Phase 1 — preserve behavior and split components

- Keep the existing app working.
- Extract ticketing, voting, verification, and admin UI into reusable components.
- Keep the new UI components style-isolated enough for the upcoming redesign.
- Fix overclaiming copy around anti-scalping and mock/testnet behavior.

### Phase 2 — introduce Rust API skeleton

- Keep expanding `services/api` beyond the current skeleton.
- Replace in-memory state with Postgres repositories.
- Add Redis-backed rate limiting while retaining a local in-memory fallback.
- Mirror existing API routes without removing Next.js routes yet.
- Add tests for vote submission and duplicate-vote rejection at the API layer.

### Phase 3 — move critical backend flows

- Move vote submission, tally generation, ticket purchase confirmation, and admin actions from Next.js API routes to Rust.
- Keep transaction intent validation and admin auth semantics.
- Add Redis-backed rate limiting or an interface that can fall back to memory in local demo mode.

### Phase 4 — align data model

- Add or rename models for vote receipts, tally snapshots, audit logs, Stellar checkpoints, and contestant support payments if that feature is included.
- Keep vote power separate from tickets, collectibles, and donations.

### Phase 5 — Soroban cleanup

- Rename or wrap `audit-anchor` as `crownfi_audit`.
- Ensure the contract exposes clear checkpoint methods and admin-only commits.
- Keep only hashes, roots, checkpoint metadata, and non-PII values on-chain.

### Phase 6 — documentation and demo polish

- Update README setup commands.
- Add architecture and hackathon pitch docs.
- Add a clean demo script for the team.
- Clearly label local demo mode vs Stellar Testnet mode.

## MVP acceptance rule

The architecture refactor is not considered demo-ready until the documented local path can:

1. Start Postgres and Redis.
2. Start the Rust API.
3. Return API health/readiness.
4. Submit a vote.
5. Reject a duplicate vote.
6. Return a tally.
7. Create a snapshot.
8. Anchor the snapshot in mock mode.
9. Start the web app.
10. Run ticketing in mock mode.

This rule is meant to prevent an architecture-only refactor that looks good in folders but does not actually run.
