# Milestone C implementation checkpoint — 2026-07-17

This branch now contains a coherent C1–C4 implementation path:

- organizer-scoped durable round configuration and lifecycle;
- account-bound, idempotent, database-enforced vote intake;
- immutable tally snapshots and deterministic Merkle receipt proofs;
- verified AuditAnchor contract selection and exact publish intent records;
- separate submitted and accepted anchor evidence states;
- pageant-scoped public round discovery;
- authenticated Next.js vote proxy;
- public ballot, receipt proof, and anchor-evidence pages.

Still required before review-ready:

- centralized ACL integration workflow completion and exact-head checks;
- Redis-backed burst/abuse controls;
- actual Soroban XDR construction, signing/submission, and indexer-produced event evidence;
- restart/concurrency/browser/device acceptance;
- deployment and Stellar Explorer evidence.

No submitted transaction or locally calculated Merkle root is represented as anchored without matching accepted evidence.
