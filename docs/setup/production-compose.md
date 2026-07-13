# Production-shaped Docker Compose path

This document describes the canonical multi-service Compose topology used to validate CrownFi before hosted deployment. It is **production-shaped**, not production-ready.

## Current topology

```text
Browser / Freighter
        |
        v
Next.js web :3000
        |
        +--> Rust/Axum API :8080
        |       +--> PostgreSQL
        |       +--> Redis
        |       +--> Stellar/Soroban RPC when live mode is explicitly configured
        |
        +--> Legacy Next.js API routes during migration
                +--> Prisma/PostgreSQL compatibility tables
```

Current services in `infra/docker-compose.yml`:

- `postgres`;
- `redis`;
- `api`;
- `db-init` as a transitional Prisma bridge;
- `web`.

A standalone worker, chain indexer, and reconciliation service are not yet present. Do not claim that the topology includes them until they are implemented.

## Local production-shaped command

```bash
cp infra/.env.example infra/.env

docker compose \
  --env-file infra/.env \
  -f infra/docker-compose.yml \
  up --build
```

The example file deliberately uses:

```env
CROWNFI_API_MODE=local
STELLAR_MODE=mock
WALLET_PROVIDER=mock
```

This allows a clean clone to start without private credentials. It is not the staging configuration.

The fastest validation command is:

```bash
bash scripts/acceptance/clean-clone-smoke.sh
```

## Exposed endpoints

```text
127.0.0.1:3000  Next.js web
127.0.0.1:8080  Rust API
```

PostgreSQL and Redis are kept internal to the Compose network. Expose them only for an explicit development need, and do not copy that exposure into a shared deployment without review.

## Health gating

Compose startup gates on:

- PostgreSQL `pg_isready`;
- Redis `PING`;
- Rust API `/health`;
- successful transitional database initialization;
- Next.js `/api/health`.

The Rust `/ready` endpoint does not yet perform SQLx/Redis queries. That becomes part of Milestone B when the API owns real connection pools.

## Staging environment requirements

A Testnet staging deployment must not be created by merely changing `STELLAR_MODE`.

Before setting `STELLAR_MODE=live`:

1. record and verify every required deployment in [`../blockchain/testnet-contract-registry.md`](../blockchain/testnet-contract-registry.md);
2. configure the correct Testnet network/passphrase and RPC endpoint;
3. remove demo authentication bypasses;
4. use a reviewed signer boundary rather than exposing a secret to the browser;
5. disable mock transaction endpoints;
6. confirm the database backup/restore path;
7. run the Testnet acceptance flow and save Explorer links;
8. verify that missing configuration fails closed.

Representative variables:

```env
CROWNFI_API_MODE=staging
STELLAR_MODE=live
WALLET_PROVIDER=freighter
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
AUDIT_ANCHOR_CONTRACT_ID=C...
TICKET_CONTRACT_ID=C...
COLLECTIBLE_CONTRACT_ID=C...
SALE_SPLITTER_CONTRACT_ID=C...
USDC_TEST_CONTRACT_ID=C...
```

Do not commit real values to `.env` files.

## Current migration limitation

The `db-init` service still runs:

```bash
npx prisma db push && npm run seed
```

This remains only to preserve the existing MVP during consolidation. It is not acceptable as the final staging migration path.

Milestone B replaces it with:

- versioned SQLx migrations;
- a separate explicit seed command;
- migration validation from an empty database;
- upgrade tests for shared environments;
- observable deployment failure when a migration fails.

See [`../architecture/database-migration-ownership.md`](../architecture/database-migration-ownership.md).

## Acceptance criteria for the current baseline

The Compose path is credible only when:

1. it builds from a clean clone;
2. no private `.env` file is required for local/mock startup;
3. PostgreSQL, Redis, API, database initialization, and web health succeed;
4. the web application loads;
5. the seeded Rust prototype routes behave as documented;
6. mock mode is visible and not presented as Testnet;
7. restart loss of process-local Rust state is recorded as a known failure;
8. evidence is saved by the clean-clone script and reviewed.

## Hosted path

The intended hosted architecture may use:

- self-hosted or managed PostgreSQL/Supabase;
- self-hosted or managed Redis;
- Cloudflare R2 for public/product/pageant media;
- a container host for Rust API and workers;
- Next.js hosting or a containerized web service;
- a secrets manager;
- Stellar Testnet first;
- Arcturus deployment manifests and rollback procedures.

Moving to hosted services does not fix an unreproducible local architecture. The clean-clone and migration gates remain mandatory.
