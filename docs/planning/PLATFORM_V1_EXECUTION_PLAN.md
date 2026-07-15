# CrownFi Platform v1 Execution Plan

## Product target

CrownFi v1 is a production-shaped, multi-pageant platform operating on Stellar Testnet. Testnet, sandbox providers, and explicit demo seeds are acceptable. Hardcoded pageants, silent mock fallbacks, in-memory financial state, and code changes for each new event are not.

The platform must support organizers, contestants, fans, staff, auditors, tickets, collectibles, voting proofs, and fan engagement without treating one seeded pageant as the product.

## Canonical runtime

```text
Browser and wallets
        |
        v
Next.js web application
UI, routing, signing UX
        |
        v
Rust/Axum API
business rules, authorization, workflows
   |         |          |
   v         v          v
Postgres    Redis      Workers
   |                    |
   +---------+----------+
             v
Stellar gateway, indexer, reconciliation
             |
             v
Stellar Testnet and Soroban
```

### Authority boundaries

| Domain | Authority |
|---|---|
| Organizations, pageants, contestants, categories | PostgreSQL through Rust API |
| Raw votes and eligibility | PostgreSQL through Rust API |
| Published voting commitments | PostgreSQL plus Soroban audit anchor |
| Orders and payment attempts | PostgreSQL |
| Payment provider events | Verified webhook inbox |
| Ticket and collectible ownership | Stellar/Soroban, indexed into PostgreSQL |
| Prediction-market escrow and settlement | Soroban, indexed into PostgreSQL |
| UI projections | PostgreSQL read models |

The database may index chain state but must not invent a successful on-chain operation.

## Environment profiles

### Local

- Local PostgreSQL and Redis.
- Explicit seed command.
- Mock Stellar and provider adapters allowed.
- Developer session shortcuts allowed when visibly marked.

### Testnet

- Persistent PostgreSQL and Redis.
- Real Stellar Testnet RPC and wallet signing.
- Real deployed Soroban contract IDs.
- No automatic fallback to mock behavior.

### Staging

- Production-shaped deployment on Testnet.
- No mock endpoints or demo authentication bypass.
- Migrations, workers, reconciliation, logging, and backups enabled.
- This is the hackathon demonstration environment.

### Production

- Same runtime architecture.
- Mainnet-capable configuration.
- Legally sensitive capabilities disabled until compliance and security gates are met.

## Milestone A — trustworthy baseline

Deliverables:

1. Repository capability inventory.
2. Collaboration and branch protocol.
3. Executable acceptance matrix.
4. One documented local startup path.
5. One documented Testnet/staging path.
6. Current contract deployment inventory.
7. Contradictory architecture documentation removed.
8. Hardcoded and in-memory state inventory.
9. Database backup and migration prerequisites documented.
10. Current reconstruction branch remains deployable.

Exit gate:

- A clean clone can start the documented local stack.
- Every major capability is classified as working, partial, mock-only, Testnet-capable, hardcoded, duplicated, or obsolete.
- No new feature slice begins without an owner, dependency list, and acceptance criteria.

## Milestone B — platform foundation

Deliverables:

- organizations and memberships;
- pageants, venues, categories, contestants, media, and staff;
- PostgreSQL-backed Rust repositories;
- Redis-backed rate limits and distributed coordination;
- SQL migrations from an empty database;
- OpenAPI contract and generated TypeScript client;
- explicit feature flags and environment validation;
- audit logging and organization-scoped authorization.

Exit gate:

- An approved organizer can create a second pageant without a code change.
- One organization cannot read or mutate another organization's resources.
- Restarting the API does not lose platform state.

## Milestone C — voting product

Deliverables:

- configurable voting categories and rounds;
- database-enforced duplicate-vote protection;
- durable receipts and tally snapshots;
- Merkle proof generation;
- Soroban Testnet anchoring;
- indexer and reconciliation;
- concurrent-vote and load tests.

Exit gate:

- Voting survives API restart and multiple API instances.
- A closed tally can be independently verified against a Stellar transaction.
- Raw voter information remains off-chain.

## Milestone D — commerce product

Deliverables:

- durable inventory and reservations;
- orders and payment attempts;
- transaction intents;
- ticket fulfillment;
- collectible editions and contestant support;
- retryable minting;
- Stellar ownership indexing;
- deterministic sale splits and refunds.

Exit gate:

- Payment success followed by mint failure is recoverable without duplicate fulfillment.
- Ownership is confirmed from Stellar rather than an optimistic database flag.

## Milestone E — operational platform

Deliverables:

- organizer dashboard;
- reconciliation and incident console;
- verified webhook inbox and outbox workers;
- identity-provider boundary;
- KYC reference boundary;
- monitoring, backups, health, readiness, and rollback procedures;
- complete staging deployment.

## Milestone F — extended engagement

Deliverables:

- append-only loyalty ledger;
- rewards and redemptions;
- leaderboards;
- moderated, Testnet-only prediction markets after policy and governance gates.

Prediction markets must not block the core platform.

## Required data-model direction

Core tenancy:

```text
Organization
OrganizationMember
User
Role
Pageant
PageantVenue
PageantStaff
```

Pageant configuration:

```text
Category
Contestant
ContestantMedia
VotingRound
VotingEligibilityRule
TicketEvent
TicketProduct
CollectibleCollection
CollectibleEdition
```

Voting and audit:

```text
Vote
VoteReceipt
TallySnapshot
MerkleLeaf
AuditCheckpoint
AuditLog
```

Commerce:

```text
Order
OrderItem
PaymentAttempt
PaymentProviderEvent
FulfillmentJob
Refund
```

Stellar:

```text
ContractDeployment
TransactionIntent
StellarTransaction
ContractEvent
ChainCursor
ReconciliationFailure
```

Fan engagement and compliance:

```text
LoyaltyAccount
LoyaltyLedgerEntry
Reward
RewardRedemption
KycCase
KycProviderEvent
PolicyDecision
```

Money must use integer asset amounts and explicit precision. Floating-point monetary fields are migration targets.

## Migration strategy

1. Add normalized tables without destroying current data.
2. Backfill existing data into a default demo organization and pageant.
3. Verify row counts and relationships.
4. Migrate one vertical slice at a time.
5. Stop legacy writes only after the replacement path passes acceptance tests.
6. Remove legacy tables and routes only after rollback is no longer required.

## Vertical-slice order

1. Organizations and pageants.
2. Voting.
3. Ticketing.
4. Collectibles and contestant support.
5. Identity, payment providers, and KYC boundary.
6. Loyalty and rewards.
7. Prediction markets.

## Hardcoding removal targets

| Prototype pattern | Platform replacement |
|---|---|
| Seeded event in process state | Pageant repository and explicit seed command |
| Seeded contestants | Organizer-managed contestant records |
| In-memory votes | PostgreSQL with unique constraints |
| In-memory transaction intents | Persistent intent lifecycle |
| Stringly typed statuses | Validated enums and transitions |
| Floating-point prices | Integer asset amounts |
| Global administrator allowlist | Organization memberships and RBAC |
| Scattered contract IDs | Contract deployment registry |
| Platform secret in web runtime | Restricted signing boundary |
| Silent mock fallback | Explicit environment capability |
| Mutable points counter | Append-only loyalty ledger |
| One global pageant | Multi-organization tenancy |
| Next.js business routes | Rust domain services |

## Immediate implementation queue

1. Complete capability and hardcoding inventory.
2. Correct README architecture and environment claims.
3. Add an executable clean-clone acceptance script.
4. Establish database migration ownership and backup procedure.
5. Define organization/pageant OpenAPI contracts and state transitions.
6. Implement PostgreSQL-backed organization and pageant repositories.
7. Replace seeded API state only after the new path passes acceptance tests.
