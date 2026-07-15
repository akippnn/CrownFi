# ADR-0004: Stellar-first consolidation after the finale tree replacement

- **Status:** Accepted
- **Date:** 2026-07-14
- **Canonical base:** `fe2a6a9`

## Context

A separately generated finale tree replaced the repository with an unrelated Next.js-centric history. It introduced useful product ideas, but removed the Rust API, deployment architecture, CI/security posture, shared UI foundation, and clear authority boundaries already present in CrownFi.

Merging the histories would preserve neither architecture nor reviewability. Copying the finale implementation would also preserve unsafe financial and identity assumptions.

## Decision

CrownFi keeps the existing repository history and reconstructs useful finale features as reviewed, domain-oriented changes.

```text
Browser / wallet
       |
       v
Next.js web and UI kit
       |
       v
Rust/Axum API
  |       |       |
Postgres Redis  provider adapters
  |
Stellar indexer and reconciliation
       |
       v
Soroban contracts / Stellar assets
```

### Authority boundaries

| Domain | Authority |
|---|---|
| Vote submissions and private voter data | PostgreSQL through Rust API |
| Published vote integrity | Soroban audit anchors |
| Ticket and collectible ownership | Stellar/Soroban |
| Prediction-market stake, resolution, and claims | Stellar/Soroban |
| Payment-provider settlement event | Verified provider webhook ledger |
| KYC decision | Provider; CrownFi stores only reference/status/audit metadata |
| UI dashboards and analytics | Rebuildable PostgreSQL projections |

### Signer boundary

The public Next.js runtime must not hold a master Stellar secret. Privileged signing belongs in an isolated service or explicit administrator-wallet flow with narrow permissions, durable intents, and reconciliation.

### Feature rollout

Prediction markets remain testnet-only and disabled by default. GCash/PayMongo is a fiat checkout integration, not a Stellar on-ramp unless the provider actually settles a Stellar asset. KYC is enforced by policy per action, amount, jurisdiction, and payout direction rather than a single global Boolean.

## Consequences

- Finale features take longer than copying generated code, but retain the architecture and security work already completed.
- Contract and provider integrations require explicit invariants, idempotency, and failure recovery.
- Duplicate sources of truth and direct hot-wallet signing in the web process are prohibited.
- The unrelated history is an archive/reference only, never a merge parent.
