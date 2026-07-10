# CrownFi documentation

This folder is the documentation home for the CrownFi hackathon MVP. The project is intentionally documented as a testnet/demo system: enough structure to run safely on a VPS and explain the architecture, without pretending it is production voting or real-money infrastructure.

## Start here

- [Project overview and pitch](overview/hackathon-pitch.md)
- [Current platform architecture](architecture/current-platform.md)
- [Platform refactor plan](architecture/platform-refactor-plan.md)
- [Local MVP testing path](setup/local-mvp-testing.md)
- [Production-like Docker Compose path](setup/production-compose.md)
- [Security audit notes](security/security-audit.md)

## System areas

- [Voting system](features/voting.md)
- [Ticketing system](features/ticketing.md)
- [Verification and audit proof flow](features/verification.md)
- [Admin and organizer flows](features/admin.md)
- [Collectibles and contestant support](features/collectibles.md)
- [Stellar/Soroban integration](blockchain/stellar-soroban.md)
- [Transaction verification notes](blockchain/transaction-verification.md)

## Setup and deployment

- [Local MVP testing](setup/local-mvp-testing.md)
- [VPS deployment notes](setup/deployment.md)
- [Production-like Docker Compose path](setup/production-compose.md)
- [Supabase/Postgres setup](setup/supabase.md)

Supabase is kept because the current implementation and team workflow support it. The refactor path keeps the database interface portable so a self-hosted Postgres deployment can be used later.

## Engineering references

- [Component boundaries](architecture/component-boundaries.md)
- [CrownFi design system](design/crownfi-design-system.md)
- [Operations workflow](operations/workflow.md)
- [Demo user flow](demo/user-flow.md)
- [Refactor TODO](planning/refactor-todo.md)
