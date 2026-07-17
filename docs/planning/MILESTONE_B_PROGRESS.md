# Milestone B progress

Milestone B turns CrownFi into a persistent multi-pageant platform. This document describes implementation merged on the default branch after the July 2026 consolidation. Operational acceptance remains tracked separately.

## Merged platform foundation

- SQLx-owned PostgreSQL schema and migration command.
- Persistent users, linked Stellar accounts, organizations, memberships, pageants, categories, contestants, pageant participation, configurable sections, and audit records.
- Organization-scoped authorization foundation and centralized authorization-decision logging.
- Explicit demo seed that is opt-in, idempotent, and rejected in staging/production.
- R2-compatible media model, upload authorization, completion-time byte/hash verification, contestant relationships, and per-asset completion serialization.
- Persistent catalogue, product prices/inventory, orders/payment attempts, Stellar transaction intents, chain evidence/reconciliation records, collectible fulfillment, and payout foundations.
- First-administrator setup, site roles/settings, account/wallet linking, and Manage-facing internal APIs.
- Full-screen Manage workspace, pageant-aware navigation, modular pageant-home renderer/editor, responsive shell, and shared UI-kit consolidation.
- Clean-clone and focused persistence, media, commerce, authorization, and browser smoke scripts.

## Additional merged slices built on the foundation

- Milestone C durable voting, receipts, snapshots, Merkle proofs, and anchor evidence records.
- Milestone D ticket catalogue, reservations, issuance, ownership/transfer evidence, verification, and check-in state.
- Milestone E Testnet-only accepted positions, exposure, deterministic settlement/refund plans, and evidence UI.

These slices consume Milestone B infrastructure. Their separate acceptance gaps do not make Milestone B complete.

## Transitional boundaries

- Prisma still owns a separate `legacy` schema for compatibility routes.
- Selected Next.js routes still contain business logic.
- Older Rust `/events` and snapshot handlers remain process-local fixtures.
- Redis is provisioned but is not yet the complete distributed rate-limit/job/coordination layer.
- OpenAPI and generated TypeScript client publication are incomplete.
- Newer voting, ticketing, and market mutation/worker routes need complete centralized capability mapping and negative authorization coverage.
- Real Testnet/indexer/reconciliation evidence is capability-specific and incomplete.

## Remaining before Milestone B is operationally complete

- Complete organizer-facing browser workflows and role/device/accessibility acceptance against the exact deployed SHA.
- Prove pageant switching, context clarity, editor/renderer parity, empty/all-hidden widget states, and mobile safe-area behavior.
- Publish OpenAPI and generate/pin the TypeScript client.
- Add Redis-backed shared rate limiting and coordination where required.
- Replace transitional admin/demo header paths with final authenticated session and worker boundaries.
- Add authoritative server-side image decoding/dimensions, variants/thumbnails, pending-upload expiry, durable orphan cleanup, replacement/removal, and Media Library acceptance.
- Prove revoked-member and cross-organization isolation across every management mutation.
- Record shared/staging migration, backup, restore, deployment, rollback, and retained-volume ownership evidence.
- Upgrade Arcturus and verify the current authenticated preflight/deployment path without the legacy compatibility fallback.

## Human acceptance path

1. Start a fresh database from the exact candidate SHA and apply the canonical stack.
2. Complete first-administrator setup through the browser.
3. Create or select an organization and pageant without source edits.
4. Add categories, contestants, sections, media, widgets, and members under the correct role.
5. Prove a second organization and revoked member cannot read or mutate protected data.
6. Configure a restricted R2 test bucket, upload a portrait, complete verification, attach it, and restart the API.
7. Confirm object relationships and database records survive restart.
8. Exercise same-asset concurrent completion and invalid/mismatched upload paths.
9. Review desktop, tablet, ordinary phone, narrow phone, landscape, 200% zoom, keyboard-only, visible focus, and reduced-motion behavior.
10. Record exact source and deployed SHAs, browser/device/role, logs, database evidence, screenshots, and operator recovery steps.

## Status

The persistent platform and restored management UI are substantially merged. Milestone B remains open as an operational/product gate because complete authorization, shared Redis controls, generated API contracts, media lifecycle work, exact-head human acceptance, deployment evidence, and operator recovery are unfinished.
