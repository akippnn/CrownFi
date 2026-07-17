# Contributing to CrownFi

CrownFi is a production-shaped, multi-pageant Stellar Testnet project under active consolidation. Git history and pull requests are the collaboration medium. Do not exchange replacement ZIP trees or create unrelated repository roots.

## Source-of-truth rule

Before changing code or documentation:

1. identify the exact target branch and SHA;
2. distinguish behavior merged on `main` from behavior present only in an open PR;
3. read [`docs/status/CURRENT_IMPLEMENTATION_STATUS.md`](docs/status/CURRENT_IMPLEMENTATION_STATUS.md);
4. check the relevant issue, PR checklist, and acceptance matrix;
5. declare shared files, migrations, contracts, deployment manifests, and documentation affected.

Documentation must not promote branch-only implementation into default-branch claims.

## Branch model

- `main` must remain deployable.
- New independent work normally branches from current `main`.
- Work that extends an existing milestone PR must branch from that PR head only when the dependency is explicit and the final merge order is documented.
- Use one vertical capability or one coherent documentation correction per branch.
- Keep branches short-lived.
- Do not develop directly on `main`.
- Do not force-push shared branches.
- Do not merge unrelated histories.
- Do not reintegrate source trees through ZIP archives.

Examples:

```text
docs/current-state-YYYY-MM-DD
fix/<specific-runtime-defect>
feat/<milestone>-<capability>
```

Historical integration branches may remain for audit, but they are not automatically the current collaboration base.

## Shared-file collision policy

Coordinate and minimize changes to:

- root workspace manifests and lockfiles;
- SQLx migration ordering;
- `services/api/src/main.rs` and central router registration;
- global navigation and application shell;
- `.env.example` files and runtime contracts;
- deployment manifests and Arcturus release configuration;
- CI workflows;
- README, current-state, architecture, and acceptance documents.

Prefer adding a domain module over expanding central files. Migration and documentation authority should be explicit in the PR.

## Pull-request contract

Every PR must state:

```text
Purpose:
Base branch/SHA:
Depends on:
Database migration:
Contracts affected:
Shared files touched:
Runtime/config changes:
Local/mock behavior:
Testnet behavior:
Automated tests:
Human acceptance still required:
Rollback or repair procedure:
Documentation updated:
```

A PR should not combine a database redesign, contract rewrite, unrelated UI restyling, and deployment changes unless they are inseparable and reviewed as one integration slice.

## Documentation requirements

A behavior-changing PR updates documentation in the same branch.

At minimum:

- update the dated status document when the PR changes default-branch capability after merge;
- update architecture when authority, persistence, transport, or service boundaries change;
- update API docs when routes, headers, state transitions, or errors change;
- update setup/deployment docs when commands or required variables change;
- update feature and acceptance docs without overstating unverified behavior;
- preserve historical evidence instead of rewriting it as current evidence.

Use exact language:

- **merged on `main`**;
- **in review in PR #…**;
- **mock/demo only**;
- **planned**;
- **not independently verified**.

Avoid vague completion statements such as “done” or “production-ready” without the supporting gate and evidence.

## Runtime rules

- Seed data is allowed only through explicit, repeatable seed commands.
- Mock adapters are allowed in local development and automated tests.
- Testnet and staging must never silently fall back to mock behavior.
- Process-local state must not represent production votes, orders, payment events, transaction intents, ownership, or settlement.
- Do not store unrestricted Stellar signing secrets in the browser/public web runtime.
- Do not use floating-point values for money.
- A built, signed, or submitted transaction is not successful until ledger evidence is accepted and reconciled.

## Definition of done

A change is complete only when the applicable conditions are satisfied:

- implementation behavior is covered by tests;
- migrations work from an empty database and through the required upgrade path;
- existing acceptance flows still pass;
- failure, retry, and recovery behavior are documented;
- mock, Testnet, and deployment boundaries are explicit;
- relevant documentation matches the exact branch behavior;
- required browser, device, role, concurrency, restart, Testnet, and deployment evidence is attached;
- the branch can be integrated without discarding another developer's work.

Checked implementation tasks do not waive independent acceptance gates.
