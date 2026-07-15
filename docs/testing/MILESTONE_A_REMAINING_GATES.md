# Milestone A remaining acceptance gates

Automated platform and security checks pass on the Milestone A candidate. The remaining gates require human or independently recovered Testnet evidence and must not be marked complete by automation alone.

## Gate 1 — Independent clean-clone and browser test

Owner: a teammate who did not prepare the environment.

Use:

- [`MILESTONE_A_HUMAN_TEST_FORM.md`](MILESTONE_A_HUMAN_TEST_FORM.md)
- [`../setup/clean-clone.md`](../setup/clean-clone.md)
- [`../setup/local-mvp-testing.md`](../setup/local-mvp-testing.md)

Required result:

- no private instructions or copied environment files;
- smoke script passes;
- browser walkthrough is recorded;
- mock mode is unmistakable;
- all undocumented help and errors are listed.

## Gate 2 — Testnet deployment verification

Owner: one primary verifier and one independent second verifier.

Use:

- [`../blockchain/testnet-contract-registry.md`](../blockchain/testnet-contract-registry.md)
- [`../../contracts/DEPLOY_GUIDE.md`](../../contracts/DEPLOY_GUIDE.md)

Required for each active contract:

- deployment transaction;
- exact source commit;
- built WASM SHA-256;
- Testnet contract ID;
- successful non-destructive read call;
- second-person verification;
- registry status changed to `verified-testnet`.

Redeploy from a reviewed commit when the historical evidence cannot be recovered reliably.

## Gate 3 — PR acceptance decision

After Gates 1 and 2:

1. attach evidence to PR #5;
2. update the Milestone A human verdict;
3. review unresolved PR comments and CI;
4. decide whether PR #5 is ready for review;
5. do not merge solely because automated CI is green.

## Current branch checkpoint

At the time this checklist was created:

- canonical reconstruction branch: `integration/finale-platform-rebuild`;
- promoted integration branch: `integration/platform-v1`;
- Milestone B branch: `foundation/database-v1`;
- preserved pre-platform main ref: `archive/pre-platform-v1-main-2026-07-14`.

The promoted branches must be fast-forwarded again when the final accepted Milestone A commit changes.
