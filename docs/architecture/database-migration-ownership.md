# Database migration ownership

This decision establishes one authority for CrownFi platform database changes.

## Decision

The Rust/Axum service owns the canonical CrownFi platform schema through append-only SQLx migrations under:

```text
services/api/migrations/
```

This authority is active. `infra/docker-compose.yml` runs the Rust API image as `db-init` with the `migrate` command before the API starts.

## Current schema split

| Schema | Owner | Purpose |
|---|---|---|
| `public` | SQLx / Rust API | Canonical platform, identity, media, commerce, Stellar workflow, voting, ticketing, market, audit, and authorization data |
| `legacy` | Prisma / Next.js compatibility | Temporary data for Next.js routes that have not yet been retired |

The split is intentional but temporary. It prevents Prisma compatibility startup from mutating canonical SQLx tables.

## Merged SQLx migration groups

The current migration sequence covers:

1. users, Stellar accounts, organizations, memberships, pageants, categories, contestants, sections, media, and audit logs;
2. commerce products, integer prices, inventory, product media, orders, and payment attempts;
3. persistent Stellar transaction intents, submission state, contract deployments, chain cursors/evidence, and reconciliation;
4. collectible fulfillment, mint evidence, payout rules, batches, transfers, and source-account metadata;
5. site settings, administrators, wallet challenges, integration settings, and authorization-decision evidence;
6. prediction-market policy/lifecycle/stake-intent foundation;
7. durable voting rounds, contestants, votes, receipts, snapshots, Merkle leaves, and anchor intent/evidence state;
8. ticket events/products, reservations, inventory ledger, issuance, ownership evidence, transfers, and check-in state;
9. accepted prediction positions, exposure projections, settlement/refund plans, governance actions, submission state, and accepted evidence.

## Transitional Prisma policy

The repository still contains `web/prisma/` for compatibility.

- Prisma is not the authority for new platform tables.
- Existing legacy routes may continue using the `legacy` schema until replaced.
- No new platform domain may be designed only in Prisma.
- SQLx and Prisma must not create competing versions of the same canonical table.
- `prisma db push` is prohibited against the canonical `public` schema and shared/staging databases.
- The Prisma seed is compatibility data only. The canonical demo seed is the explicit Rust command.

## Migration rules

1. Coordinate migration ordering as shared infrastructure.
2. Treat a migration as append-only after it reaches a shared branch or environment.
3. Repair an applied migration with a new migration; do not rewrite history.
4. Document backfill, lock/downtime, data-loss, repair, and legacy impact.
5. Store money as integer units with asset code, issuer, and scale.
6. Validate status values and allowed transitions in database/application boundaries.
7. Represent tenant ownership with foreign keys and test cross-organization denial.
8. Store ledger identifiers/evidence separately from application workflow status.
9. Do not declare ownership or settlement successful before accepted chain evidence and reconciliation.
10. Never embed demo product data in schema migrations.
11. Test concurrent uniqueness/idempotency constraints for votes, inventory, evidence, issuance, check-in, and settlement.
12. Preserve historical evidence; do not delete audit or chain records merely to repair a projection.

## Commands

Apply canonical migrations:

```bash
cd services/api
DATABASE_URL=postgresql://... cargo run --locked -- migrate
```

Apply the explicit deterministic demo seed:

```bash
CROWNFI_ALLOW_DEMO_SEED=true \
CROWNFI_API_MODE=local \
DATABASE_URL=postgresql://... \
cargo run --manifest-path services/api/Cargo.toml --locked -- seed demo
```

Normal `serve` and `migrate` commands never seed product data.

## Pull-request requirements

A PR containing a migration must state:

```text
Purpose:
Tables/columns affected:
Backfill required:
Expected lock/downtime:
Data-loss risk:
Rollback or forward-repair procedure:
Legacy Prisma impact:
API/feature dependency:
Empty-database test:
Upgrade-path test:
Concurrency/idempotency test:
Retention/audit impact:
```

At minimum, migration PRs must apply the complete sequence to an empty PostgreSQL database. For a populated shared environment, test upgrade from the previous released migration set and record backup/restore evidence.

## Domain cutover sequence

For each remaining compatibility domain:

1. add the SQLx migration/repository or reuse the canonical table;
2. backfill or explicitly seed required reference data;
3. verify counts, constraints, tenant relationships, and evidence provenance;
4. add Rust API reads and writes;
5. update the Next.js client/proxy;
6. disable legacy writes;
7. observe the cutover through tests and deployment evidence;
8. remove the corresponding Prisma model/route only after acceptance passes.

## Remaining work

- remove legacy Prisma/Next.js business paths domain by domain;
- publish OpenAPI and generated client types;
- add complete centralized ACL coverage for new mutation and worker routes;
- establish shared/staging migration, backup, restore, upgrade, rollback, and forward-repair evidence;
- document retention and cleanup for audit, media, payment, voting, ticket, market, and chain-evidence records;
- prove restart/reprocessing behavior and projection rebuilds from authoritative evidence.
