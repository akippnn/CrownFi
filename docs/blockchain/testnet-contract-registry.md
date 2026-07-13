# Stellar Testnet contract deployment registry

This registry is the canonical Milestone A record for CrownFi contract deployments. A contract is not considered verified merely because an environment variable contains a `C...` value.

Do not place secret keys, recovery phrases, or database credentials in this file.

## Verification states

- `unrecorded`: no deployment information has been supplied.
- `recorded-unverified`: an ID or transaction was supplied but not independently checked.
- `verified-testnet`: the contract and deployment transaction were independently opened on Stellar Testnet and matched to the expected contract/WASM.
- `superseded`: retained for history but not used by the active environment.
- `revoked`: must not be used.

## Active deployment table

| Contract type | Environment variable | Network | Contract ID | WASM SHA-256 | Version/commit | Deployment transaction | Status | Verified by/date |
|---|---|---|---|---|---|---|---|---|
| Audit anchor | `AUDIT_ANCHOR_CONTRACT_ID` | Testnet | Not recorded | Not recorded | Not recorded | Not recorded | `unrecorded` | — |
| Ticket | `TICKET_CONTRACT_ID` | Testnet | Not recorded | Not recorded | Not recorded | Not recorded | `unrecorded` | — |
| Collectible | `COLLECTIBLE_CONTRACT_ID` | Testnet | Not recorded | Not recorded | Not recorded | Not recorded | `unrecorded` | — |
| Sale splitter | `SALE_SPLITTER_CONTRACT_ID` | Testnet | Not recorded | Not recorded | Not recorded | Not recorded | `unrecorded` | — |
| Test USDC | `USDC_TEST_CONTRACT_ID` | Testnet | Not recorded | Not recorded | Not recorded | Not recorded | `unrecorded` | — |
| Prediction market v2 | `PREDICTION_MARKET_CONTRACT_ID` or market-specific registry row | Testnet | Not deployed/recorded | Not recorded | Reconstruction branch | Not recorded | `unrecorded` | — |

The blank table is intentional. It is safer than treating stale or privately shared contract IDs as active deployments.

## Required verification procedure

For each contract:

1. Build the intended source revision.
2. Record the exact Git commit.
3. Compute and record the WASM SHA-256 hash.
4. Record the Testnet deployment transaction hash.
5. Open the transaction in Stellar Expert or Stellar Laboratory.
6. Confirm the network is Testnet.
7. Confirm the created contract ID matches the configured value.
8. Confirm the deployed WASM/hash corresponds to the intended source revision.
9. Invoke a non-destructive read method where the contract supports one.
10. Have a second team member independently repeat the Explorer check.
11. Set the status to `verified-testnet` and record verifier/date.

## Suggested commands

Build from the repository contract workspace:

```bash
cd contracts
stellar contract build
```

Hash a built WASM file:

```bash
sha256sum target/wasm32v1-none/release/<contract>.wasm
```

Open a deployment transaction:

```text
https://stellar.expert/explorer/testnet/tx/<transaction-hash>
```

Inspect a contract:

```text
https://stellar.expert/explorer/testnet/contract/<contract-id>
```

## Environment activation rule

`STELLAR_MODE=live` must fail closed when a required deployment is blank, unverified, superseded, or revoked. Local startup must remain `STELLAR_MODE=mock` unless a Testnet procedure is explicitly being performed.

Contract IDs may temporarily remain in environment variables for compatibility, but the long-term source of truth is the database-backed contract registry introduced in the commerce/Stellar platform milestones.

## Deployment history

When a contract is replaced, move the previous row here rather than deleting it.

| Contract type | Network | Contract ID | WASM SHA-256 | Version/commit | Deployment transaction | Final status | Notes |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | No verified historical deployments recorded yet. |
