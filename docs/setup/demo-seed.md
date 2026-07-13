# Explicit CrownFi demo seed

CrownFi migrations never create demo users, organizations, pageants, contestants, votes, products, or financial records. Demo content is applied only through the explicit `demo` seed profile.

## Safety boundary

The seed command requires all of the following:

- a configured PostgreSQL `DATABASE_URL`;
- `CROWNFI_ALLOW_DEMO_SEED=true`;
- a runtime mode other than `staging` or `production`;
- the explicit command `crownfi-api seed demo`.

The ordinary API startup path does not run this seed. SQLx migrations also do not invoke it.

## Run locally

```bash
cd services/api
DATABASE_URL=postgresql://crownfi:crownfi-local-development-only@127.0.0.1:5432/crownfi \
CROWNFI_DATABASE_REQUIRED=true \
CROWNFI_API_MODE=local \
CROWNFI_ALLOW_DEMO_SEED=true \
cargo run --locked -- seed demo
```

Through the canonical Compose image:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml run --rm \
  -e CROWNFI_ALLOW_DEMO_SEED=true \
  api crownfi-api seed demo
```

## Seeded platform data

The profile creates or refreshes a reserved local demonstration dataset:

- one organizer user;
- one organization with slug `crownfi-demo`;
- one active owner membership;
- one pageant with slug `crownfi-international-2026`;
- one `fan-choice` category;
- three contestants and their pageant participation records;
- four visible contestant sections per contestant:
  - overview;
  - advocacy;
  - gallery;
  - collectibles;
- one fixed audit record documenting explicit seed application.

It does not create votes, tickets, orders, payments, NFTs, KYC decisions, Stellar transactions, or R2 objects.

## Idempotency

The profile uses stable identifiers and reserved slugs. Running it repeatedly updates the same demo records rather than creating duplicates. CI applies it twice and verifies the final row counts.

Do not customize the shared demo profile for a real event. Create organizers, pageants, contestants, and sections through the platform API or organizer interface instead.

## Removal

The seed is not intended as a migration rollback. Disposable local databases should be recreated when a clean environment is required. A future administrative cleanup command may remove records by their reserved demo organization, but it must not be used against staging or production without a reviewed data-retention policy.
