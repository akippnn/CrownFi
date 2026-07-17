# Voting system

CrownFi voting is backend-first. The application does not require one blockchain transaction per raw vote. Vote intake and tallying are off-chain for privacy and burst handling; Stellar is used for immutable public commitments after a round closes.

## Default-branch state

`main` contains two voting-era paths that must not be confused.

### Legacy MVP / compatibility path

The older Rust handlers in `services/api/src/app.rs` expose:

```text
POST /events/:event_id/vote
GET  /events/:event_id/tally
POST /admin/events/:event_id/snapshot
POST /admin/snapshots/:snapshot_id/anchor
GET  /snapshots/:snapshot_id
GET  /snapshots/:snapshot_id/verify
```

They use process-local seeded event, contestant, vote, tally, and snapshot state. They do not prove restart-safe voting or accepted Testnet anchoring.

### Durable SQLx path

The durable implementation from PR #42 is merged on `main`. It includes:

- organization/pageant/category-scoped rounds and contestant membership;
- scheduled/open/closed lifecycle records;
- database-backed accepted votes;
- actor-bound idempotency and duplicate prevention;
- durable receipt hashes;
- deterministic tally reads;
- immutable snapshot, tally hash, Merkle root, leaves, and inclusion-proof records;
- audit-anchor intent, submission, and accepted-evidence state;
- public round discovery, ballot integration, receipt verification, and anchor-status reads.

Merged implementation does not mean Milestone C acceptance is complete.

## Rules

- Vote eligibility and limits are server-side policy.
- Donations, tickets, purchases, collectibles, and prediction stakes never increase voting power.
- Duplicate prevention is enforced by canonical database constraints and idempotency behavior.
- Voting windows and lifecycle transitions are checked server-side.
- Pageant, category, contestant participation, visibility, and tenant relationships are validated server-side.
- Exact retries return the original accepted result; changed reuse of an idempotency key conflicts safely.
- Closing a round freezes the accepted-vote set and rejects later vote mutation.
- Receipts and proofs must not expose personal voter data.
- A built or submitted anchor is not accepted until matching ledger evidence is independently indexed and reconciled.
- Failures and drift become visible incidents, not false success.

## Known gaps after merge

- complete centralized capability mapping and negative authorization tests for round create/open/close, vote intake, snapshot creation, and anchor worker routes;
- versioned rules/eligibility fields bound to each accepted vote and snapshot;
- Redis-backed abuse controls and predictable degraded behavior;
- exact restricted Testnet transaction construction, signing, submission, indexing, and reconciliation;
- independent Explorer and contract-event evidence;
- burst, close-race, duplicate, timeout, restart, delayed-event, expiration, and drift tests;
- complete organizer Manage configuration/inspection and operator incident recovery;
- browser, role, device, accessibility, and exact deployed-SHA acceptance.

## Durable acceptance gate

Voting is not complete until the exact candidate SHA proves:

1. organizer configuration, scheduling, opening, closing, and inspection through Manage;
2. authenticated and tenant-safe vote intake with receipts surviving restart;
3. exactly one canonical vote under concurrent duplicate attempts;
4. deterministic immutable tally/snapshot/proof reproduction;
5. post-close mutation denial;
6. restricted Testnet anchor construction and submission;
7. independently sourced transaction and contract-event evidence;
8. exact reconciliation of all committed fields;
9. burst, outage, retry, expiration, restart, and drift handling;
10. public verification plus organizer/operator browser acceptance;
11. exact deployed-SHA evidence.

Historical MVP behavior may remain during migration, but it must stay labeled compatibility/demo behavior.
