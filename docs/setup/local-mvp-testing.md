# Local MVP compatibility testing

This document covers the **prototype behavior check** for the transitional Rust API. The canonical clean-clone/platform test is [`clean-clone.md`](clean-clone.md) and should be run first.

The routes below use seeded process-local fixtures. Passing them proves that the current Rust skeleton still behaves as expected; it does not prove database durability, multi-pageant support, or live Stellar settlement.

## Start the canonical local stack

From the repository root:

```bash
cp infra/.env.example infra/.env

docker compose \
  --env-file infra/.env \
  -f infra/docker-compose.yml \
  up --build --detach
```

Or run the evidence-producing smoke script:

```bash
bash scripts/acceptance/clean-clone-smoke.sh
```

Expected host endpoints:

- Web: `http://127.0.0.1:3000`
- Web health: `http://127.0.0.1:3000/api/health`
- Rust API: `http://127.0.0.1:8080`
- API health: `http://127.0.0.1:8080/health`
- API readiness: `http://127.0.0.1:8080/ready`

PostgreSQL and Redis are intentionally internal to the Compose network in this path. Check them through Compose rather than assuming host ports `5432` and `6379` are published.

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml \
  exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

docker compose --env-file infra/.env -f infra/docker-compose.yml \
  exec -T redis redis-cli ping
```

## Check API health

```bash
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/ready
curl --fail http://127.0.0.1:8080/events
```

The readiness endpoint currently reports configuration presence. PostgreSQL and Redis connectivity are checked independently by their Compose health checks until SQLx/Redis clients are added in Milestone B.

## Exercise the seeded voting prototype

The following IDs are temporary local fixtures, not platform data:

```text
event: coronation-night-2026
category: fan-choice
contestant: phl
```

Submit a vote:

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  http://127.0.0.1:8080/events/coronation-night-2026/vote \
  --header 'content-type: application/json' \
  --data '{"category_id":"fan-choice","voter_id":"demo-voter-1","contestant_id":"phl"}'
```

Submit the same vote again. Expected result: HTTP `409` with `duplicate_vote`.

```bash
curl --include --silent --show-error \
  --request POST \
  http://127.0.0.1:8080/events/coronation-night-2026/vote \
  --header 'content-type: application/json' \
  --data '{"category_id":"fan-choice","voter_id":"demo-voter-1","contestant_id":"phl"}'
```

Read the tally:

```bash
curl --fail http://127.0.0.1:8080/events/coronation-night-2026/tally
```

Create a snapshot:

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  http://127.0.0.1:8080/admin/events/coronation-night-2026/snapshot \
  --header 'content-type: application/json' \
  --header 'x-admin-demo-token: local-admin-demo-token' \
  --data '{"category_id":"fan-choice"}'
```

Use the returned snapshot ID:

```bash
SNAPSHOT_ID="paste-snapshot-id-here"

curl --fail-with-body --silent --show-error \
  --request POST \
  "http://127.0.0.1:8080/admin/snapshots/$SNAPSHOT_ID/anchor" \
  --header 'x-admin-demo-token: local-admin-demo-token'

curl --fail "http://127.0.0.1:8080/snapshots/$SNAPSHOT_ID/verify"
```

In the default local profile, the anchor is simulated. It must not be presented as a real Stellar transaction and will not exist in Stellar Explorer.

## Restart test

Restart the API:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml restart api
```

The seeded event returns, but submitted votes, tallies, snapshots, and transaction intents are lost because they remain process-local. That loss is an expected **failure of durability** and is the primary reason Milestone B is required.

## Web checks

```bash
curl --fail http://127.0.0.1:3000/api/health
```

Then open `http://127.0.0.1:3000` and use browser DevTools to check for fatal console errors, failed requests, and obsolete API calls.

For local source checks without Compose:

```bash
cd web
npm ci
npm run typecheck
npm run test:merkle
npm run test:ticketing
npm run build
```

## Stop the stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down
```

## Interpretation

This compatibility test passes when the current seeded skeleton behaves consistently. CrownFi does **not** pass the durable platform acceptance gate until organizations, pageants, contestants, votes, snapshots, and intents are stored through canonical Rust/PostgreSQL repositories and survive restart.
