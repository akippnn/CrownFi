# Stellar and Soroban integration

CrownFi uses Stellar/Soroban as the value, ownership, and public proof layer. It should not depend on one blockchain transaction per raw vote.

## What goes on-chain

Good on-chain candidates:

- ticket purchase/payment references;
- digital ticket/fan pass ownership;
- collectible ownership/mint references;
- tally snapshot hashes;
- Merkle roots;
- audit checkpoint metadata;
- reward or support payment records.

Data that should not go on-chain:

- raw personal voter data;
- private contact details;
- raw vote-by-voter lists;
- secrets, seed phrases, API keys, or admin session data.

## Contracts

Current Soroban workspace:

- `contracts/audit-anchor/` — vote/tally checkpoint anchor.
- `contracts/ticket/` — ticket NFT/fan pass contract.
- `contracts/collectible/` — contestant memorabilia contract.
- `contracts/sale-splitter/` — listing and payout split logic.
- `contracts/usdc-test/` — demo token for test flows.

## Modes

`STELLAR_MODE=mock` is the default local demo path. It keeps the app easy to run without deployed contracts.

`STELLAR_MODE=live` should only be used after contract IDs, RPC URL, passphrase, and funded testnet wallets are configured.

## Correct explanation

Use this explanation in demos:

> CrownFi uses a scalable backend for high-volume vote intake. Stellar is used for tamper-evident public audit commitments, payments, ownership, and rewards. It is not the raw vote processing layer.
