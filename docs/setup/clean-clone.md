# Clean-clone platform acceptance

This is CrownFi's Milestone A reproducibility path. It verifies that the current integrated platform can be built and started from public repository files without private setup instructions.

## Candidate

Use the exact candidate revision recorded in `docs/testing/MILESTONE_A_TEST_EXECUTION_2026-07-15.md`. Do not silently test `main`, an older slice branch, or a previously prepared development checkout.

## Stack covered

- PostgreSQL;
- Redis;
- SQLx database migration/init;
- Rust/Axum API;
- Next.js web application.

A passing clean-clone smoke proves startup and basic readiness only. It does not prove ACL completeness, browser-role acceptance, real Testnet transactions, contract verification, or production deployment.

## Requirements

- Git;
- Docker Engine or Docker Desktop with Compose v2;
- `curl`;
- Chrome, Edge, Safari, or Firefox;
- approximately 8 GB available RAM and 10–15 GB free disk space.

Use Testnet or local/mock data only. Never enter a seed phrase, private key, Mainnet funds, production credential, or unrestricted signing secret.

## Run from a fresh clone

```bash
git clone https://github.com/akippnn/CrownFi.git CrownFi
cd CrownFi
git switch integration/platform-v1
git pull --ff-only
git rev-parse HEAD
git status --short
docker compose version
bash scripts/acceptance/clean-clone-smoke.sh
```

Before testing, record the exact SHA. `git status --short` should be empty.

The script creates `infra/.env.smoke` from the public example when needed, builds the stack, waits for health/readiness, checks PostgreSQL and Redis, validates the migration/init job, and stores evidence under:

```text
.artifacts/acceptance/clean-clone/
```

Expected endpoints:

```text
Web: http://127.0.0.1:3000
Web health: http://127.0.0.1:3000/api/health
Rust API: http://127.0.0.1:8080
Rust API health: http://127.0.0.1:8080/health
Rust API readiness: http://127.0.0.1:8080/ready
```

## Stop the disposable stack

```bash
docker compose \
  --env-file infra/.env.smoke \
  -f infra/docker-compose.yml \
  down --remove-orphans
```

Use `down --volumes` only for an explicitly disposable test database. Do not remove a retained development or deployment volume.

To clean up automatically after the smoke run:

```bash
CROWNFI_SMOKE_CLEANUP=1 bash scripts/acceptance/clean-clone-smoke.sh
```

## Human acceptance

The independent tester should use a directory, laptop, VM, or WSL environment that has never contained CrownFi. Before the attempt ends, the tester should receive only the public repository instructions—not copied environment files or private verbal fixes.

Record:

1. tester, date, operating system, browser, Docker and Compose versions;
2. exact branch and SHA;
3. terminal output and `.artifacts/acceptance/clean-clone/`;
4. Compose state and service logs;
5. health/readiness responses;
6. browser screenshots plus Console and Network findings;
7. every undocumented action or correction required;
8. pass, fail, blocked, or not-testable verdict.

The clean-clone test fails when it requires source edits, copied private configuration, manually created database state, an undocumented command, or a false-success fallback.

## Known boundaries

- Local/mock operation is not Testnet proof.
- Healthy containers are not authorization or product acceptance.
- Deployment verification and rollback are separate gates.
- Contract IDs remain unverified until the registry contains source, artifact hash, deployment transaction, safe-read evidence, and independent review.
- Milestone A remains open until two independent clean-clone runs, browser review, Testnet registry verification, and promotion/deployment evidence are recorded.
