# CrownFi Capability and Hardcoding Inventory

This document is the Milestone A inventory. It records what exists, what is authoritative, and what must be replaced before CrownFi can be treated as a multi-pageant platform.

## Classification

- `working`: verified behavior exists in the current runtime.
- `partial`: implementation exists but does not meet the platform acceptance condition.
- `mock-only`: implementation depends on mock or process-local behavior.
- `testnet-capable`: live/Testnet path exists but still requires current deployment verification.
- `hardcoded`: one pageant, contestant, wallet, asset, contract, or environment is embedded in code/config.
- `duplicated`: competing implementations exist.
- `obsolete`: retained only for migration or historical reference.

## Runtime and architecture

| Capability | Current location | Classification | Platform action |
|---|---|---|---|
| Next.js web application | `web/` | working/partial | Keep as UI and wallet-signing surface |
| Next.js business API routes | `web/src/app/api/` | working/duplicated | Migrate domain logic to Rust one slice at a time |
| Rust/Axum API | `services/api/` | partial | Make canonical business API after durable repositories exist |
| PostgreSQL | Prisma under `web/` and platform manifests | partial | Establish one migration owner and Rust repositories |
| Redis | Compose/platform configuration | partial | Use for distributed rate limits, coordination, and jobs |
| Arcturus deployment | `.arcturus/`, manifests, scripts | partial | Preserve and validate as hosted deployment path |
| Local Compose | `compose.yaml`, `infra/docker-compose.yml` | partial/duplicated | Keep one documented local compatibility path |

## Pageant platform

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Organizations | No canonical domain model | not-started | Add organization and membership tenancy |
| Organizer applications | Prisma `OrganizerRequest` | partial | Add approval, membership, roles, and scoped access |
| Pageants/events | Seeded Rust `Event`; legacy round/event assumptions | hardcoded/duplicated | Add persistent pageant repository |
| Categories | Seeded Rust category and legacy voting rounds | hardcoded/partial | Add organizer-managed categories |
| Contestants | Prisma records plus seeded Rust contestants | duplicated/hardcoded | Normalize under pageant/category |
| Contestant media | Portrait URL fields and assets | partial | Add managed media records and storage boundary |
| Organizer dashboard | Existing admin/organizer UI | partial | Rebind to scoped Rust APIs |
| Multi-pageant routing | Not canonical | not-started | Add tenant/pageant-aware URLs and API resources |

## Voting and audit

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Vote intake | Next.js/Prisma and Rust skeleton | duplicated/partial | Make Rust API canonical |
| Duplicate-vote prevention | Prisma unique constraint; Rust in-memory set | partial | Preserve database uniqueness and test concurrency |
| Tallies | Existing application flow and Rust in-memory tally | duplicated/partial | Persist immutable tally snapshots |
| Merkle receipts | Existing web tests and proof flow | working/partial | Preserve and bind to canonical snapshot model |
| Soroban audit anchor | Existing contract/helper flow | testnet-capable | Record deployments and add index/reconciliation |
| Raw vote privacy | Backend-first design | partial | Keep PII and raw votes off-chain |
| Load/burst behavior | No current acceptance evidence | not-started | Add target and load tests |

## Ticketing

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Ticket catalog | Existing UI/schema/contracts | partial/hardcoded | Add pageant-scoped products and inventory |
| Inventory reservation | No durable reservation model | not-started | Add transactional reservation/expiry |
| Orders | Legacy ticket and purchase records | partial | Add order/payment/fulfillment state machines |
| Ticket contract | Soroban contract exists | testnet-capable | Verify deployment and ownership events |
| Wallet payment | Stellar helpers and Freighter flow | testnet-capable | Use persistent transaction intents |
| Mint fulfillment | Existing demo path | partial | Add durable retry and chain confirmation |
| Check-in | Voucher/check-in flow exists | partial | Add one-time replay-resistant records |
| Anti-scalping | Transfer/control claims | partial | Enforce only supported transfer rules and accurate copy |

## Collectibles and contestant support

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Collectible catalog | Prisma model and UI | partial/hardcoded | Add pageant collection and edition models |
| Collectible contract | Existing Soroban contract | testnet-capable | Evaluate before adding overlapping contract |
| Sale splitting | Existing `sale-splitter` contract | testnet-capable | Verify deterministic split and events |
| Ownership | Database purchase plus chain fields | partial | Derive authoritative ownership from indexed Stellar state |
| Metadata | URI field and assets | partial | Define immutable/versioned metadata policy |
| Contestant payout | Environment/demo wallet assumptions | hardcoded | Add validated payout destinations per contestant/pageant |

## Prediction markets

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Soroban market contract v2 | Reconstruction branch | partial/testnet-capable | Complete audit, deployment, and invariant verification |
| Rust market API | Read models/intents started | partial/in-memory | Persist projections and intents |
| Market UI | Finale prototype used as reference | not-started in canonical UI | Rebuild with UI kit after backend is durable |
| Moderation | Not complete | not-started | Require reviewed creation requests |
| Resolution governance | Contract resolver/review delay | partial | Define operational and policy governance |
| Compliance controls | Not defined | blocked | Keep disabled outside explicit Testnet demo |

## Identity, payments, and KYC

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Freighter identity/signing | Existing wallet flow | testnet-capable | Preserve behind unified session model |
| Mock sessions | Existing demo paths | mock-only | Local/tests only and visibly labeled |
| Embedded/Web2 identity | Finale prototype reference | not-started | Add adapter only after custody model is chosen |
| Fiat checkout | Finale prototype reference | rejected for direct port | Rebuild with verified webhook inbox |
| Payment webhook security | No canonical provider path | not-started | Require signatures, reconciliation, idempotency |
| KYC | Status scaffold/reference only | not-started | Store provider references/status, never raw documents |

## Fan engagement

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Fan profiles | Prisma `Fan` | partial | Move behind canonical user/session API |
| Points | Mutable integer | hardcoded/partial | Replace with append-only loyalty ledger |
| Rewards | Prototype concepts/UI | not-started | Add reward catalog and idempotent redemption |
| Leaderboards | Prototype concept/UI | not-started | Build from canonical read models |

## Security and operations

| Capability | Current state | Classification | Platform action |
|---|---|---|---|
| Secret smoke test | CI | working | Preserve |
| Dependency audits | CI | working/partial | Preserve and review advisories |
| CodeQL | Best-effort workflow | partial | Preserve |
| Admin wallet challenge | Existing implementation | working/partial | Replace global allowlist with scoped RBAC over time |
| Transaction intents | Existing semantics plus Rust in-memory market intents | partial/duplicated | Make all intents persistent and restart-safe |
| Webhook inbox/outbox | Missing | not-started | Add before provider fulfillment |
| Stellar indexer | Missing as canonical service | not-started | Add durable cursor and idempotent ingestion |
| Reconciliation console | Missing | not-started | Add visible incidents and retry actions |
| Backups/restore | Deployment notes exist | partial | Document and verify restore |
| Observability | Structured logs exist in API | partial | Add correlation IDs, metrics, and alerts |

## Immediate removals from runtime assumptions

The following must not be treated as product state:

- the seeded `coronation-night-2026` event;
- seeded PHL/JPN/THA contestants;
- the seeded Fan Choice category and market;
- process-local vote, tally, snapshot, market, and intent maps;
- floating-point USDC prices;
- a global administrator wallet list as the final authorization model;
- automatic mock fallback when Testnet configuration is incomplete;
- direct platform signing from the public web process.

They may remain temporarily as migration fixtures or explicit local seeds while their durable replacements are implemented and tested.
