# Clean-clone platform smoke test

This is the Milestone A reproducibility path for CrownFi. It proves that the canonical platform stack can be built from repository files without private setup instructions.

It currently starts and checks:

- PostgreSQL;
- Redis;
- the Rust/Axum API;
- the transitional Prisma database initializer;
- the Next.js web application.

A separate worker and Stellar indexer/adapter process are not yet present. Their absence keeps the complete Milestone A gate open; this smoke test must not be used to claim that those services already exist.

## Requirements

- Git;
- Docker Engine or Docker Desktop with Compose v2;
- `curl`;
- enough disk space to build the Node and Rust images.

No Stellar secret, contract ID, hosted database, or private team credential is required. The default profile is explicitly local and mock-only.

## Run from a fresh clone

```bash
git clone <repository-url> CrownFi
cd CrownFi
git switch integration/finale-platform-rebuild
bash scripts/acceptance/clean-clone-smoke.sh
```

The script creates `infra/.env.smoke` from `infra/.env.example` when the smoke environment does not already exist. It then builds the stack, waits for service health, checks PostgreSQL and Redis, verifies that `db-init` exited successfully, and stores evidence under:

```text
.artifacts/acceptance/clean-clone/
```

Expected local endpoints:

```text
Web: http://127.0.0.1:3000
Web health: http://127.0.0.1:3000/api/health
Rust API: http://127.0.0.1:8080
Rust API health: http://127.0.0.1:8080/health
Rust API readiness: http://127.0.0.1:8080/ready
```

## Stop the stack

```bash
docker compose \
  --env-file infra/.env.smoke \
  -f infra/docker-compose.yml \
  down
```

To clean up automatically after a smoke run:

```bash
CROWNFI_SMOKE_CLEANUP=1 bash scripts/acceptance/clean-clone-smoke.sh
```

## Human acceptance procedure

The tester should use a directory or disposable VM that has never contained CrownFi and should receive no verbal setup instructions before the attempt ends.

Record:

1. tester name and date;
2. branch and exact commit SHA;
3. operating system and Docker/Compose versions;
4. the script output;
5. `compose-ps.txt`;
6. API and web health responses;
7. every undocumented action required;
8. pass, fail, blocked, or not testable.

The clean-clone test passes only when the script succeeds without source edits, borrowed `.env` files, manually created database tables, or copied private credentials.

## Current limitations

- `db-init` still runs Prisma schema synchronization and the demo seed. SQLx becomes the migration authority during Milestone B.
- The Rust readiness route currently reports configuration presence rather than performing SQLx/Redis connectivity queries. Compose independently verifies PostgreSQL and Redis health.
- Most business data still uses legacy Next.js/Prisma routes or process-local Rust state.
- `STELLAR_MODE=mock` is mandatory for the default smoke path. Testnet validation is a separate procedure.
- A standalone worker, chain indexer, and reconciliation service remain future work.

These limitations are expected to be visible. The purpose of the test is to expose the real state, not hide missing platform components.
