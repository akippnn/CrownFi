# Milestone A human verification form

Use this form for the remaining human acceptance run. The tester should not be the person who prepared the environment or wrote the setup instructions.

## Test identity

- Tester:
- Date/time:
- Operating system:
- Docker version:
- Docker Compose version:
- Browser/version:
- Branch:
- Commit SHA:
- Runtime profile expected: `local` / `mock`

## Fresh-environment confirmation

- [ ] The target directory or VM had never contained CrownFi.
- [ ] No existing CrownFi `.env` file was copied in.
- [ ] No private team credential was supplied.
- [ ] The tester received only `README.md` and `docs/setup/clean-clone.md` before the attempt ended.

## Clean-clone steps

- [ ] Clone the repository.
- [ ] Switch to the candidate commit/branch.
- [ ] Run `bash scripts/acceptance/clean-clone-smoke.sh`.
- [ ] Confirm the script exits successfully.
- [ ] Confirm evidence exists under `.artifacts/acceptance/clean-clone/`.

## Service results

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| PostgreSQL | Accepting connections |  |  |
| Redis | `PONG` |  |  |
| Rust API `/health` | `ok=true`, `mode=local`, `stellar_mode=mock` |  |  |
| Rust API `/ready` | `ok=true` with current in-memory limitation visible |  |  |
| Next.js `/api/health` | `ok=true` |  |  |
| Transitional `db-init` | Exit code 0 |  |  |
| Web app | Opens at `http://127.0.0.1:3000` |  |  |

## Browser walkthrough

Open browser DevTools before navigating.

- [ ] Home page renders.
- [ ] Primary navigation links open.
- [ ] Vote page renders.
- [ ] Verify page renders.
- [ ] Tickets page renders.
- [ ] Collectibles/contestants page renders.
- [ ] User/me page renders.
- [ ] Admin entry point renders or denies access clearly.
- [ ] Mock/local mode is visible and cannot be mistaken for a real Testnet receipt.
- [ ] No fatal uncaught console error occurs.
- [ ] No critical request repeatedly fails.
- [ ] No page requires an undocumented hardcoded URL or private credential.

Record browser findings:

```text
Console errors:

Failed network requests:

Broken navigation or assets:

Unexpected mock/Testnet wording:
```

## Prototype behavior check

Follow `docs/setup/local-mvp-testing.md`.

- [ ] Seeded event list returns.
- [ ] First mock vote succeeds.
- [ ] Duplicate mock vote returns HTTP 409.
- [ ] Tally reflects the accepted vote.
- [ ] Snapshot creation succeeds.
- [ ] Mock anchor succeeds and is visibly simulated.
- [ ] Restarting the API demonstrates that process-local votes/snapshots are lost.
- [ ] The tester understands that restart loss is a known failure to be fixed in Milestone B, not a passing durability result.

## Undocumented assistance

List every action that was required but was not present in the supplied documentation:

```text

```

Any source edit, copied environment value, private message, or verbal setup instruction counts as undocumented assistance.

## Testnet registry review

This can be completed separately from the local smoke test.

For each recorded contract ID:

- [ ] Open the contract on Stellar Testnet.
- [ ] Recover or create the deployment transaction.
- [ ] Record the exact source commit.
- [ ] Record the built WASM SHA-256.
- [ ] Perform a non-destructive read call.
- [ ] Confirm the contract matches the intended CrownFi contract.
- [ ] Have a second person repeat the Explorer/read verification.
- [ ] Update `docs/blockchain/testnet-contract-registry.md`.

Contracts:

- [ ] Audit anchor.
- [ ] Ticket.
- [ ] Collectible.
- [ ] Sale splitter.
- [ ] Test USDC.

## Evidence attached

- [ ] Smoke script output.
- [ ] `compose-ps.txt`.
- [ ] API health JSON.
- [ ] API readiness JSON.
- [ ] Web health JSON.
- [ ] PostgreSQL result.
- [ ] Redis result.
- [ ] Browser screenshots.
- [ ] Console/network screenshots or export.
- [ ] Stellar Explorer links.
- [ ] Contract read-call output.

## Final verdict

Choose one:

- [ ] **PASS** — clean clone and browser walkthrough required no undocumented assistance; all Testnet registry evidence is independently verified.
- [ ] **LOCAL BASELINE PASS / TESTNET BLOCKED** — clean clone passed, but contract verification is incomplete.
- [ ] **FAIL** — one or more required local checks failed.
- [ ] **BLOCKED** — the test could not proceed for an external reason; describe it below.

Reason and follow-up issues:

```text

```

The tester's result should be attached or linked from PR #5. PR #5 remains draft until the accepted verdict and evidence are recorded.
