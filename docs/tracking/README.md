# CrownFi tracking checkpoint

Updated: 2026-07-15, Asia/Manila

## Repository authority

- Team/upstream repository: `Web3Iloilo/CrownFi`
- Connected working fork and tracker: `akippnn/CrownFi`
- Canonical development branch: `integration/platform-v1`
- Current fork integration head: `63df978b029b34a7b96ddb5d17ecf2d6e1b4af4b`
- Recorded deployed revision: `d9c3cae15e127b988c5e039c1ebe26e5e3815d43`

GitHub issue and pull-request numbers are repository-local. Stable roadmap IDs such as `B19`, `E2`, and `E3` remain the canonical identifiers across transfers.

## Current tracker

- Platform execution index: #3
- Submission readiness: #4
- Integrated acceptance and promotion: #11
- Migration archive: #12
- Manage Studio and UI system: #17
- Shared chain and deployment acceptance: #18
- Prediction Market policy and governance: #23
- Prediction Market positions, exposure, and escrow: #24
- Prediction Market settlement, refunds, and frontend: #25

## Merged foundations

### Authorization and ACL

Fork PR #27 merged centralized deny-by-default authorization into `integration/platform-v1`.

The foundation provides:

- server-bound actors and separate web, administrator, and worker transports;
- named site and organization capabilities;
- tenant and resource-owner scope;
- active account, membership, and revocation checks;
- cross-tenant concealment;
- append-only authorization-decision evidence;
- fail-closed handling for unknown protected routes and missing scope.

B19 remains open for deployed browser/direct-request role testing and durable Voting adoption.

### Prediction Market durable foundation

Fork PR #1 merged as `63df978b029b34a7b96ddb5d17ecf2d6e1b4af4b`.

Exact tested PR head: `434c33a08e53e0ecf659e06acd0e8b062778e5c7`.

All fifteen applicable workflows passed, including security, Rust/API, SQLx, Soroban, web/type/theme, dependency and secret checks, ACL, clean clone, persistence, persistent rendering, organizer writes, R2 media, catalogue/orders, Stellar intents/reconciliation, payout, collectible fulfillment, explicit seed, and the dedicated Prediction Market smoke.

Integrated Prediction Market scope:

- Testnet-only markets and ordered outcomes;
- reviewed lifecycle and governance events;
- action-specific policy decisions;
- organization/pageant scope and exact integer asset configuration;
- verified-wallet-bound stake intents;
- idempotency, request hashing, and exposure limits;
- centralized capabilities for creation, review submission, governance, policy, staking, and owner-bound intent access;
- restart persistence and authorization-decision evidence.

Truth boundary: a submitted transaction hash does not create an active position. Positions become active only from accepted indexed chain evidence.

## Immediate execution order

1. #24 — server-built Freighter stake transaction, exact signed-envelope validation, real Testnet submission/indexing, chain-authoritative positions, exposure, and escrow.
2. #25 — governed resolution/cancellation, deterministic exactly-once payouts/refunds, and truthful public/organizer/admin frontend evidence.
3. #23 — provider-referenced policy, privacy/legal acceptance, dispute and emergency governance.
4. Voting — durable rounds, intake, receipts/snapshots, Soroban anchoring, and resilience.
5. NFT transaction proof — low-value Testnet mint, immutable artwork/metadata evidence, indexed ownership, and Explorer proof.
6. Ticketing — catalogue, reservation, Testnet payment, issuance, indexed ownership, and replay-resistant check-in.

Manage Studio, real R2 browser flow, exact-SHA deployment, role/device acceptance, recovery, and rollback continue in parallel under #17, #18, and #11.

## Still not accepted

- The public deployment does not contain the current ACL or Prediction Market foundations.
- Real Freighter-signed Prediction Market positions have not been demonstrated.
- Settlement and cancellation refunds are not complete.
- Provider/legal policy and KYC references are not accepted.
- Durable Voting and Ticketing are not complete.
- Manage Studio and full role/device browser acceptance remain open.
- Promotion PR #2 must remain draft until the cross-cutting acceptance gates pass.

Update this file whenever the canonical integration head, deployed SHA, accepted evidence, upstream synchronization, or active tracker mapping changes.
