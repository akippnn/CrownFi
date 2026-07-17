# Rust API endpoint inventory

This is a route-level inventory of the Rust/Axum service on `main` after the July 2026 consolidation. It is not a substitute for OpenAPI schemas, examples, authorization tests, or acceptance evidence.

## Transport and authorization boundaries

The centralized middleware classifies requests as public, token-only, capability-protected, or denied.

Protected transports use server-side headers:

| Header | Boundary |
|---|---|
| `x-crownfi-web-token` | Private Next.js-to-Rust internal transport. |
| `x-crownfi-user-id` | Actor identity bound to an authenticated CrownFi session. It is not trusted alone. |
| `x-admin-demo-token` | Transitional admin API transport; local/demo compatibility only. |
| `x-crownfi-payout-worker-token` | Restricted worker/reconciliation transport. |

Never expose internal, admin, setup, worker, signing, R2, database, or provider secrets to client JavaScript.

**Known gap:** newer voting, ticketing, and market mutation/worker routes still require complete centralized capability mapping, organization/resource scoping, transport restriction, authority separation, and negative ACL tests. Their handler-level checks do not waive that gate.

## Health and legacy demonstration routes

```text
GET  /health
GET  /ready
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

Except for health/readiness, these routes use process-local fixtures in `services/api/src/app.rs`. They are not the canonical durable voting API.

## Identity, setup, access, and Manage

```text
GET  /setup/status
POST /internal/identity/challenges
POST /internal/identity/challenges/:challenge_id/consume
GET  /internal/identity/users/:user_id
POST /internal/setup/complete
GET  /internal/site-settings

GET  /internal/access/organizations/:organization_id/members/:actor_user_id
POST /internal/access/organizations/:organization_id/members

GET  /internal/manage/overview/:user_id
POST /internal/manage/pageants
POST /internal/manage/categories
POST /internal/manage/contestants
POST /internal/manage/seed-miss-stellarverse
```

`seed-miss-stellarverse` is a local-only management fixture. The general canonical demo seed is `crownfi-api seed demo`.

## Platform reads and writes

```text
GET  /platform/organizations
GET  /platform/organizations/:organization_id
GET  /platform/organizations/:organization_id/pageants
GET  /platform/pageants/:pageant_id/categories
GET  /platform/pageants/:pageant_id/contestants
GET  /platform/pageant-contestants/:pageant_contestant_id/sections

POST /admin/platform/bootstrap
POST /admin/platform/organizations/:organization_id/pageants
POST /admin/platform/pageants/:pageant_id/categories
POST /admin/platform/pageants/:pageant_id/contestants
POST /admin/platform/pageant-contestants/:pageant_contestant_id/sections
```

These routes use PostgreSQL and organization-scoped authorization.

## Media

```text
GET  /platform/media/:media_asset_id
GET  /platform/pageant-contestants/:pageant_contestant_id/media
POST /admin/platform/organizations/:organization_id/media/upload-intents
POST /admin/platform/media/:media_asset_id/complete
POST /admin/platform/pageant-contestants/:pageant_contestant_id/media
```

R2 write routes fail closed when storage is not configured. Completion verifies stored bytes rather than trusting client metadata. Requests completing the same asset are serialized with a PostgreSQL advisory lock.

## Catalogue and orders

```text
GET  /platform/organizations/:organization_id/products
GET  /platform/products/:product_id
GET  /platform/organizations/:organization_id/collectible-collections
GET  /platform/collectible-collections/:collection_id/editions

POST /admin/platform/organizations/:organization_id/products
POST /admin/platform/organizations/:organization_id/collectible-collections
POST /admin/platform/collectible-collections/:collection_id/editions

POST /admin/platform/organizations/:organization_id/orders
GET  /admin/platform/orders/:order_id
POST /admin/platform/orders/:order_id/payment-attempts
POST /admin/platform/payment-attempts/:payment_attempt_id/events
```

Prices use integer units and explicit Stellar asset metadata. Provider events must be authenticated and idempotent before production use.

## Stellar transaction intents and reconciliation

```text
POST /admin/platform/orders/:order_id/stellar-intents
GET  /admin/platform/stellar-intents/:intent_id
POST /admin/platform/stellar-intents/:intent_id/signed-envelope

GET  /admin/platform/contract-deployments
POST /admin/platform/stellar-intents/:intent_id/submission-receipt
POST /admin/platform/stellar-intents/:intent_id/chain-evidence
GET  /admin/platform/stellar-intents/:intent_id/reconciliation
```

A built, signed, or submitted transaction is not a successful payment. Success requires accepted ledger evidence and reconciliation to the stored intent.

## Collectible fulfillment and payouts

```text
POST /admin/platform/orders/:order_id/fulfillment-jobs
GET  /admin/platform/fulfillment-jobs/:job_id
POST /admin/platform/fulfillment-jobs/:job_id/claim
POST /admin/platform/fulfillment-jobs/:job_id/submission
POST /admin/platform/fulfillment-jobs/:job_id/failure
POST /admin/platform/fulfillment-jobs/:job_id/mint-evidence

POST /admin/platform/organizations/:organization_id/products/:product_id/payout-rules
POST /admin/platform/orders/:order_id/payout-batches
GET  /admin/platform/payout-batches/:batch_id
POST /internal/platform/payout-batches/:batch_id/submission
POST /internal/platform/payout-batches/:batch_id/transfer-evidence
POST /internal/platform/payout-batches/:batch_id/failure
```

Worker claims, submissions, evidence, failures, and retries are stored separately so partial failures remain observable.

## Durable voting

```text
GET  /voting/pageants/:pageant_id/rounds
POST /voting/rounds
GET  /voting/rounds/:round_id
POST /voting/rounds/:round_id/open
POST /voting/rounds/:round_id/close
POST /voting/rounds/:round_id/votes
GET  /voting/rounds/:round_id/tally
POST /voting/rounds/:round_id/snapshot
GET  /voting/rounds/:round_id/snapshot
GET  /voting/receipts/:receipt_hash/proof
GET  /voting/rounds/:round_id/anchor

POST /internal/voting/snapshots/:snapshot_id/anchor-intents
POST /internal/voting-anchor/intents/:intent_id/submission
POST /internal/voting-anchor/intents/:intent_id/evidence
```

The SQLx implementation persists accepted votes, idempotency keys, receipts, snapshots, Merkle leaves, anchor intents, submission state, and accepted evidence. It still needs complete shared ACL classification and real restricted Testnet/indexer/reconciliation acceptance.

## Durable ticketing

```text
GET  /ticketing/pageants/:pageant_id/events
POST /ticketing/events
GET  /ticketing/events/:event_id/products
POST /ticketing/events/:event_id/products
POST /ticketing/events/:event_id/on-sale
POST /ticketing/products/:ticket_product_id/reservations
GET  /ticketing/reservations/:reservation_id

POST /ticket-operations/orders/:order_id/prepare-issuance
POST /ticket-operations/issuances/:issuance_id/ownership-evidence
GET  /ticketing/tokens/:token_id/verify
POST /ticketing/issuances/:issuance_id/check-in

POST /internal/ticketing/issuances/:issuance_id/transfers
POST /internal/ticketing/transfers/:transfer_id/review
POST /internal/ticket-operations/transfers/:transfer_id/submission
POST /internal/ticket-operations/transfers/:transfer_id/evidence
```

The implementation persists inventory, reservations, issuance, ownership/transfer evidence, and check-in state. Real payment/issuance/indexer provenance, complete cancellation/refund handling, operator authorization, and acceptance remain open.

## Prediction markets — Testnet-only

Foundation routes:

```text
GET  /markets
GET  /markets/:market_id
POST /internal/markets
POST /internal/markets/:market_id/policy-decisions
POST /internal/markets/:market_id/transitions
POST /internal/markets/:market_id/stake-intents
GET  /internal/market-intents/:intent_id
POST /internal/market-intents/:intent_id/submission
```

Position and settlement routes:

```text
POST /market-operations/markets/:market_id/position-evidence
POST /market-operations/markets/:market_id/settlement-plan
GET  /markets/:market_id/positions-summary
GET  /markets/:market_id/settlement-plan
POST /market-operations/settlement-items/:item_id/submission
POST /market-operations/settlement-items/:item_id/evidence
GET  /markets/:market_id/settlement-status
```

These routes model Testnet-gated deterministic state. They do not establish production legality, complete KYC/policy, real unsigned XDR, Freighter acceptance, independent indexing, actual payout/refund transfer execution, or complete governance authority.

## Missing API documentation work

- publish generated OpenAPI from the Rust service;
- document request/response/error schemas and examples;
- generate and pin the TypeScript client;
- map capability names, roles, scopes, and transports to every protected route;
- document idempotency keys, state transitions, retry rules, and incident behavior;
- version externally consumed APIs before compatibility promises are made.
