# Milestone C next implementation order

1. Complete centralized ACL classification for all internal Voting and AuditAnchor routes.
2. Make exact-head SQLx migration, Rust format/check/test, and web typecheck green.
3. Add Redis-backed vote burst controls without making Redis the vote authority.
4. Build exact Soroban AuditAnchor invocation XDR from the stored operation descriptor.
5. Validate the signed envelope, submit to Testnet, index the contract event, and feed the accepted evidence endpoint from the indexer rather than a manual payload.
6. Add restart, concurrent duplicate, snapshot drift, and anchor replay tests.
7. Complete organizer round management and exact deployed-SHA browser/device acceptance.
