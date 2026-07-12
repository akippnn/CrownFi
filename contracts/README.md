# CrownFi Soroban contracts

| Contract | Purpose | Dependencies |
|---|---|---|
| `audit-anchor` | Write-once tamper-evident checkpoint per voting round (Merkle root + tally hash). | soroban-sdk only. Builds cleanly. |
| `ticket` | NFT ticket with resale policy (anti-scalping), pause, and supply cap. | OpenZeppelin Stellar non-fungible. |
| `collectible` | Contestant portrait NFT with royalties, pause, and supply cap. | OpenZeppelin Stellar non-fungible + royalties. |
| `sale-splitter` | Primary sale: listing-based USDC split (price/payee from storage), pause. | soroban-sdk (SAC token interface). |

## Security layers in each contract

- `audit-anchor`: `admin.require_auth()` on publish; **write-once per round** (a checkpoint cannot be
  silently rewritten); publish event emitted.
- `ticket`: `#[only_owner]` mint / resale / pause; **pause switch**; **max-supply cap** (0 = unlimited);
  transfers blocked until the organizer opens resale (soulbound anti-scalping); mint event.
- `collectible`: `#[only_owner]` mint / royalty / pause; **royalty bps validated (<= 10000)**;
  pause switch; max-supply cap; mint event.
- `sale-splitter`: **listing-based pricing** so `buy()` reads price and contestant from storage, never
  from the caller (closes the self-set-price / redirect-proceeds flaw); `platform_bps <= 10000` and
  `price > 0` validation; `admin.require_auth()` on listing/pause, `buyer.require_auth()` on buy;
  pause switch; overflow-checked fee math; sale event.

Operational layers (not code inside the contract):
- Set the admin / owner (mint authority, anchor publisher, treasury) to a **multisig** account, not a
  single hot key.
- Run the OpenZeppelin Soroban security detector and a light external review before mainnet.

`audit-anchor` and `sale-splitter` include unit tests (`cargo test`), covering the overwrite guard and
the positive-price guard respectively.

## Build

```bash
rustup target add wasm32v1-none        # newer toolchains; use wasm32-unknown-unknown otherwise
cargo install --locked stellar-cli
stellar contract build
```

`audit-anchor` and `sale-splitter` build against `soroban-sdk` alone. `ticket` and `collectible`
reference the OpenZeppelin Stellar crates (`stellar-tokens`, `stellar-access`, `stellar-macros`);
pin those to the versions you generate from the OpenZeppelin Contract Wizard
(https://docs.openzeppelin.com/stellar-contracts). The CrownFi logic (mint gating, resale policy,
royalty, pause, supply cap) is marked in the comments so you can drop it onto a regenerated baseline.

## Test

```bash
cargo test
```

## Deploy (testnet)

```bash
./scripts/deploy.sh
```

Then copy the printed contract ids into `web/.env` and set `STELLAR_MODE=live`.

### Guided Testnet setup

For a first-time Testnet deployment, use the interactive setup script from the repository root:

```bash
./contracts/scripts/setup-testnet-freighter.sh
```

It creates/funds Testnet-only identities, deploys all five CrownFi contracts (including the demo
USDC token), registers ticket listings, and writes the Stellar contract IDs and platform secret to
`web/.env` without displaying that secret. It then offers to bootstrap the database and collectible
listings when `DATABASE_URL` has been configured. See the script's on-screen instructions before
importing the Testnet admin key into Freighter.

## How CrownFi uses these contracts with Freighter

CrownFi prepares unsigned Testnet transaction XDR on the server. A fan's Freighter wallet signs the
`sale-splitter.buy` transaction, so the buyer—not CrownFi—authorizes the test-USDC payment and pays
the network fee. CrownFi validates the returned signed XDR against its short-lived transaction
intent, submits it to Soroban RPC, and waits for success before minting the ticket or collectible in
a separate platform-authorized transaction.

For voting proof, the allowlisted Freighter admin signs `audit-anchor.publish`; the contract records
the closed round's Merkle root and tally hash. Raw votes and voter identity stay off-chain.

Each successful Testnet transaction has a public receipt:

```text
https://stellar.expert/explorer/testnet/tx/<transaction-hash>
```

Payment/split and NFT mint are separate receipts. Hashes emitted by `STELLAR_MODE=mock` are simulated
and will not resolve in Stellar Expert.
