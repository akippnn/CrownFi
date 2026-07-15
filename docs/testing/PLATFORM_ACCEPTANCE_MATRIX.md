# CrownFi Platform Acceptance Matrix

This matrix is the release contract for the platform refactor. A row marked `required` blocks the corresponding milestone. Evidence must be a test, command output, transaction hash, screenshot linked to a reproducible run, or documented manual procedure.

## Status vocabulary

- `pass`: verified in the current branch and environment.
- `partial`: some behavior exists but the full acceptance condition is not met.
- `mock-only`: works only through a mock or in-memory adapter.
- `testnet-capable`: implemented for Testnet but not yet verified in the current run.
- `blocked`: dependency or defect prevents verification.
- `not-started`: no implementation yet.

## Milestone A — baseline

| ID | Acceptance condition | Environment | Required | Current classification | Evidence owner |
|---|---|---|---|---|---|
| A-01 | Clean clone has one documented local startup path | local | yes | partial | integration |
| A-02 | PostgreSQL starts and reports healthy | local | yes | partial | platform |
| A-03 | Redis starts and reports healthy | local | yes | partial | platform |
| A-04 | Rust API starts and reports health/readiness | local | yes | partial | backend |
| A-05 | Web application starts and reaches the API | local | yes | partial | frontend |
| A-06 | Seed command is explicit, repeatable, and idempotent | local | yes | partial | data |
| A-07 | Mock and Testnet modes are visibly distinct | all | yes | partial | integration |
| A-08 | Testnet configuration fails closed when required values are missing | testnet | yes | not-started | Stellar |
| A-09 | Major capabilities are inventoried and classified | repository | yes | partial | integration |
| A-10 | README matches the active architecture | repository | yes | blocked | documentation |
| A-11 | Current contract deployments and versions are recorded | testnet | yes | not-started | Stellar |
| A-12 | Database backup and migration prerequisites are documented | staging | yes | not-started | data |
| A-13 | Main remains deployable and reconstruction branch remains reproducible | CI | yes | partial | integration |

## Milestone B — platform foundation

| ID | Acceptance condition | Environment | Required | Current classification | Evidence owner |
|---|---|---|---|---|---|
| B-01 | Create an organization without code changes | local | yes | not-started | backend |
| B-02 | Approve an organizer and assign organization-scoped roles | local | yes | not-started | backend |
| B-03 | Create a pageant through API/UI without code changes | local | yes | not-started | full stack |
| B-04 | Add categories, contestants, media, dates, and capabilities | local | yes | not-started | full stack |
| B-05 | Organization A cannot access Organization B data | integration | yes | not-started | security |
| B-06 | API restart preserves all platform records | integration | yes | not-started | backend |
| B-07 | Two API instances operate against shared PostgreSQL/Redis state | integration | yes | not-started | platform |
| B-08 | Migrations apply from an empty database | CI | yes | not-started | data |
| B-09 | Existing MVP records are backfilled into a demo organization/pageant | migration | yes | not-started | data |
| B-10 | OpenAPI contract generates a TypeScript client without drift | CI | yes | not-started | API |
| B-11 | Money fields use integer amounts and explicit asset precision | all | yes | not-started | data |
| B-12 | Audit log records privileged mutations | integration | yes | not-started | security |

## Milestone C — voting

| ID | Acceptance condition | Environment | Required | Current classification | Evidence owner |
|---|---|---|---|---|---|
| C-01 | Organizer configures a voting round for any pageant/category | staging | yes | hardcoded/partial | voting |
| C-02 | Fan submits a vote through Rust API | integration | yes | partial | voting |
| C-03 | Database constraint rejects duplicate vote | integration | yes | partial | voting |
| C-04 | Concurrent duplicate submissions produce one accepted vote | load | yes | not-started | voting |
| C-05 | API restart does not lose accepted votes | integration | yes | not-started | voting |
| C-06 | Multiple API instances preserve duplicate-vote guarantees | integration | yes | not-started | voting |
| C-07 | Closing a round produces immutable tally and Merkle snapshot | integration | yes | partial | voting |
| C-08 | Receipt proof verifies against the snapshot | integration | yes | partial | voting |
| C-09 | Snapshot anchors to Soroban Testnet | testnet | yes | testnet-capable | Stellar |
| C-10 | Anchor transaction is indexed and reconciled | testnet | yes | not-started | Stellar |
| C-11 | Raw voter data is absent from chain payloads | testnet | yes | partial | security |
| C-12 | Burst test meets documented target without lost votes | load | yes | not-started | performance |

## Milestone D — ticketing and collectibles

| ID | Acceptance condition | Environment | Required | Current classification | Evidence owner |
|---|---|---|---|---|---|
| D-01 | Organizer creates ticket products and inventory | staging | yes | partial/hardcoded | ticketing |
| D-02 | Concurrent reservations cannot oversell inventory | integration | yes | not-started | ticketing |
| D-03 | Order and payment state survive service restart | integration | yes | not-started | commerce |
| D-04 | Wallet signs a real Testnet transaction intent | testnet | yes | testnet-capable | Stellar |
| D-05 | Submitted transaction is validated against the original intent | testnet | yes | partial | security |
| D-06 | Ticket mint is confirmed from Stellar before fulfillment completes | testnet | yes | partial | ticketing |
| D-07 | Paid order with failed mint enters retryable state | integration | yes | not-started | commerce |
| D-08 | Replayed fulfillment cannot mint twice | integration | yes | not-started | commerce |
| D-09 | Ticket ownership can be independently verified | testnet | yes | partial | ticketing |
| D-10 | Check-in is one-time and replay-resistant | staging | yes | partial | ticketing |
| D-11 | Organizer creates collectible collection and editions | staging | yes | partial/hardcoded | collectibles |
| D-12 | Collectible payment split is deterministic and reconciled | testnet | yes | partial | collectibles |
| D-13 | Collectible ownership is derived from indexed chain state | testnet | yes | not-started | Stellar |
| D-14 | A second pageant can create tickets and collectibles without code changes | staging | yes | not-started | full stack |

## Milestone E — operations and providers

| ID | Acceptance condition | Environment | Required | Current classification | Evidence owner |
|---|---|---|---|---|---|
| E-01 | Provider webhook rejects invalid or missing signatures | integration | yes | not-started | payments |
| E-02 | Duplicate provider events are idempotent | integration | yes | not-started | payments |
| E-03 | Amount, currency, order, provider ID, and environment reconcile | integration | yes | not-started | payments |
| E-04 | Webhook is stored before asynchronous fulfillment | integration | yes | not-started | payments |
| E-05 | Failed jobs are retryable and visible in an incident queue | staging | yes | not-started | operations |
| E-06 | Stellar indexer resumes from durable cursor | integration | yes | not-started | Stellar |
| E-07 | Reprocessing old ledgers is idempotent | integration | yes | not-started | Stellar |
| E-08 | Reconciliation mismatch creates an administrative incident | staging | yes | not-started | operations |
| E-09 | KYC stores provider reference/status, not raw identity documents | integration | yes | not-started | compliance |
| E-10 | Health, readiness, logs, backups, rollback, and restore are documented | staging | yes | partial | platform |

## Milestone F — engagement and markets

| ID | Acceptance condition | Environment | Required | Current classification | Evidence owner |
|---|---|---|---|---|---|
| F-01 | Loyalty balance is derived from append-only ledger entries | integration | yes | not-started | loyalty |
| F-02 | Reward redemption is idempotent and auditable | integration | yes | not-started | loyalty |
| F-03 | Market creation requires moderation and scoped authorization | testnet | yes | partial | markets |
| F-04 | Market contract preserves escrow and payout invariants | contract tests | yes | partial | markets |
| F-05 | Resolution follows close time, review delay, and governance policy | testnet | yes | partial | markets |
| F-06 | Market projections reconcile from contract events | testnet | yes | not-started | Stellar |
| F-07 | Eligibility, age, jurisdiction, and exposure controls are defined | policy | yes | blocked | compliance |

## Evidence format

Each verified row should link to one or more of:

- automated test name and CI run;
- exact command and successful output;
- Testnet transaction hash and contract ID;
- migration version and row-count verification;
- load-test report;
- incident/retry demonstration;
- documented manual acceptance procedure.

Do not mark a row `pass` solely because a page renders or a mocked request returns success.
