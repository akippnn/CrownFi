# Contributing to CrownFi

CrownFi is being consolidated into a production-shaped, multi-pageant Stellar Testnet platform. Git history is the collaboration medium. Do not exchange replacement ZIP trees or create unrelated repository roots.

## Branch model

- `main` must remain deployable.
- Shared integration work currently lands on `integration/finale-platform-rebuild`; after the baseline is accepted, the canonical integration branch becomes `integration/platform-v1`.
- Create short-lived feature branches from the current integration branch.
- Use one vertical capability per branch, for example `slice/organizer-pageants`, `slice/voting-platform`, or `slice/ticketing-platform`.
- Do not develop directly on `main`.
- Do not force-push shared branches.
- Do not merge unrelated histories.

## Before starting work

1. Pull the latest integration branch.
2. Read `docs/planning/PLATFORM_V1_EXECUTION_PLAN.md`.
3. Check `docs/testing/PLATFORM_ACCEPTANCE_MATRIX.md`.
4. Identify database, contract, API, UI, and deployment boundaries affected by the change.
5. Declare any shared files that must change before implementation begins.

## Shared-file collision policy

Changes to these files must be coordinated and kept minimal:

- root workspace manifests and lockfiles;
- database migration ordering;
- `services/api/src/main.rs` and root router registration;
- global navigation and application shell;
- `.env.example` files;
- deployment manifests;
- CI workflows.

Prefer adding a domain module over expanding central files. Each API domain should expose a small router or registration function. The integration owner performs the final central registration when practical.

## Pull-request contract

Every pull request must state:

```text
Purpose:
Depends on:
Database migration:
Contracts affected:
Shared files touched:
Feature flag:
Local/mock behavior:
Testnet behavior:
Acceptance tests:
Rollback procedure:
```

A pull request should not combine a database redesign, contract rewrite, unrelated UI restyling, and deployment changes unless they are inseparable and explicitly reviewed as one integration slice.

## Runtime rules

- Seed data is allowed only through explicit, repeatable seed commands.
- Mock adapters are allowed in local development and automated tests.
- Testnet and staging must never silently fall back to mock behavior.
- Process-local state must not represent votes, orders, payment events, transaction intents, ownership, or financial settlement.
- Do not store unrestricted Stellar signing secrets in the public web runtime.
- Do not use floating-point values for money.

## Definition of done

A change is complete only when:

- behavior is covered by tests;
- migrations work from a clean database;
- existing acceptance flows still pass;
- failure and retry behavior are documented;
- mock and Testnet behavior are explicit;
- relevant documentation matches the implementation;
- the branch can be integrated without discarding another developer's work.
