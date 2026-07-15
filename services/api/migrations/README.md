# CrownFi SQLx migrations

This directory is the canonical database schema authority beginning with Milestone B.

Rules:

- Migrations are append-only after they have been applied outside a disposable development database.
- Migrations must not create demo organizations, pageants, contestants, orders, or votes.
- Demo data belongs in an explicit, repeatable seed command.
- Money must use integer minor/base units with an explicit asset scale; floating-point money is prohibited.
- A migration must pass against an empty PostgreSQL database and when run again through SQLx.
- Destructive changes require a separate backfill/cutover plan and rollback notes.

Run the embedded migration set with:

```bash
cd services/api
DATABASE_URL=postgresql://... cargo run --locked -- migrate
```

The legacy Prisma schema remains temporarily for existing Next.js compatibility. It is not the authority for new platform tables.
