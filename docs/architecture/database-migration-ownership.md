# Database migration ownership

This decision establishes one authority for CrownFi database changes during the platform refactor.

## Decision

The Rust/Axum service owns the canonical CrownFi database schema through versioned SQLx migrations under:

```text
services/api/migrations/
```

This directory does not exist yet; it is created in Milestone B. Once the first SQLx migration is merged, every new canonical platform table or constraint must be introduced through SQLx.

## Transitional state

The repository still contains a Prisma schema and seed under `web/prisma/`. They currently support legacy Next.js routes and the temporary Compose `db-init` service.

During the transition:

- Prisma is compatibility/reference material, not the long-term schema authority.
- Existing legacy routes may continue reading/writing their current tables until the corresponding Rust slice is migrated.
- No new platform domain should be designed only in Prisma.
- SQLx and Prisma must not independently create competing versions of the same canonical table.
- Destructive Prisma pushes against shared or hosted databases are prohibited.
- The old seed is retained as a source for an explicit SQLx-compatible demo seed, not as production data.

## Migration rules

1. One migration owner edits `services/api/migrations/` at a time.
2. Migrations are append-only after they have reached a shared branch or environment.
3. Fixes to an applied migration are new migrations, not rewrites.
4. Every migration includes a rollback/repair note even when automatic down migrations are not used.
5. Money is stored as integer minor units with explicit asset code, issuer, and scale.
6. Status fields use validated enums or database constraints where practical.
7. Organization ownership and tenant boundaries are represented by foreign keys and tested authorization.
8. On-chain IDs and transaction hashes are stored separately from application status.
9. Chain confirmation is required before ownership or settlement is declared successful.
10. Seed data is never embedded in schema migrations.

## Pull-request requirements

A PR containing a migration must state:

```text
Purpose:
Tables/columns affected:
Backfill required:
Expected lock/downtime:
Data-loss risk:
Rollback or repair procedure:
Legacy Prisma impact:
API version/feature flag:
Acceptance test:
```

Migration PRs must include a test that starts from an empty PostgreSQL database and applies the complete migration set.

When an existing populated environment is involved, the PR must also test upgrade from the previous released schema.

## Environment policy

### Local

- Empty databases may be recreated.
- Optional demo seeds are allowed through an explicit command.
- Prisma compatibility may remain until the relevant slice migrates.

### Testnet/staging

- SQLx migrations are the only canonical schema mutation path after Milestone B begins.
- Automatic migration execution must be observable and fail the deployment on error.
- No `prisma db push` against staging after SQLx authority is activated.
- A backup or disposable branch database is required before risky changes.

### Production/mainnet-capable environments

- Not enabled during the current hackathon phase.
- Require reviewed migrations, backup verification, rollback procedures, and maintenance-window decisions where necessary.

## Initial Milestone B schema boundary

The first SQLx migration set should introduce only the stable platform foundation:

- users;
- Stellar account links;
- organizations;
- organization memberships and roles;
- pageants;
- pageant venues/staff where required;
- categories;
- contestants;
- pageant contestants;
- contestant sections;
- media assets and variants;
- audit records.

Commerce, voting, ticketing, loyalty, KYC, and prediction-market tables should follow in their own reviewed migrations once the platform identities and relationships are stable.

## Cutover sequence

For each domain:

1. Add SQLx migration and Rust repository.
2. Backfill or seed required data.
3. Verify counts, foreign keys, and constraints.
4. Add Rust API reads.
5. Move writes to Rust.
6. Disable legacy writes.
7. Update the web client to the canonical API.
8. Remove the corresponding Prisma model/route only after acceptance tests pass.

## Current status

- SQLx has not yet been added to the Rust API.
- `services/api/migrations/` has not yet been created.
- The connected Supabase project has no CrownFi application tables at the last verified inspection.
- `infra/docker-compose.yml` still uses Prisma `db push` and the legacy seed as a temporary clean-start bridge.

Therefore this decision records ownership now, while implementation remains a Milestone B task.
