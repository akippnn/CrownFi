# CrownFi documentation

This directory is the canonical documentation home for CrownFi. Documentation must distinguish merged implementation from acceptance evidence, mock/demo paths, future plans, and preserved historical records.

## Start here

- [Current implementation status](status/CURRENT_IMPLEMENTATION_STATUS.md)
- [Current platform architecture](architecture/current-platform.md)
- [Rust API endpoint inventory](api/RUST_API_ENDPOINTS.md)
- [Platform v1 execution plan](planning/PLATFORM_V1_EXECUTION_PLAN.md)
- [Platform acceptance matrix](testing/PLATFORM_ACCEPTANCE_MATRIX.md)
- [Clean-clone acceptance](setup/clean-clone.md)
- [Database migration ownership](architecture/database-migration-ownership.md)
- [Stellar Testnet contract registry](blockchain/testnet-contract-registry.md)
- [Security audit notes](security/security-audit.md)

## Documentation truth model

| Label | Meaning |
|---|---|
| **Merged on `main`** | The implementation is available from the default branch. This does not imply product acceptance. |
| **Automated evidence** | A named check passed for the exact recorded branch/SHA and environment. |
| **Human acceptance pending** | Browser, role, device, accessibility, operational, or recovery evidence is incomplete. |
| **Testnet evidence pending** | Real signing, submission, indexing, reconciliation, and independent Explorer proof are incomplete. |
| **Mock/demo** | Explicit local/test fixture; never presented as live provider or ledger truth. |
| **Planned** | Specification or target architecture without accepted implementation. |
| **Historical evidence** | A dated record tied to an exact branch/SHA; preserve it rather than rewriting it as current evidence. |

When a PR merges, update the status, architecture, feature, API, setup, and acceptance documents affected by the merge. Do not mark a compound criterion complete when only its implementation scaffold exists.

## Product and feature areas

- [Project overview and pitch](overview/hackathon-pitch.md)
- [Voting](features/voting.md)
- [Ticketing](features/ticketing.md)
- [Verification and audit proofs](features/verification.md)
- [Admin and organizer flows](features/admin.md)
- [Collectibles and contestant support](features/collectibles.md)
- [R2 media](features/media-r2.md)
- [Stellar/Soroban integration](blockchain/stellar-soroban.md)
- [Transaction verification](blockchain/transaction-verification.md)

Feature documentation must say both what is merged and what remains unverified.

## Architecture and engineering decisions

- [Current runtime and authority boundaries](architecture/current-platform.md)
- [Platform transition plan](architecture/platform-refactor-plan.md)
- [Database migration ownership](architecture/database-migration-ownership.md)
- [Worker and Stellar processing boundary](architecture/worker-stellar-processing-boundary.md)
- [Component boundaries](architecture/component-boundaries.md)
- [Stellar-first consolidation ADR](architecture/ADR-0004-STELLAR_FIRST_CONSOLIDATION.md)
- [Design system](design/crownfi-design-system.md)

## Setup, deployment, and operations

- [Clean-clone platform path](setup/clean-clone.md)
- [Explicit demo seed](setup/demo-seed.md)
- [Local MVP compatibility testing](setup/local-mvp-testing.md)
- [Production-like Compose path](setup/production-compose.md)
- [GitHub-hosted deployment](setup/github-deployment.md)
- [VPS deployment](setup/deployment.md)
- [Supabase/Postgres compatibility](setup/supabase.md)
- [First administrator and account configuration](operations/FIRST_ADMIN_AND_ACCOUNT_CONFIGURATION.md)
- [Operations workflow](operations/workflow.md)

The canonical local multi-service path is `infra/docker-compose.yml`. The root `compose.yaml` remains a legacy web-only compatibility path.

SQLx migrations own the canonical `public` schema. Prisma remains temporary compatibility material in the `legacy` schema.

## Blockchain and ledger evidence

- [Stellar/Soroban integration](blockchain/stellar-soroban.md)
- [Transaction verification](blockchain/transaction-verification.md)
- [Testnet contract registry](blockchain/testnet-contract-registry.md)
- [Contract deployment guide](../contracts/DEPLOY_GUIDE.md)

A configured contract ID, submitted transaction, or database status is not independently verified ledger truth. Record network, source revision, artifact/WASM hash, transaction or contract event, safe-read evidence, reconciliation result, and independent Explorer verification.

## Testing and evidence

- [Platform acceptance matrix](testing/PLATFORM_ACCEPTANCE_MATRIX.md)
- [Clean-clone acceptance](setup/clean-clone.md)
- [Identity/admin/organizer browser acceptance](testing/IDENTITY_ADMIN_ORGANIZER_BROWSER_ACCEPTANCE.md)
- [Demo user flow](demo/user-flow.md)

Save exact branch/SHA, runtime profile, commands, expected and actual results, logs, screenshots, database evidence, and Stellar Explorer links. Automated smoke tests do not replace role/device review, concurrency and restart tests, security review, load tests, operator recovery, or deployment evidence.

## Planning and tracking

- [Platform v1 execution plan](planning/PLATFORM_V1_EXECUTION_PLAN.md)
- [Capability and hardcoding inventory](planning/CAPABILITY_AND_HARDCODING_INVENTORY.md)
- [Milestone B progress](planning/MILESTONE_B_PROGRESS.md)
- [Tracking conventions](tracking/README.md)
- [Label automation](project-management/LABEL_AUTOMATION.md)

Issues are stable specifications. PR descriptions are implementation checklists. A merged PR says its code is integrated; it does not automatically satisfy exact-head CI, browser, Testnet, deployment, or independent acceptance gates.

## Historical and compatibility documents

- `docs/archive/` contains preserved historical summaries.
- Root-level legacy documents remain for compatibility while canonical replacements live under `docs/`.
- Dated acceptance evidence must retain its tested branch and SHA even after the repository moves forward.

## Current boundary

The persistent platform, full-screen management shell, durable voting, durable ticketing, deterministic Testnet-only market state, media completion serialization, commerce/Stellar workflow foundations, and deployment acceleration are merged on `main`.

They remain subject to the open milestone concerns for authorization completion, real Testnet/indexer/reconciliation proof, concurrency/restart/outage recovery, role/device/accessibility acceptance, KYC/provider integration, media lifecycle completion, and exact deployed-SHA evidence.

Do not describe CrownFi as production-ready legal tabulation, mainnet financial infrastructure, fully reconciled commerce, completed KYC/payment-provider infrastructure, or a production prediction-market service until those gates pass.
