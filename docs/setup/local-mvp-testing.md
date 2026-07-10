# Local MVP testing path

This document defines the minimum path CrownFi must pass before the platform architecture refactor is considered demoable.

The current branch adds a Rust/Axum API skeleton and Docker Compose infra while keeping the existing Next.js app intact. This avoids a big-bang rewrite.

## Goal

A local developer should be able to prove that the platform path works:

1. Start Postgres and Redis.
2. Start the Rust API.
3. Verify API health.
4. Submit a mock vote.
5. Confirm duplicate vote rejection.
6. Create a tally snapshot.
7. Anchor the snapshot in mock mode.
8. Start the web app.
9. Continue using the existing web MVP while API migration proceeds.

## Quick path: local services only

From repo root:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

Start the Rust API locally:

```bash
cd services/api
CROWNFI_API_BIND=127.0.0.1:8080 \
DATABASE_URL=postgresql://crownfi:crownfi@localhost:5432/crownfi \
REDIS_URL=redis://localhost:6379 \
ADMIN_DEMO_TOKEN=local-admin-demo-token \
STELLAR_MODE=mock \
cargo run
```

In another terminal:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
curl http://localhost:8080/events
```

Submit a vote:

```bash
curl -sS -X POST http://localhost:8080/events/coronation-night-2026/vote \
  -H 'content-type: application/json' \
  -d '{"category_id":"fan-choice","voter_id":"demo-voter-1","contestant_id":"phl"}'
```

Submit the same vote again. Expected result: `duplicate_vote` with HTTP 409.

```bash
curl -i -X POST http://localhost:8080/events/coronation-night-2026/vote \
  -H 'content-type: application/json' \
  -d '{"category_id":"fan-choice","voter_id":"demo-voter-1","contestant_id":"phl"}'
```

Read the tally:

```bash
curl http://localhost:8080/events/coronation-night-2026/tally
```

Create a snapshot:

```bash
curl -sS -X POST http://localhost:8080/admin/events/coronation-night-2026/snapshot \
  -H 'content-type: application/json' \
  -H 'x-admin-demo-token: local-admin-demo-token' \
  -d '{"category_id":"fan-choice"}'
```

Anchor the snapshot using the `id` returned from the previous command:

```bash
SNAPSHOT_ID="paste-snapshot-id-here"

curl -sS -X POST "http://localhost:8080/admin/snapshots/$SNAPSHOT_ID/anchor" \
  -H 'x-admin-demo-token: local-admin-demo-token'

curl "http://localhost:8080/snapshots/$SNAPSHOT_ID/verify"
```

## Web app checks

The current web app still runs from `web/`.

```bash
cd web
npm ci
npx prisma generate
npm run typecheck
npm run test:merkle
npm run dev
```

Open:

```text
http://localhost:3000
```

## Docker Compose path

This branch also includes a full Compose file:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Expected ports:

- Web: `http://localhost:3000`
- Rust API: `http://localhost:8080`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Current limitation

The Rust API currently uses in-memory state for voting/tally/snapshot proof-of-flow. Postgres and Redis are included in the compose topology so the next phase can replace in-memory state with persistent storage and Redis-backed rate limiting.

Do not present the Rust API as the final backend yet. It is the working skeleton that lets the team migrate safely.
