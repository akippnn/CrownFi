# Clean-clone platform acceptance

This procedure verifies that the current default branch can be built and started from public repository files without private setup instructions.

## Candidate

Unless a PR-specific acceptance plan explicitly names another ref, test `main` and record its exact SHA.

```bash
git clone https://github.com/akippnn/CrownFi.git CrownFi
cd CrownFi
git switch main
git pull --ff-only
candidate_sha="$(git rev-parse HEAD)"
printf 'Candidate SHA: %s\n' "$candidate_sha"
git status --short
```

`git status --short` must be empty. A milestone PR should be tested from its exact head SHA and clearly labeled as PR evidence, not default-branch evidence.

## Stack covered

- PostgreSQL;
- Redis;
- SQLx migration initialization;
- Prisma compatibility initialization in the `legacy` schema;
- Rust/Axum API;
- Next.js web application.

A passing clean-clone smoke proves startup and basic readiness only. It does not prove ACL completeness, browser-role acceptance, real Testnet transactions, contract verification, concurrency/restart behavior for every domain, or production deployment.

## Requirements

- Git;
- Docker Engine or Docker Desktop with Compose v2;
- `curl`;
- Chrome, Edge, Safari, or Firefox;
- approximately 8 GB available RAM and 10–15 GB free disk space.

Use local/mock or Testnet data only. Never enter a seed phrase, private key, Mainnet funds, production credentials, or unrestricted signing secrets.

## Automated smoke

```bash
docker compose version
bash scripts/acceptance/clean-clone-smoke.sh
```

The script:

1. creates `infra/.env.smoke` from `infra/.env.example` when absent;
2. builds and starts the canonical Compose stack;
3. applies SQLx migrations through `db-init`;
4. initializes the Prisma compatibility schema through `legacy-db-init`;
5. waits for API and web health/readiness;
6. verifies PostgreSQL, Redis, and the canonical `organizations` table;
7. stores evidence under `.artifacts/acceptance/clean-clone/`.

Expected endpoints:

```text
Web: http://127.0.0.1:3000
Web health: http://127.0.0.1:3000/api/health
Rust API: http://127.0.0.1:8080
Rust API health: http://127.0.0.1:8080/health
Rust API readiness: http://127.0.0.1:8080/ready
```

## Optional explicit demo seed

The clean-clone smoke does not create canonical platform demo content. Apply it separately:

```bash
docker compose --env-file infra/.env.smoke -f infra/docker-compose.yml run --rm \
  -e CROWNFI_ALLOW_DEMO_SEED=true \
  api crownfi-api seed demo
```

See [`demo-seed.md`](demo-seed.md) for the deterministic records and safety boundary.

## Stop the disposable stack

```bash
docker compose \
  --env-file infra/.env.smoke \
  -f infra/docker-compose.yml \
  down --remove-orphans
```

Use `down --volumes` only for an explicitly disposable test database.

Automatic cleanup after the smoke run:

```bash
CROWNFI_SMOKE_CLEANUP=1 bash scripts/acceptance/clean-clone-smoke.sh
```

## Independent human acceptance

Use a directory, laptop, VM, or WSL environment that has never contained CrownFi. The tester should receive only public repository instructions—not copied environment files or undocumented verbal fixes.

Record:

1. tester, date, operating system, browser, Docker and Compose versions;
2. branch/ref and exact SHA;
3. terminal output and `.artifacts/acceptance/clean-clone/`;
4. Compose state and relevant service logs;
5. health/readiness responses;
6. browser screenshots plus Console and Network findings;
7. every undocumented action or correction;
8. pass, fail, blocked, or not-testable verdict.

The test fails when it requires source edits, copied private configuration, manually created database state, an undocumented command, or a false-success fallback.

## Evidence boundaries

- Local/mock operation is not Testnet proof.
- Healthy containers are not authorization or product acceptance.
- A feature-branch pass does not prove the same feature is on `main`.
- Contract IDs are unverified until the registry records source revision, artifact hash, deployment transaction, safe-read evidence, and independent review.
- Deployment verification, rollback, browser roles, device layouts, concurrency, and restart recovery remain separate gates.
