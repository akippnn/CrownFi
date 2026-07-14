# CrownFi account, first-admin, organizer, and user browser acceptance

This checklist applies to draft PR #73 on `slice/identity-admin-bootstrap-v1`.

A successful page load, login, or Freighter connection proves only that individual action. Record each section separately as **pass**, **fail**, **blocked**, or **not testable**.

## Safety boundary

- Use Stellar Testnet wallets only.
- Never enter a seed phrase, private key, production password, or Mainnet funds.
- CrownFi should request public addresses and signed messages only.
- Optional R2 values are stored as protected configuration metadata in this slice, but provider validation and runtime activation are not yet acceptance-ready. Use disposable non-production values or leave the section blank.

## 1. Start from a truly clean environment

From any repository path:

```bash
cd /path/to/your/fresh/clone
git fetch origin
git switch slice/identity-admin-bootstrap-v1
git rev-parse HEAD
git status --short
docker compose version
bash scripts/acceptance/clean-clone-smoke.sh
```

Expected:

- the script passes;
- web is reachable at `http://127.0.0.1:3000`;
- Rust API is reachable at `http://127.0.0.1:8080`;
- `git status --short` was empty before testing.

For a clean first-admin test, the PostgreSQL volume must not contain an earlier setup. Stop and reset only the disposable test stack:

```bash
docker compose \
  --env-file infra/.env.smoke \
  -f infra/docker-compose.yml \
  down --volumes --remove-orphans

bash scripts/acceptance/clean-clone-smoke.sh
```

Do not run `down --volumes` against a development or production database you intend to preserve.

## 2. First site administrator

Use a normal browser profile with Freighter configured for **Testnet**.

1. Open `http://127.0.0.1:3000/setup`.
2. Confirm the page explains that CrownFi never needs a seed phrase or private key.
3. Click **Connect and authorize Freighter**.
4. Reject the first signing request.
5. Confirm CrownFi reports cancellation without creating an administrator.
6. Retry and approve the signed-message request.
7. Confirm the page reports the verified public wallet address.
8. Enter:
   - display name: any test administrator name;
   - site name: `CrownFi Local Acceptance`;
   - organization name: `CrownFi Test Organization`;
   - organization slug: `crownfi-test-organization`;
   - local bootstrap token: `local-first-admin-setup-token`.
9. Leave R2 blank for the first pass.
10. Confirm **Testnet** is selected and **Mainnet** is visible but disabled.
11. Submit the setup form.
12. Confirm the browser redirects to `/manage`.
13. Reload `/setup` and confirm first-run setup cannot be repeated.
14. Open `/account` and confirm:
   - one persistent CrownFi account exists;
   - the wallet is listed as verified and primary;
   - site role is owner or administrator.
15. Open DevTools and inspect Application/Storage, Network, Console, and page source:
   - the session cookie is httpOnly;
   - no seed phrase or private key is requested;
   - no raw integration value is returned;
   - there are no unexplained 401, 403, 404, or 500 responses.

Expected result: first-admin setup is complete without SQL, curl, database edits, or a public-wallet environment allowlist.

## 3. Administrator and Miss Stellarverse reference pageant

While signed in as the first administrator:

1. Open `/manage`.
2. Confirm the tabs include **Organizer studio**, **People and roles**, and **Site settings**.
3. Click **Seed Miss Stellarverse**.
4. Confirm Miss Stellarverse appears in the pageant list.
5. Click **Seed Miss Stellarverse** a second time.
6. Confirm there is still exactly one Miss Stellarverse pageant and no duplicated contestant list.
7. Open the public pageant from Explore.
8. Confirm the reference contestants render from PostgreSQL-backed platform data.
9. Confirm fixture wording does not claim that contracts were deployed, collectibles were minted, tickets were paid, or markets were settled.

Expected result: the seed reconciles the same durable reference records and remains truthful about unimplemented on-chain work.

## 4. Hosted pageant and selector

As site administrator:

1. Open **Manage → Site settings**.
2. Select Miss Stellarverse as the default hosted pageant.
3. Save with the public selector disabled.
4. Reload the site and confirm the compact header uses Miss Stellarverse as the pageant context.
5. Return to Site settings, enable the public pageant selector, and save.
6. Create or publish a second eligible pageant when lifecycle controls are available.
7. Confirm the selector lists only eligible published pageants.
8. Switch pageants, hard refresh, and use Back/Forward.
9. Confirm the URL remains pageant-specific and does not silently change deep-link context.

Current limitation: a newly created pageant remains a draft in this slice, so the two-published-pageant selector case may be **not testable** until publication lifecycle controls land.

## 5. Separate organizer account

Use a second browser profile and a different Testnet Freighter wallet.

### Create the ordinary account

1. Open `/account`.
2. Sign in with the second wallet and approve the signed message.
3. Confirm the account page shows **Public user** and no organization role.
4. Copy the public wallet address.
5. Sign out of CrownFi. Do not expose or export the wallet secret.

### Grant organizer access

Return to the administrator profile:

1. Open **Manage → People and roles**.
2. Enter the second account’s public address.
3. Choose **Organizer**.
4. Grant access.
5. Confirm the member list shows the account as organizer.

### Test the organizer boundary

Return to the second profile:

1. Sign in again with the same wallet.
2. Confirm **Manage** now appears.
3. Open Organizer studio.
4. Create a blank pageant draft.
5. Add one category.
6. Add two contestants.
7. Reload the page and confirm the records persist.
8. Confirm the organizer does not receive the **Site settings** tab.
9. Attempt to open the site-settings API through the browser interface and confirm no administrator mutation is available.

Expected result: the organizer can maintain organization-owned pageant records but cannot change site-wide configuration.

## 6. Ordinary public user

Use a third browser profile/wallet, or another account that has not received a membership.

1. Open `/platform` while signed out and browse published pageants.
2. Open `/account` and sign in with Freighter.
3. Confirm the account is created as a public user.
4. Confirm **Manage** is absent from desktop, drawer, mobile navigation, and account menu.
5. Directly open `/manage`.
6. Confirm CrownFi explains that the account has no organizer membership instead of exposing tools.
7. Navigate the active pageant context:
   - Overview;
   - Contestants;
   - Vote;
   - Tickets;
   - Predict;
   - Results.
8. Record each destination as working, truthful preview, blocked, or not testable.
9. Verify Predict and Results describe incomplete Testnet work rather than presenting fake success.

Expected result: a user may authenticate and browse without gaining organizer or site-administrator capabilities.

## 7. Link multiple wallets to one account

Use an account that already has one verified wallet.

1. Open `/account`.
2. Click **Link another wallet**.
3. Switch Freighter to a different Testnet account before approving access.
4. Approve the signed-message request.
5. Confirm both public addresses appear under the same CrownFi account ID.
6. Sign out.
7. Sign in using the newly linked wallet.
8. Confirm the same CrownFi account, roles, and linked-wallet list return.
9. Attempt to link a wallet already owned by another CrownFi account.
10. Confirm CrownFi rejects it with a conflict and does not merge accounts silently.

Expected result: accounts are persistent identities; wallets are verified credentials linked to exactly one account per network.

## 8. Testnet/Mainnet boundary

As site administrator:

1. Open Site settings.
2. Confirm Testnet is enabled.
3. Confirm Mainnet is grayed out and cannot be selected.
4. Switch Freighter to Mainnet and attempt a CrownFi login while the site is configured for Testnet.
5. Confirm CrownFi rejects the network mismatch before accepting the account proof.
6. Switch Freighter back to Testnet and confirm login succeeds.

Expected result: Mainnet is visible as a future deployment option but fails closed in the current build.

## 9. Evidence to save

For each role, record:

- tester name and date;
- OS and browser;
- branch and exact commit SHA;
- Freighter network and public addresses, with secrets redacted;
- exact browser actions;
- expected and actual result;
- pass/fail/blocked/not-testable verdict;
- screenshots;
- Console and Network findings;
- relevant terminal logs and Compose state.

A recommended evidence layout is:

```text
.artifacts/acceptance/identity-role-flows/
  environment.txt
  first-admin/
  organizer/
  public-user/
  linked-wallets/
  hosted-pageant/
  testnet-boundary/
```

## 10. Stop the disposable stack

```bash
docker compose \
  --env-file infra/.env.smoke \
  -f infra/docker-compose.yml \
  down --remove-orphans
```

Add `--volumes` only when intentionally discarding the test database.
