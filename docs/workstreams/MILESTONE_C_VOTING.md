# Milestone C — Durable Voting and Stellar Audit Anchoring

Status: active implementation workstream  
Branch: `feat/milestone-c-voting-v1`  
Trackers: #7, #19, #20  
Shared acceptance: #11

## Objective

Deliver one complete voting vertical slice built on CrownFi's existing SQLx, authorization, tenant, media, and Stellar-operation foundations.

The milestone is not complete merely because a ballot can be submitted. Accepted completion requires durable organizer-configured rounds, authenticated intake, database-enforced duplicate protection, reproducible receipts and snapshots, a verified Soroban Testnet anchor, restart recovery, and truthful browser evidence.

## Branch boundary

This branch owns Milestone C domain work only:

- voting rounds, schedules, eligibility, and lifecycle;
- authenticated durable vote intake and abuse controls;
- receipts, tally snapshots, Merkle proofs, and independent verification;
- Soroban audit anchoring and reconciliation;
- voting-specific resilience, operator recovery, and Manage/public UI.

It consumes the shared Manage shell, UI kit, ACL, SQLx runtime, transaction-intent service, registry, indexing, and reconciliation layers. It must not absorb Ticketing, Prediction Market, Collectibles, or general Milestone B shell/media work.

## Implementation checkpoint

Implemented on this branch:

- SQLx tables for voting rounds, eligible contestants, durable votes, and reviewed lifecycle events;
- organizer-scoped round creation with pageant/category/contestant validation;
- scheduled → open → closed lifecycle enforcement with audit evidence;
- verified-Testnet-wallet vote eligibility;
- account-bound idempotency and database-enforced one-vote-per-round uniqueness;
- durable receipt hashes and closed-round tally publication;
- one immutable snapshot per closed round with canonical tally JSON and SHA-256 digest;
- deterministic receipt leaves, persisted leaf ordering, Merkle root generation, and odd-leaf duplication rules;
- public receipt inclusion proof generation with server-side proof verification before response;
- snapshot state that remains separate from `anchored` until accepted chain evidence exists;
- dedicated Rust routes registered in the canonical API runtime.

Still open:

- Redis-backed burst and abuse controls;
- Soroban Testnet anchor intent construction, signed submission, accepted contract-event evidence, and reconciliation;
- operational drift/recovery tests around snapshot creation and anchoring;
- Manage/public browser surfaces and exact-head human acceptance.

## Implementation order

1. `C1` — SQLx-backed voting rounds, rules, schedules, reviewed transitions, discovery, and capability-aware Manage routes.
2. `C2` — account-bound vote intake, idempotency, uniqueness constraints, concurrency safety, Redis-backed abuse controls, and audit evidence.
3. `C3` — persisted receipts, immutable close snapshots, Merkle material, and privacy-preserving verification.
4. `C4` — server-built anchor intent, real Testnet submission, contract event indexing, reconciliation, and Explorer evidence.
5. `C5` — burst, duplicate, dependency-failure, restart, drift, and operator-recovery acceptance.

## Truth and security boundaries

- Hidden controls are not authorization; all voting mutations use server-side identity, role, and organization checks.
- A submitted vote response is not accepted unless the database transaction commits exactly once.
- Closing a round freezes the accepted vote set used to derive the immutable snapshot.
- A locally calculated root or submitted transaction hash is not an anchored checkpoint.
- Anchored state requires accepted indexed chain evidence and exact reconciliation.
- Raw voter identity and personally identifying vote data remain off-chain.

## Initial acceptance target

A non-developer organizer configures a short round, an authenticated user casts one vote, concurrent duplicate submissions produce exactly one accepted row, the vote and receipt survive restart, close produces independently reproducible proof material, and the checkpoint is submitted, indexed, reconciled, and linked to Stellar Explorer from the exact deployed revision.
