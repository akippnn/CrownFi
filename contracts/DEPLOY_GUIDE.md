# CrownFi — Smart Contract Deploy Guide (Testnet)

A step-by-step, learning-oriented walkthrough for deploying the four CrownFi Soroban contracts to
Stellar **Testnet** and wiring them into the web app. Written for Windows + VS Code (PowerShell).

---

## 0. Mental model — Soroban vs Solidity

If you know Ethereum/Solidity, here's the translation:

| Concept | Solidity / EVM | Soroban / Stellar (what you'll do) |
|---|---|---|
| Chain selector | numeric **chainId** (e.g. 11155111) | **named network** — `--network testnet`. No numeric id. It maps to a *network passphrase* `Test SDF Network ; September 2015`. |
| Deployer account | an EOA / private key | a **keypair** you make with the CLI (`alice`). Funded with free test XLM via Friendbot. |
| Gas | ETH | **XLM** (test XLM on Testnet, free). |
| Deployed contract | an **address** `0x…` | a **contract id** `C…` (56 chars). |
| Owner / admin | usually `owner = msg.sender` in the constructor | set **explicitly** — you pass your address as a constructor arg (`--admin` / `--owner`). |
| Calling a contract | address **+ ABI (.json)** | just the **contract id**. The interface is baked into the deployed wasm; the SDK calls by method name. (Optional TS bindings exist but aren't required.) |

**Bottom line:** there's no chainId to memorize, and the app only needs each contract's **`C…` id** (plus one deployer secret to sign with).

---

## 1. Prerequisites (one time)

You already have Rust 1.96 and the `wasm32v1-none` target. The only missing tool is the **Stellar CLI**:

```powershell
cargo install --locked stellar-cli
```
This compiles from source (~15 min). When it's done, verify:
```powershell
stellar --version
```
It installs to `C:\Users\<you>\.cargo\bin\stellar.exe`, which is already on your PATH.

---

## 2. Create & fund your deployer identity

```powershell
stellar keys generate alice --network testnet --fund
$ADMIN = stellar keys address alice
$ADMIN        # prints your G... address — this is the admin/owner of every contract
```
- `generate alice` → makes a keypair named `alice`.
- `--fund` → Friendbot drops free **test XLM** in (your "gas").
- `$ADMIN` holds the public `G…` address; we pass it as each contract's owner/admin.

> Your **`alice` secret** (`stellar keys show alice`, an `S…` value) becomes `STELLAR_PLATFORM_SECRET`
> in the app — it's what the backend uses to sign anchor/mint transactions. Keep it private.

---

## 3. Build the contracts

```powershell
cd D:\CrownFi\F3\crownfi\contracts
stellar contract build
```
Each crate compiles to `contracts/target/wasm32v1-none/release/<name>.wasm`. Those four `.wasm`
files are what you deploy.

---

## 4. Deploy

**Easy path (one command):** run the bundled PowerShell script — it derives the USDC placeholder,
builds, deploys all 4 with aliases, and prints the ready-to-paste `.env` block:
```powershell
cd D:\CrownFi\F3\crownfi\contracts
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

**Or do it by hand** (below) to understand each step. Each `stellar contract deploy` prints one
**`C…` contract id** — copy each into `web/.env` (Step 5). The part after `--` is the
**constructor**, where owner/admin gets set.

### 4a. Deploy the test-USDC token (the settlement currency)
Ticket + collectible purchases settle in USDC. On Testnet we deploy our own mintable SEP-41 token
(`usdc-test`) — a Soroban token needs no trustlines, so any demo wallet can be funded instantly. On
mainnet you'd point the splitter at Circle's real USDC contract instead; nothing else changes.
```powershell
stellar contract deploy --wasm target/wasm32v1-none/release/usdc_test.wasm `
  --source alice --network testnet --alias usdc_test `
  -- --owner $ADMIN
$USDC = "PASTE_THE_C..._IT_PRINTS"
```
Constructor: `owner` = who can mint (the platform; `mint` is the faucet).

### 4b. audit-anchor — the vote-proof anchor
```powershell
stellar contract deploy --wasm target/wasm32v1-none/release/audit_anchor.wasm `
  --source alice --network testnet --alias audit_anchor `
  -- --admin $ADMIN
```
Constructor: `admin` = who is allowed to publish checkpoints (you).

### 4c. ticket — NFT tickets
```powershell
stellar contract deploy --wasm target/wasm32v1-none/release/ticket.wasm `
  --source alice --network testnet --alias ticket `
  -- --owner $ADMIN --max_supply 0
```
Constructor: `owner` = who can mint; `max_supply` = cap (**0 = unlimited**).

### 4d. collectible — portrait NFTs with royalties
```powershell
stellar contract deploy --wasm target/wasm32v1-none/release/collectible.wasm `
  --source alice --network testnet --alias collectible `
  -- --owner $ADMIN --royalty_receiver $ADMIN --royalty_bps 1000 --max_supply 0
```
Constructor: `owner` = minter; `royalty_receiver` = who earns royalties; `royalty_bps` = royalty in
basis points (**1000 = 10%**); `max_supply` = cap (0 = unlimited).

### 4e. sale-splitter — primary-sale USDC split
```powershell
stellar contract deploy --wasm target/wasm32v1-none/release/sale_splitter.wasm `
  --source alice --network testnet --alias sale_splitter `
  -- --admin $ADMIN --usdc $USDC --platform $ADMIN --platform_bps 500
```
Constructor: `admin` = who manages listings; `usdc` = the token id from 4a; `platform` = fee
recipient; `platform_bps` = platform fee (**500 = 5%**).

### 4f. Register listings (so purchases have a price + payee)
Each collectible and each ticket tier needs a listing on the splitter (price + who gets paid).
- **Collectibles:** after wiring `.env` (Step 5), run once from `web/`:
  `npx tsx --env-file=.env scripts/register-listings.ts` (assigns a `listingId` per collectible).
- **Ticket tiers:** register listings `101` (Silver 50), `102` (Gold 100), `103` (Diamond 200) paying an
  event-treasury wallet — the ids are mapped in `web/src/lib/tiers.ts`. Create a treasury key
  (`stellar keys generate treasury --network testnet --fund`) and register each:
  ```powershell
  stellar contract invoke --id $SALE --source alice --network testnet -- `
    set_listing --listing_id 101 --price 500000000 --contestant $TREASURY --active true
  ```
  (Prices are in base units at 7 decimals: 50 USDC = `500000000`.)

> The backtick `` ` `` at line ends is PowerShell's line-continuation. You can also put each command on
> one line. In **Git Bash** use `\`.

---

## 5. Wire the ids into the web app

Open `web/.env` and set:
```dotenv
STELLAR_MODE="live"
STELLAR_NETWORK="testnet"
STELLAR_PLATFORM_SECRET="S..."          # from: stellar keys show alice
AUDIT_ANCHOR_CONTRACT_ID="C..."         # from 4b
TICKET_CONTRACT_ID="C..."               # from 4c
COLLECTIBLE_CONTRACT_ID="C..."          # from 4d
SALE_SPLITTER_CONTRACT_ID="C..."        # from 4e
USDC_TEST_CONTRACT_ID="C..."            # from 4a
DEMO_CONTESTANT_PAYOUT="G..."           # wallet that receives the contestant's cut (collectibles)

# To reach the Admin panel (needed to close/anchor a round), add YOUR Freighter address:
NEXT_PUBLIC_ADMIN_WALLETS="G...your Freighter Testnet address..."
```
Then **restart** `npm run dev` (env changes only load at startup).

**What the app needs per contract = just the `C…` id.** The method names + argument types (the
"ABI part") are already written in `web/src/lib/stellar.ts`. Lost the ids? Get them back anytime:
```powershell
stellar contract alias ls
```

> ### This project's deployed Testnet addresses (2026-07-05, deployer = `alice`)
> | Env var / role | Contract id / address |
> |---|---|
> | `AUDIT_ANCHOR_CONTRACT_ID` | `CAC7AX3PFJ5NC43BB5TRWY4QTKLSPBVK3DT5GTLH5N6Y3TIYK5GLOVNV` |
> | `TICKET_CONTRACT_ID` | `CA7M6UH55Z4UBQKBZNZBFFU3PWI3XI3BH46LMHSUINWJHTRG7CYDLH6N` |
> | `COLLECTIBLE_CONTRACT_ID` | `CAZOOO3AUNGKDE6XTQNHETSBJGU33I2OCNREZ63GTUTDRPYBUS2R4LZX` |
> | `SALE_SPLITTER_CONTRACT_ID` (USDC) | `CATCOIVWAVVXBNLPOXBVN3WQ26UNAVLUVSRYBNQWIII75I5QK4YV2KU3` |
> | `USDC_TEST_CONTRACT_ID` (test USDC) | `CAE2GXXU4BPLRX5DHLFJKUR7AP5ETPIERGTFNCY7PEFCEL5H3G3RG6LW` |
> | `DEMO_CONTESTANT_PAYOUT` (collectible payee) | `GCK4VGS6VXHJCUZV3U4ACMKS77NYRWXITTFE6PW5P2DRJV6B7GN34S2J` |
> | event treasury (ticket payee) | `GC3PXGAWQWHHV6M6AKR3LSZZ7RNYZXASGNJM7BSU3EMWI5KG2R5QSIY3` |
>
> Ticket tier listings on the splitter: `101`=Silver(50), `102`=Gold(100), `103`=Diamond(200) USDC.
>
> These belong to identity `alice` (its `S…` secret = `STELLAR_PLATFORM_SECRET`). If you redeploy,
> new ids are generated — update `.env` accordingly.

---

## 6. Prove it's on-chain

In the app: **Admin → close a round.** The response's `anchorTx` is now a **real Testnet
transaction**. View it:
```
https://stellar.expert/explorer/testnet/tx/<anchorTx>
```
You can also read a checkpoint straight from the contract:
```powershell
stellar contract invoke --id audit_anchor --source alice --network testnet -- get --round_id 123
```

---

## 7. Contract-by-contract function reference

### audit-anchor  (`contracts/audit-anchor/src/lib.rs`)
Stores one tamper-evident, **write-once** checkpoint per voting round.

| Function | Access | Purpose |
|---|---|---|
| `__constructor(admin)` | — | sets the admin at deploy |
| `publish(round_id, merkle_root, tally_hash, total_votes)` | **admin only**, write-once | anchors a round's Merkle root + tally hash. Refuses to overwrite an existing round. |
| `get(round_id) -> Option<Checkpoint>` | public read | returns the stored checkpoint |
| `admin() -> Address` | public read | current admin |

*App usage:* called on **round close** → `publish(...)`.

### ticket  (`contracts/ticket/src/lib.rs`)
NFT ticket built on OpenZeppelin's non-fungible base, with an anti-scalping resale lock.

| Function | Access | Purpose |
|---|---|---|
| `__constructor(owner, max_supply)` | — | owner + supply cap (0 = unlimited) |
| `mint(to) -> u32` | **owner only** | mints a ticket NFT to `to`, returns token id. Blocked if paused or cap reached. |
| `set_resale_open(open)` | **owner only** | opens/closes the resale window |
| `set_paused(paused)` | **owner only** | emergency stop on minting |
| `resale_open() -> bool` | public read | is resale open |
| `transfer` / `transfer_from` | anyone (holder) | **blocked until resale opens** (soulbound → anti-scalping) |

*App usage:* called on **buy ticket** → `mint(fanWallet)`.

### collectible  (`contracts/collectible/src/lib.rs`)
Portrait NFT with ERC-2981 royalties so the contestant earns on secondary sales.

| Function | Access | Purpose |
|---|---|---|
| `__constructor(owner, royalty_receiver, royalty_bps, max_supply)` | — | owner, royalty payee + rate, cap |
| `mint(to) -> u32` | **owner only** | mints a collectible NFT to `to` |
| `set_paused(paused)` | **owner only** | emergency stop |
| `set_default_royalty(receiver, bps, _op)` | **owner only** | change the collection royalty |
| `set_token_royalty(id, receiver, bps, _op)` | **owner only** | per-token royalty |
| `remove_token_royalty(id, _op)` | **owner only** | drop per-token royalty |
| `royalty_info(id, sale_price) -> (Address, i128)` | public read | marketplace queries the cut |

*App usage:* called on **buy collectible** → `mint(fanWallet)`.

### sale-splitter  (`contracts/sale-splitter/src/lib.rs`)
Primary-sale settlement. **Price and payee come from stored listings, never from the caller** — so a
buyer can't set their own price or redirect funds.

| Function | Access | Purpose |
|---|---|---|
| `__constructor(admin, usdc, platform, platform_bps)` | — | admin, USDC token, fee recipient, fee rate |
| `set_listing(listing_id, price, contestant, active)` | **admin only** | register/update a listing (price + payee) |
| `set_paused(paused)` | **admin only** | halt sales |
| `buy(buyer, listing_id) -> i128` | **buyer signs** | pays the listed price in USDC; splits to contestant + platform; returns contestant's share |
| `admin() -> Address` | public read | current admin |

*App usage:* **live and wired.** Buying a ticket or collectible calls `buy()` with the buyer as tx
source; the buyer signs in Freighter, the USDC splits on-chain, then the platform mints the NFT
(`prepare-buy` → sign → `confirm-buy` in `web/src/lib/stellar.ts`).

### usdc-test  (`contracts/usdc-test/src/lib.rs`)
A mintable SEP-41 token standing in for USDC on Testnet (no trustlines needed). Swap for Circle's real
USDC contract on mainnet.

| Function | Access | Purpose |
|---|---|---|
| `__constructor(owner)` | — | sets the owner (the platform) |
| `mint(to, amount)` | **owner only** | the faucet — funds a wallet with test USDC |
| `transfer` / `balance` / `approve` / … | standard SEP-41 | the token interface the sale-splitter calls |

*App usage:* `POST /api/faucet` mints; `GET /api/usdc-balance` reads; the sale-splitter transfers it on `buy()`.

---

## 8. Troubleshooting (real errors we hit)

| Error you see | Cause | Fix |
|---|---|---|
| `Error(Storage, ExistingValue)` / **"contract already exists"** on the native-token step | The native XLM token contract is a **shared singleton** already on Testnet — you can't deploy it again. | Don't `deploy` it. Read its id: `stellar contract id asset --asset native --network testnet` → use that as `$USDC`. |
| **`Account alias "PASTE_THE_C..._IT_PRINTS" not Found`** (or any `... not Found`) | `$USDC` (or `$ADMIN`) was never set, so the placeholder text got passed to `--usdc`/`--admin`. | Set the variable first: `$USDC = "CDLZFC3S...ZINK"` and `$ADMIN = stellar keys address alice`, then re-run. |
| **`LNK1180: insufficient disk space` / `os error 112`** during `cargo install` | Your **C: drive is full** — cargo compiles into `C:\Temp`. | Free up space on C: (empty Recycle Bin, clear `%TEMP%`, remove old `C:\Temp\cargo-install*` folders), then re-run. |
| `stellar : not recognized` in PowerShell | CLI not installed yet, or the terminal predates the install. | Wait for `cargo install` to finish, then open a fresh terminal; `stellar --version` should work. |
| `running scripts is disabled on this system` when running `deploy.ps1` | PowerShell execution policy. | Run it as: `powershell -ExecutionPolicy Bypass -File .\deploy.ps1` |
| Deploy prints a **new** `C…` every run | `deploy` uses a fresh random salt each time → a brand-new contract. | That's expected. Use `--alias <name>` so the id is saved, and read them back with `stellar contract alias ls`. Don't redeploy if you already have working ids. |
| App still shows mock tx hashes after deploy | `STELLAR_MODE` still `"mock"`, or the server wasn't restarted. | Set `STELLAR_MODE="live"` in `web/.env` and restart `npm run dev`. |

---

## Recap

1. `cargo install --locked stellar-cli`
2. `stellar keys generate alice --network testnet --fund`
3. `stellar contract build`
4. deploy all **5** with `--alias` (usdc_test, audit_anchor, ticket, collectible, sale_splitter) — each prints a `C…` id; owner/admin is a constructor arg, no chainId anywhere
5. paste the ids + the `alice` secret + `DEMO_CONTESTANT_PAYOUT` + your admin wallet into `web/.env`, set `STELLAR_MODE="live"`, restart
6. register listings: `npx tsx --env-file=.env scripts/register-listings.ts` (collectibles) + the tier listings 101/102/103 (tickets)
7. close a round → real anchor tx; buy a ticket/collectible → Freighter popup + USDC split (view on `stellar.expert`)
