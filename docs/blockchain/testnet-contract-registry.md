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

The IDs below were copied from `contracts/DEPLOY_GUIDE.md`, which labels them as deployments from **2026-07-05** using the `alice` identity. Their deployment transactions, source commit, and WASM hashes were not recorded there, so they remain `recorded-unverified` and must not yet be treated as the approved staging registry.

| Contract type | Environment variable | Network | Contract ID | WASM SHA-256 | Version/commit | Deployment transaction | Status | Verified by/date |
|---|---|---|---|---|---|---|---|---|
| Audit anchor | `AUDIT_ANCHOR_CONTRACT_ID` | Testnet | `CAC7AX3PFJ5NC43BB5TRWY4QTKLSPBVK3DT5GTLH5N6Y3TIYK5GLOVNV` | Not recorded | Not recorded | Not recorded | `recorded-unverified` | Source record: deploy guide, 2026-07-05 |
| Ticket | `TICKET_CONTRACT_ID` | Testnet | `CA7M6UH55Z4UBQKBZNZBFFU3PWI3XI3BH46LMHSUINWJHTRG7CYDLH6N` | Not recorded | Not recorded | Not recorded | `recorded-unverified` | Source record: deploy guide, 2026-07-05 |
| Collectible | `COLLECTIBLE_CONTRACT_ID` | Testnet | `CAZOOO3AUNGKDE6XTQNHETSBJGU33I2OCNREZ63GTUTDRPYBUS2R4LZX` | Not recorded | Not recorded | Not recorded | `recorded-unverified` | Source record: deploy guide, 2026-07-05 |
| Sale splitter | `SALE_SPLITTER_CONTRACT_ID` | Testnet | `CATCOIVWAVVXBNLPOXBVN3WQ26UNAVLUVSRYBNQWIII75I5QK4YV2KU3` | Not recorded | Not recorded | Not recorded | `recorded-unverified` | Source record: deploy guide, 2026-07-05 |
| Test USDC | `USDC_TEST_CONTRACT_ID` | Testnet | `CAE2GXXU4BPLRX5DHLFJKUR7AP5ETPIERGTFNCY7PEFCEL5H3G3RG6LW` | Not recorded | Not recorded | Not recorded | `recorded-unverified` | Source record: deploy guide, 2026-07-05 |
| Prediction market v2 | `PREDICTION_MARKET_CONTRACT_ID` or market-specific registry row | Testnet | Not deployed/recorded | Not recorded | Reconstruction branch | Not recorded | `unrecorded` | — |

Related public payout addresses recorded in the deploy guide:

| Role | Address | Status |
|---|---|---|
| Demo contestant payout | `GCK4VGS6VXHJCUZV3U4ACMKS77NYRWXITTFE6PW5P2DRJV6B7GN34S2J` | Recorded, not independently verified |
| Event treasury | `GC3PXGAWQWHHV6M6AKR3LSZZ7RNYZXASGNJM7BSU3EMWI5KG2R5QSIY3` | Recorded, not independently verified |

These addresses are public identifiers, not secret keys. They remain demo configuration until the organization/pageant payout model replaces environment-wide assumptions.

## Missing evidence

For every recorded deployment, the following still needs to be recovered or regenerated:

- deployment transaction hash;
- exact Git source commit;
- built WASM SHA-256;
- current contract-instance/liveness check;
- non-destructive read invocation result;
- independent second-person verification;
- decision whether the deployment is still active or should be superseded.

If that evidence cannot be recovered reliably, redeploy from a reviewed commit and register the new deployment rather than guessing.

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

List locally recorded Stellar CLI aliases when the original deployment machine is available:

```bash
stellar contract alias ls
```

## Environment activation rule

`STELLAR_MODE=live` must fail closed when a required deployment is blank, unverified, superseded, or revoked. Local startup must remain `STELLAR_MODE=mock` unless a Testnet procedure is explicitly being performed.

Contract IDs may temporarily remain in environment variables for compatibility, but the long-term source of truth is the database-backed contract registry introduced in the commerce/Stellar platform milestones.

## Deployment history

When a contract is replaced, move the previous row here rather than deleting it.

| Contract type | Network | Contract ID | WASM SHA-256 | Version/commit | Deployment transaction | Final status | Notes |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | No verified historical deployments recorded yet. |
