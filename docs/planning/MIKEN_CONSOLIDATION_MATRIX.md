# Miken Finale Tree Consolidation Matrix

The unrelated `CrownFi pageant platform` history is retained only as an archaeological reference. The canonical base is commit `fe2a6a9` and its existing Rust API, Stellar contracts, UI kit, deployment manifests, CI, security checks, and documentation.

| Area from finale tree | Decision | Canonical implementation path |
|---|---|---|
| Prediction markets | Rebuild | Soroban contract with immutable per-market policy, post-close two-step resolution, result proof hash, profit-only fee, exact pool distribution, Rust API indexing, testnet feature gate |
| Pageant/category management | Rebuild | Rust API domain plus PostgreSQL migrations; Next.js consumes typed API |
| Candidate detail pages | Rebuild UI | Existing CrownFi UI kit and canonical contestant records |
| Pageant collectibles | Reconcile and rebuild | Extend the existing `collectible` plus `sale-splitter` design; do not add a parallel custom NFT ownership system |
| Loyalty/rewards/leaderboard | Rebuild | PostgreSQL ledger and Rust API projections; Stellar rewards only when an on-chain transfer is intentional |
| Privy/Web2 login | Adapter spike only | One identity/session boundary supporting Freighter and an optional embedded-wallet provider |
| GCash/PayMongo | Rebuild | Verified webhook inbox, payment-attempt state machine, amount/currency reconciliation, outbox-driven fulfillment |
| KYC | Provider boundary only | Store provider references and decisions, never raw identity documents |
| Organizer onboarding | Port requirements | Rust API workflow, audit log, explicit review states, object-storage media references |
| Community markets | Moderate, then create | User request is off-chain; privileged contract creation happens only after organizer review |
| Raw asset dump, duplicate flags, PDFs, generated snapshots | Reject | Keep curated assets and generated build/test output out of source control |
| Next.js monolith business logic | Reject | Business rules live in `services/api`; Next.js remains the presentation/BFF edge where needed |
| Unrelated root commit/history replacement | Reject | Never merge with `--allow-unrelated-histories`; reconstruct features on the canonical branch |

## Source-of-truth rules

- PostgreSQL is authoritative for raw votes, profiles, organizer review, KYC references, and payment-provider events.
- Stellar/Soroban is authoritative for ticket ownership, collectible ownership, market escrow, resolution, claims, and tally anchors.
- PostgreSQL may index chain activity, but a database row must not manufacture a successful on-chain transaction.
- Provider webhooks and Stellar transactions are ingested idempotently and reconciled asynchronously.
