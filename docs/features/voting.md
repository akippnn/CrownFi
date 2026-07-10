# Voting system

CrownFi voting is backend-first. The app should not submit one blockchain transaction per raw vote. Vote intake is handled by the application/database path for speed, privacy, and spike handling. Stellar is used later for public audit commitments.

## Current MVP behavior

Current production-facing MVP voting lives primarily in the Next.js app:

- `web/src/app/vote/page.tsx` — fan voting UI.
- `web/src/app/api/vote/route.ts` — off-chain vote intake.
- `web/prisma/schema.prisma` — `Vote` model and duplicate-vote constraint.
- `web/src/lib/merkle.ts` — leaf/hash/proof helpers.
- `web/src/lib/roundClose.ts` — tally snapshot helper.

The Rust API skeleton mirrors the intended long-term API shape:

- `POST /events/:event_id/vote`
- `GET /events/:event_id/tally`
- `POST /admin/events/:event_id/snapshot`

It currently uses in-memory demo state. The next implementation step is to move real vote intake and tally persistence into `services/api` backed by Postgres.

## Rules

- One verified user/account/wallet should vote once per event/category unless explicitly configured otherwise.
- Donations, tickets, and collectibles must not increase voting power.
- Duplicate prevention must exist at the database level, not only in frontend state.
- The voting window must be checked server-side.
- Contestant/category/event relationship must be checked server-side.
- Rate limiting should exist in the API path. The current MVP uses a light in-memory limiter; the refactor path should support Redis.

## Database expectation

The current schema uses `Vote` with a uniqueness constraint for duplicate prevention. The refactor should add explicit audit-friendly models:

- `vote_receipts`
- `tally_snapshots`
- `audit_logs`
- `stellar_checkpoints`

## Acceptance path

A voting implementation is MVP-acceptable when a local test can:

1. seed an event/category/contestants;
2. submit one valid vote;
3. reject a duplicate vote;
4. reject voting when the round/category is closed;
5. return a tally;
6. create a snapshot;
7. verify a snapshot hash/Merkle root.
