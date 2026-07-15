# Milestone A clean-clone smoke evidence

This file records reproducible CI evidence for the canonical CrownFi Compose path. It does not replace the required second-person manual clean-clone test.

## Successful automated run

| Field | Value |
|---|---|
| Date | 2026-07-14 (project timezone) / 2026-07-13 UTC |
| Branch | `integration/finale-platform-rebuild` |
| Commit | `a58f3f1e0bc4477c28652f59185d6fbec5446a70` |
| Workflow | `Platform clean-clone smoke` |
| Run | `29279845645` / run number 8 |
| Result | **Passed** |
| Artifact | `crownfi-clean-clone-smoke` |
| Artifact digest | `sha256:aef68baf124bdb61263ef6489b12e058df1c6ad6c103e13edae6d50a7ed14c40` |
| Artifact expiry | 2026-07-20 UTC |

## Verified responses

### Rust API health

```json
{"mode":"local","ok":true,"service":"crownfi-api","stellar_mode":"mock"}
```

This confirms the clean-clone path does not silently start in live/Testnet mode.

### Rust API readiness

```json
{"database_configured":true,"note":"Phase 0 API uses in-memory state; DB/Redis are wired by env for the next phase.","ok":true,"redis_configured":true}
```

The response accurately exposes the transitional limitation: database and Redis URLs are configured, but the Phase 0 domain state is still in memory.

### Next.js health

```json
{"ok":true,"service":"crownfi-web","runtime":"nextjs"}
```

### PostgreSQL

```text
/var/run/postgresql:5432 - accepting connections
```

### Redis

```text
PONG
```

## Compose state captured by the artifact

```text
NAME                          SERVICE    RESULT
crownfi-platform-api-1        api        running, healthy, host port 8080
crownfi-platform-db-init-1    db-init    exited 0
crownfi-platform-postgres-1   postgres   running, healthy, internal port 5432
crownfi-platform-redis-1      redis      running, healthy, internal port 6379
crownfi-platform-web-1        web        running, host port 3000; endpoint already reachable
```

The web container was still transitioning from Compose's `health: starting` label when evidence was captured, but the script had already successfully called `/api/health`. This is acceptable for the script result; future evidence may wait for the Compose health label as an additional assertion.

## What this run proves

- the canonical images build on a clean GitHub-hosted runner;
- safe local environment defaults are sufficient;
- PostgreSQL and Redis become healthy;
- the transitional Prisma initializer completes successfully;
- the Rust API becomes healthy and reachable;
- the Next.js web service becomes reachable;
- evidence is generated and uploaded;
- local startup is visibly mock-only.

## What this run does not prove

- a human can follow only the README on a fresh personal machine;
- SQLx migrations or Rust PostgreSQL repositories exist;
- process-local votes, snapshots, markets, and intents survive restart;
- a standalone worker/indexer/reconciliation service exists;
- the recorded Testnet contracts are live and verified;
- Freighter or a real Stellar Testnet transaction succeeds;
- staging deployment works.

## Remaining human test

A teammate who did not prepare the environment should:

1. clone the repository into a clean directory or disposable VM;
2. switch to the exact candidate commit;
3. follow only `README.md` and `docs/setup/clean-clone.md`;
4. run `bash scripts/acceptance/clean-clone-smoke.sh`;
5. record every extra instruction or source edit needed;
6. open the web application and inspect browser console/network errors;
7. mark the test pass/fail/blocked.

Milestone A is not fully complete until that human run passes and the Testnet deployment registry is independently verified.
