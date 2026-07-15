# Worker and Stellar processing boundary

Status: **decision recorded; implementation pending**.

Milestone A requires an honest boundary for work that must survive HTTP request timeouts, API restarts, and partial Stellar/provider failures. CrownFi does not currently run a separate worker or chain indexer, so this document defines the target without claiming it already exists.

## Decision

The Rust platform will expose two runtime roles from the same reviewed codebase initially:

```text
crownfi-api serve
crownfi-api worker
```

They may share crates, models, repositories, configuration validation, and the same container image, but they run as separate processes/services.

This avoids creating a second independent backend implementation while ensuring long-running and retryable work is not performed inside a browser request or Next.js route.

## HTTP API role

The `serve` role owns synchronous request/response work:

- authentication and organization-scoped authorization;
- request validation;
- pageant/contestant/category CRUD;
- vote intake and receipt responses;
- order creation;
- idempotency-key validation;
- creation and validation of transaction intents;
- creation of durable jobs/outbox records;
- read APIs for job, transaction, ownership, and reconciliation state;
- administrative retry/cancel requests.

The API may submit a transaction when the operation is short and the result is durably recorded, but it must not keep correctness-critical state only in memory while waiting for confirmation.

## Worker role

The `worker` role owns asynchronous/retryable work:

- payment and transaction confirmation polling;
- Soroban contract-event ingestion;
- durable chain cursor advancement;
- collectible and ticket mint fulfillment;
- payout processing;
- webhook-event processing after signature verification and inbox persistence;
- image metadata/variant jobs for R2 where applicable;
- retry policies and dead-letter state;
- reconciliation between expected application actions and confirmed ledger/provider events;
- scheduled expiry of reservations and intents;
- administrative reprocessing.

## Stellar gateway

Both runtime roles use one shared Stellar gateway abstraction. The gateway owns:

- network/passphrase validation;
- RPC and Horizon clients;
- unsigned transaction construction;
- envelope decoding and validation;
- transaction submission;
- confirmation lookup;
- contract-event decoding;
- Explorer URL generation;
- explicit mock and Testnet adapters.

Domain code must not construct ad hoc RPC calls or infer success from a transaction hash string.

## Source-of-truth rules

| State | Authority |
|---|---|
| Expected operation, amount, recipient, expiration | PostgreSQL transaction intent |
| Signed envelope submitted | PostgreSQL plus stored envelope/hash metadata |
| Transaction success/failure | Stellar network |
| Contract event | Stellar network, indexed idempotently |
| Order/fulfillment workflow | PostgreSQL state machine informed by confirmed chain/provider state |
| Ticket/collectible ownership | Stellar/contract state, projected into PostgreSQL |
| Retry/dead-letter status | PostgreSQL job records |
| Short-lived coordination/locks | Redis, never the sole durable record |

## Outbox/job model

The API writes the business change and outbox/job record in one PostgreSQL transaction.

A worker claims jobs with a lease, records attempts, and either:

- completes the job;
- schedules a retry with bounded backoff;
- marks it dead-lettered with a visible reason;
- pauses it for administrator review.

A process crash must release or expire the lease without losing the durable job.

## Idempotency requirements

Every worker handler must tolerate being executed more than once.

Examples:

- provider events have unique provider/event IDs;
- Stellar transactions have unique network/hash constraints;
- contract events have unique network/ledger/transaction/event identifiers;
- a fulfillment references one order item and mint policy;
- ownership projections are rebuilt/upserted from chain events;
- payout transfers use stable expected-transfer identifiers.

A retry must not create a second charge, mint, ticket, payout, or vote.

## Initial deployment topology

```text
Next.js web
    |
    v
Rust API (serve) ---- PostgreSQL ---- Rust worker
       |                   |              |
       +------ Redis ------+--------------+
       |                                  |
       +----------- Stellar gateway ------+
                         |
                  Stellar Testnet
```

The initial worker may use PostgreSQL polling. Redis-backed queues may be introduced later, but Redis must not become the only record of a job that affects money, ownership, voting proofs, or KYC decisions.

## Health and readiness

### API readiness

Must fail when required database/Redis configuration or connectivity is unavailable for the active runtime profile.

### Worker readiness

Must report:

- database connectivity;
- Redis connectivity where required;
- active network/profile;
- current chain cursor;
- last successful polling/ingestion time;
- queue lag and dead-letter count;
- whether required contract deployments are verified/configured.

A worker that cannot safely process jobs must become unready rather than silently dropping work.

## Runtime profiles

### Local

- worker may run with mock Stellar/provider adapters;
- jobs and retries still persist in PostgreSQL;
- mock results are visibly labeled.

### Testnet/staging

- real Stellar Testnet gateway;
- no automatic fallback to mock;
- only verified contract deployments;
- durable cursor, job attempts, and reconciliation incidents;
- demo/private bypasses disabled.

### Production

Not enabled during the current phase. Requires additional security, compliance, signer, operational, and mainnet-readiness review.

## Signing boundary

The public Next.js container must not hold an unrestricted platform secret.

Preferred progression:

1. administrator Freighter approval where interactive authorization is appropriate;
2. contract authorization or multisig for privileged actions;
3. narrowly scoped worker signer only where automation is required;
4. secrets loaded through deployment secret management, never repository files;
5. signer operations recorded in the audit log.

## Implementation sequence

1. Add SQLx/PostgreSQL pools and migrations.
2. Add `jobs`, `job_attempts`, `transaction_intents`, and chain cursor/event tables in the relevant milestones.
3. Introduce `serve` and `worker` runtime commands.
4. Add one no-op/local job to prove claiming, retry, and restart behavior.
5. Move transaction confirmation and indexing to the worker.
6. Move mint/ticket fulfillment and payouts.
7. Add reconciliation incidents and operator retry controls.
8. Add worker service to Compose, Arcturus, health checks, and the clean-clone acceptance path.

## Acceptance gate

The boundary is implemented only when a human can:

1. create a durable test job through the API;
2. stop the worker before it finishes;
3. restart it;
4. observe the same job resume;
5. force a retryable failure;
6. repair the dependency and retry;
7. confirm exactly one final side effect;
8. inspect attempts and audit history.

Until then, Milestone A may record this decision, but the complete runtime baseline must continue to identify the worker/indexer as missing.
