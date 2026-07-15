# Milestone A acceptance execution — 2026-07-15

Candidate branch: `integration/platform-v1`

Candidate SHA at test start: `f26a85f6098583ab92739143bef15a0cd61ad74d`

## Purpose

This record coordinates Milestone A verification against the current integrated CrownFi platform. Automated checks, local human testing, Testnet contract verification, and deployment evidence are separate verdicts. A pass in one category does not imply the others passed.

## Current automated evidence

Previously observed passing evidence includes:

- SQLx fresh and repeated migrations;
- platform persistence;
- catalogue, orders, Stellar intent, chain reconciliation, and payout smokes;
- R2-compatible media smoke;
- Rust API and Soroban contract tests on tested revisions;
- web type-check and Merkle tests on the earlier Milestone A candidate;
- secret scan and CodeQL best-effort scan.

The exact candidate SHA above still requires a consolidated run. Historical slice or PR results are regression evidence, not an exact-head verdict.

## Execution order

1. Run the exact-head automated suite.
2. Perform independent clean-clone tests on two separate machines.
3. Perform browser and DevTools acceptance on the same SHA.
4. Verify or redeploy each required Stellar Testnet contract.
5. Record deployment, migration, health, routing, and rollback evidence for the same revision.
6. Update Issues #10–#14 and Milestone A Issue #3 with pass, fail, blocked, or not-tested results.
7. Update the promotion PR only after the selected revision and evidence agree.

## Human testers

| Tester | Environment | Result | Evidence |
|---|---|---|---|
| JD | TBD | Not run | — |
| Independent tester | TBD | Not run | — |

## Verdict categories

- **Automated:** pending exact-head consolidated run.
- **Clean clone:** pending two independent runs.
- **Browser:** pending administrator, organizer, ordinary-user, and public-route review.
- **Testnet contracts:** pending independent registry verification.
- **Deployment:** partially operational; exact-SHA route and rollback acceptance pending.
- **Milestone A final:** not accepted.
