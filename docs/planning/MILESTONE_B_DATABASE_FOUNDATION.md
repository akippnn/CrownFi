# Milestone B database foundation

Status: implementation started on `foundation/database-v1`.

## Scope of this slice

This slice establishes the first canonical PostgreSQL/SQLx boundary without deleting the legacy Next.js/Prisma application.

Included:

- SQLx PostgreSQL connection management in the Rust API;
- an explicit `crownfi-api migrate` command;
- embedded, append-only SQLx migrations;
- canonical tables for users, Stellar accounts, organizations, memberships, pageants, contestants, pageant participation, categories, contestant sections, R2 media metadata, and audit logs;
- a canonical SQLx database initializer in Compose;
- a separate transitional Prisma initializer so the current web MVP continues to run;
- fail-closed database startup when `CROWNFI_DATABASE_REQUIRED=true`;
- no automatic demo data in SQL migrations.

Not included yet:

- organization/pageant CRUD endpoints;
- organization RBAC enforcement;
- explicit seed command;
- Cloudflare R2 upload/signing implementation;
- replacement of in-memory voting, tally, snapshots, markets, or transaction intents;
- removal of Prisma or legacy Next.js routes.

## Canonical commands

Apply migrations:

```bash
cd services/api
DATABASE_URL=postgresql://... CROWNFI_DATABASE_REQUIRED=true cargo run --locked -- migrate
```

Run the API after migration:

```bash
DATABASE_URL=postgresql://... CROWNFI_DATABASE_REQUIRED=true cargo run --locked -- serve
```

Run the full compatibility stack:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up --build
```

## Acceptance for this slice

- [ ] SQLx lockfile is committed.
- [ ] Rust formatting and tests pass with `--locked`.
- [ ] Migration applies to an empty PostgreSQL 16 database.
- [ ] Running the migration command a second time succeeds without schema drift.
- [ ] The canonical Compose stack starts.
- [ ] Both SQLx and transitional Prisma initializers complete successfully.
- [ ] No demo rows are created by SQLx migrations.
- [ ] The existing web MVP remains reachable.

## Next slice

Implement PostgreSQL repositories and admin-only creation endpoints for:

1. users and wallet links;
2. organizations and owner memberships;
3. pageants and categories;
4. contestants and pageant participation;
5. contestant sections.

R2 object upload and delivery follow after media metadata and organization authorization are exercised through the API.
