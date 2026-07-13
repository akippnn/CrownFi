# CrownFi documentation

This directory is the canonical documentation home for the CrownFi platform consolidation. CrownFi is documented as a production-shaped Stellar Testnet platform under active refactor, without presenting incomplete prototype behavior as production-ready infrastructure.

## Start here

- [Current platform architecture](architecture/current-platform.md)
- [Platform refactor plan](architecture/platform-refactor-plan.md)
- [Platform v1 execution plan](planning/PLATFORM_V1_EXECUTION_PLAN.md)
- [Capability and hardcoding inventory](planning/CAPABILITY_AND_HARDCODING_INVENTORY.md)
- [Platform acceptance matrix](testing/PLATFORM_ACCEPTANCE_MATRIX.md)
- [Clean-clone smoke test](setup/clean-clone.md)
- [Database migration ownership](architecture/database-migration-ownership.md)
- [Worker and Stellar processing boundary](architecture/worker-stellar-processing-boundary.md)
- [Stellar Testnet contract registry](blockchain/testnet-contract-registry.md)
- [Security audit notes](security/security-audit.md)

## Product and feature areas

- [Project overview and pitch](overview/hackathon-pitch.md)
- [Voting system](features/voting.md)
- [Ticketing system](features/ticketing.md)
- [Verification and audit proof flow](features/verification.md)
- [Admin and organizer flows](features/admin.md)
- [Collectibles and contestant support](features/collectibles.md)
- [Stellar/Soroban integration](blockchain/stellar-soroban.md)
- [Transaction verification notes](blockchain/transaction-verification.md)

## Architecture and engineering decisions

- [Current runtime and responsibility boundaries](architecture/current-platform.md)
- [Platform transition plan](architecture/platform-refactor-plan.md)
- [Database migration ownership](architecture/database-migration-ownership.md)
- [Worker and Stellar processing boundary](architecture/worker-stellar-processing-boundary.md)
- [Component boundaries](architecture/component-boundaries.md)
- [CrownFi design system](design/crownfi-design-system.md)
- [Operations workflow](operations/workflow.md)

## Setup and deployment

- [Clean-clone platform path](setup/clean-clone.md)
- [Local MVP compatibility testing](setup/local-mvp-testing.md)
- [Production-like Docker Compose path](setup/production-compose.md)
- [VPS deployment notes](setup/deployment.md)
- [Supabase/Postgres compatibility setup](setup/supabase.md)

The canonical local multi-service path is `infra/docker-compose.yml`. The root `compose.yaml` remains a legacy web-only compatibility path.

SQLx becomes the canonical schema authority during Milestone B. Prisma and Supabase documentation remain temporarily because the existing web routes and team workflow still depend on them.

## Blockchain verification

- [Stellar/Soroban integration](blockchain/stellar-soroban.md)
- [Transaction verification](blockchain/transaction-verification.md)
- [Testnet contract deployment registry](blockchain/testnet-contract-registry.md)
- [Contract deployment guide](../contracts/DEPLOY_GUIDE.md)

A contract ID is not considered verified until its network, WASM hash, source revision, deployment transaction, and independent Explorer check are recorded in the registry.

## Testing and human evidence

- [Platform acceptance matrix](testing/PLATFORM_ACCEPTANCE_MATRIX.md)
- [Clean-clone human acceptance procedure](setup/clean-clone.md)
- [Demo user flow](demo/user-flow.md)

The fastest reproducibility command is:

```bash
bash scripts/acceptance/clean-clone-smoke.sh
```

Human smoke tests do not replace automated unit, integration, concurrency, restart-recovery, security, or load tests. Save the branch, commit SHA, runtime profile, exact steps, expected/actual results, logs, screenshots, database evidence, and Stellar Explorer links.

## Status and boundaries

The repository currently preserves a working Next.js MVP while adding a Rust/Axum platform path. PostgreSQL and Redis are available through Compose, but SQLx repositories, workers, indexing/reconciliation, R2 media, and production KYC are not complete.

Do not describe CrownFi as production-ready voting, mainnet financial, fully reconciled commerce, or production prediction-market infrastructure until the relevant acceptance gates pass.
