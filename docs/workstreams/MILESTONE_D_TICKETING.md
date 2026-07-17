# Milestone D — Durable Ticketing, Ownership, and Check-In

Status: active implementation workstream  
Branch: `feat/milestone-d-ticketing-v1`  
Trackers: #8, #21, #22  
Shared acceptance: #11

## Objective

Deliver one end-to-end ticketing vertical slice using CrownFi's shared catalogue, order, Stellar-intent, authorization, and reconciliation foundations.

Accepted completion requires exact inventory, atomic reservation, real Testnet payment evidence, retry-safe issuance, chain-derived ownership, transfer-policy enforcement, and replay-resistant venue check-in. A catalogue page or generated token identifier alone is not a completed ticket product.

## Branch boundary

This branch owns Milestone D domain work only:

- ticket events, tiers, inventory, limits, sale windows, and transfer policy;
- reservation, checkout, payment, issuance, cancellation, and refund behavior;
- indexed ownership and independent verification;
- transfer enforcement and replay-resistant check-in;
- organizer, administrator, operator, recovery, and public Ticketing UI.

It consumes the shared Manage shell, UI kit, catalogue primitives, orders, ACL, transaction intents, registry, indexing, reconciliation, and deployment evidence. It must not absorb Voting, Prediction Market, Collectibles, or unrelated Milestone B platform work.

## Implementation checkpoint

Implemented on this branch:

- durable ticket events, ticket-specific products, reservations, issuance projections, unique ownership evidence, and unique check-in records;
- organizer-scoped event and tier creation using the shared product, price, and inventory tables;
- exact integer Stellar asset pricing, sale windows, per-user limits, transfer policy, and resale-cap metadata;
- event publication that atomically publishes its ticket products;
- verified-Testnet-wallet reservation eligibility;
- transaction-locked inventory reservation and database-backed oversell prevention;
- buyer-scoped idempotency and lazy release of expired reservations back to inventory;
- shared order and order-item creation with paid-versus-issued state kept separate;
- issuance preparation only after the order is paid and an accepted Stellar reconciliation result exists;
- deterministic serial allocation and exact reservation-to-issuance quantity conversion;
- pending issuance rows that do not become issued merely because a mint was attempted;
- exact accepted owner wallet, token ID, transaction hash, ledger, and contract-event evidence before issuance becomes `issued`;
- public token ownership verification derived from accepted evidence rather than application intent;
- order fulfillment only after every issuance for the order has accepted ownership evidence;
- organization-scoped authorized check-in with one successful check-in per issuance and durable nonce replay rejection;
- restricted worker routes aligned with the existing protected worker-secret boundary;
- dedicated Rust routes registered in the canonical API runtime.

Still open:

- real Freighter payment-intent UX and accepted low-value Testnet payment evidence;
- real ticket contract issuance submission and an indexer-produced ownership event rather than manually supplied worker evidence;
- transfer request, approval, submission, and accepted ownership-change evidence;
- dedicated concurrent reservation, restart, issuance retry, second-session verification, and replay acceptance tests;
- organizer/operator/public browser surfaces and exact-head human acceptance.

## Implementation order

1. `D1` — ticket event/tier model, integer price and inventory, publication, limits, sale windows, transfer rules, organizer Manage module, and public discovery.
2. `D2` — atomic reservation and expiry, oversell prevention, stored payment intents, real Testnet reconciliation, paid-versus-issued separation, retry-safe exactly-once issuance, cancellation, and refund.
3. `D3` — chain-authoritative owner projection, second-session verification, enforced transfer policy, authorized first check-in, and duplicate/replay rejection.
4. `D4` — role-aware inventory, orders, payments, issuance, ownership, refunds, venue check-in, incident handling, and phone recovery workflow.

## Truth and security boundaries

- Inventory and money use exact integer units and database transactions.
- A wallet signature, callback, submitted hash, or local mint attempt is not payment or issuance.
- A prepared issuance is not issued; accepted indexed ownership evidence is required.
- Paid, issued, owned, transferred, refunded, and checked-in states require their proper durable and chain-authoritative evidence.
- Check-in authorization is server-side, organization/event scoped, audited, and idempotent.
- A successful first scan must make every replay observably fail without corrupting the valid check-in record.

## Initial acceptance target

An organizer publishes an inventory-one ticket. Two concurrent reservations produce one winner. The buyer signs a low-value Testnet payment, accepted chain evidence marks the order paid, retry-safe fulfillment issues exactly one ticket through restart, another session independently verifies ownership, the first authorized check-in succeeds, and a replay is rejected with durable audit evidence.
