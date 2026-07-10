# Production-like Docker Compose path

This document defines the first production-like deployment path for CrownFi. It is intentionally simple and MVP-oriented.

## Goal

Before moving to managed cloud infrastructure, CrownFi should run through Docker Compose with these services:

- `web`: Next.js frontend
- `api`: Rust/Axum backend
- `postgres`: database for app state
- `redis`: cache/rate-limit layer
- external Stellar/Soroban RPC

This path lets the team prove the MVP can run in a predictable environment.

## Initial topology

```text
Browser / Freighter
        |
        v
Next.js web container :3000
        |
        v
Rust API container :8080
        |
        +--> Postgres :5432
        +--> Redis :6379
        +--> Stellar/Soroban RPC
```

## MVP Compose command

```bash
docker compose -f infra/docker-compose.yml up --build
```

## Production-like environment variables

Web container:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_MODE=mock # switch to live only after contract IDs are deployed
WALLET_PROVIDER=freighter
ADMIN_WALLETS=G...
ADMIN_SESSION_SECRET=change-me
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

API container:

```env
CROWNFI_API_BIND=0.0.0.0:8080
CROWNFI_API_MODE=production-like
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ADMIN_DEMO_TOKEN=disabled-in-production
STELLAR_MODE=mock # switch to live after testnet deploy validation
```

## Acceptance criteria

A production-like compose run is MVP-valid only when it can do the following:

1. Start all containers without manual changes.
2. Apply or document database migrations.
3. Seed demo pageant data.
4. Load the web app.
5. Connect a wallet or demo session.
6. Submit a vote.
7. Reject a duplicate vote.
8. Show a tally.
9. Create a snapshot.
10. Anchor in mock mode, then later Stellar Testnet mode.
11. Run ticketing in mock mode.
12. Clearly label mock/testnet mode in the UI.

## Later cloud path

After the compose path works, the production path can move to:

- Managed Postgres or Supabase
- Managed Redis or Upstash
- Web hosting for Next.js
- API service on a container host
- Secrets manager for admin keys and contract IDs
- Stellar Testnet first, then a separate mainnet-readiness review

Do not skip the Compose path. The MVP must work locally before the architecture is considered credible.
