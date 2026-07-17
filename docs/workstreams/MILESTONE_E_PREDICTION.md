# Milestone E — Gated Testnet Prediction Markets and Settlement

Status: active implementation workstream  
Branch: `feat/milestone-e-prediction-v1`  
Trackers: #9, #23, #24, #25  
Shared acceptance: #11

## Objective

Complete the already-merged Prediction Market foundation as one controlled Testnet vertical slice with real chain-authoritative positions, exact exposure and escrow, governed resolution or cancellation, exactly-once settlement or refunds, and truthful public and management interfaces.

The durable lifecycle, policy-decision, governance, audit, and stake-intent foundation is already present in `main`. This branch begins at the remaining `E1`–`E5` acceptance boundary rather than recreating that foundation.

## Branch boundary

This branch owns Milestone E domain work only:

- provider-referenced action policy and KYC decision references;
- dispute, quorum, pause, cancellation, resolution, and emergency governance;
- Freighter-signed Testnet stake transactions;
- chain-authoritative positions, exposure, and escrow accounting;
- deterministic resolution payouts and cancellation refunds;
- public, organizer, reviewer, site-administrator, and evidence UX.

It consumes the shared Manage shell, UI kit, ACL, SQLx runtime, transaction-intent service, registry, indexing, reconciliation, payout primitives, and deployment evidence. It must not absorb Voting, Ticketing, Collectibles, or general Milestone B work.

## Implementation checkpoint

Implemented on this branch:

- append-only position evidence tied one-to-one to stored stake intents;
- exact source wallet, amount, market, outcome, transaction hash, ledger, and event validation before position activation;
- chain-authoritative active positions and outcome exposure updates;
- public outcome-position summaries derived only from active positions;
- durable payout/refund settlement runs and per-position settlement items;
- deterministic proportional winner allocation with explicit integer remainder distribution;
- cancellation refunds at principal value;
- fee, distributable, and planned-total conservation constraints;
- organization-manager authority and governance/audit evidence for settlement planning;
- separate planned, submitted, and confirmed settlement-item states;
- restricted worker submission recording that does not claim payout or refund confirmation;
- fail-closed latest `settle` or `refund` policy-decision enforcement before submission and evidence acceptance;
- exact recipient, amount, transaction hash, ledger, operation index, and event-reference matching for accepted payout/refund evidence;
- one accepted evidence row per settlement item with idempotent replay and conflicting-evidence rejection;
- automatic run, market, and position finalization only after every planned item has accepted chain evidence;
- aggregate public settlement status derived from durable run and item state;
- dedicated Rust routes registered in the canonical API runtime.

Still open:

- server-built exact stake XDR and browser Freighter signing acceptance;
- real Testnet stake submission/indexing against the Prediction Market contract;
- real restricted payout/refund signing and submission against the configured escrow boundary;
- proof that accepted settlement evidence is produced by the intended contract/account rather than a test worker payload;
- completion of provider policy, dispute, quorum, pause, and emergency governance acceptance;
- public/organizer/reviewer/site-administrator browser surfaces and exact deployed-SHA evidence.

## Implementation order

1. `E3` / #24 — build exact stored stake transactions, validate signed envelopes, submit to Testnet, index accepted evidence, create owner-bound positions, and reconstruct exposure and escrow under replay, close, and concurrency controls.
2. `E4` / #25 — derive resolution or cancellation from governed evidence, conserve escrow exactly, and execute retry-safe exactly-once payouts or refunds through a restricted signing boundary.
3. `E5` / #25 — complete discovery, risk and Testnet disclosure, stake review, positions, pending/rejected/active/settled/refunded states, source evidence, Explorer links, and separate organizer/site-administrator management modules.
4. `E1`–`E2` / #23 — close provider-event, privacy/legal, dispute-window, reviewer/quorum, pause, cancellation, and emergency-control acceptance alongside the real transaction flow.

## Truth and security boundaries

- Eligibility is action-specific and fail-closed; CrownFi stores provider references and decisions, not identity documents.
- A built or signed envelope, callback, or submitted transaction hash creates no active position.
- Positions exist only from accepted indexed chain evidence matching the stored intent.
- A settlement plan or recorded submission is not a payout or refund; confirmation requires exact accepted evidence for every item.
- The market becomes settled only after every settlement item has accepted evidence and conservation still holds.
- Exposure, escrow, payouts, and refunds use exact integer asset units and are reconstructed from accepted positions.
- Resolution, cancellation, payout, and refund authority use distinct server-side boundaries and durable governance evidence.
- Mainnet remains disabled.

## Initial acceptance target

An approved two-outcome Testnet market accepts tiny stakes from two eligible wallets. Each position becomes active only after exact indexed evidence. One governed market resolution pays exactly once and one cancellation refunds exactly once through restart and retry. Escrow conservation, owner-bound positions, policy decisions, source evidence, transaction links, and final UI states reconcile on the exact deployed revision.
