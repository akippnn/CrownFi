# CrownFi

Blockchain-powered voting, ticketing, and fan-experience platform for pageants, built on Stellar.

A runnable MVP across three layers, with a full user side and admin side:

- **Frontend + Backend** (`web/`) - Next.js 15 (App Router), TypeScript, Tailwind. Dark "stage" design, mobile responsive, with a spotlight contestant carousel, animated stats, a bottom tab bar on mobile, and a slide-over drawer.
- **Blockchain** (`contracts/`) - Soroban (Rust), 5 contracts: audit anchor, NFT ticket, NFT collectible with royalties, primary-sale USDC splitter, and a mintable test-USDC token. Ticket and collectible purchases pay real USDC (buyer-signed in Freighter), split on-chain to the contestant/treasury and platform.

## Core idea

Voting runs off-chain for speed. Stellar carries proof and value. When a round closes, the tally is
sealed into a Merkle root and anchored on-chain; fans verify their vote with an inclusion proof.
No voter identity ever touches the chain.

## Features

User side
- Sign in as a fan (identity persists), or create a new fan account.
- Vote via the spotlight carousel; duplicate votes blocked at the database layer.
- Verify a vote with a Merkle receipt against the anchored root.
- Buy tiered NFT tickets (Silver / Gold / Diamond).
- Collect contestant portrait NFTs that fund the contestant.
- Personal dashboard: your votes, tickets, collectibles, wallet, and loyalty points.

Admin side (toggle "Admin mode" in the account menu)
- Overview: live totals, GMV, and a vote leaderboard.
- Rounds: create a round, close and anchor it (tally + Merkle root + Stellar anchor).
- Contestants: add contestants (auto-creates a collectible edition).

## Quick start

The database is **Supabase Postgres** (free tier). Stellar and the wallet run in **mock mode**, so
no blockchain keys are needed to run locally — you only set up the database.

1. Create a Supabase project and grab its two connection strings — full walkthrough in
   [`SUPABASE.md`](SUPABASE.md).
2. Then:

```bash
cd web
cp .env.example .env            # paste your Supabase DATABASE_URL + DIRECT_URL
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Open http://localhost:3000

Note: the UI loads its fonts (Fraunces + Manrope) via next/font on first build, so the initial
build needs network access (same as npm install).

### Hero flow
Vote (pick a fan in the top-right menu first) -> Admin -> Rounds -> Close + anchor -> Verify.

## Where do the smart contracts go, and where do I deploy them?

They live in `contracts/` (a Cargo workspace) and deploy to the **Stellar network**, not to your
own server. The flow:

1. Install the toolchain:
   ```bash
   rustup target add wasm32v1-none          # Rust 1.84+
   cargo install --locked stellar-cli
   ```
2. Create and fund a testnet identity (Friendbot funds it for free):
   ```bash
   stellar keys generate alice --network testnet --fund
   ```
3. Build and deploy each contract (from `contracts/`):
   ```bash
   stellar contract build
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/audit_anchor.wasm \
     --source alice --network testnet --alias audit_anchor \
     -- --admin $(stellar keys address alice)
   ```
   Each deploy prints a **contract id starting with C**. `contracts/scripts/deploy.sh` wraps all four.
4. Copy those contract ids into `web/.env` (`AUDIT_ANCHOR_CONTRACT_ID`, `TICKET_CONTRACT_ID`, etc.)
   and set `STELLAR_MODE=live` to move the backend off mock mode.

Deploy order: **testnet first** (free, for building and demos), then **mainnet** for production once
audited. Recommendation: keep everything on testnet through the hackathon, and only touch mainnet
after a security pass.

## Going live (checklist)
- `DATABASE_URL` + `DIRECT_URL`: point at Supabase Postgres — see [SUPABASE.md](SUPABASE.md).
- `STELLAR_MODE=live` + `STELLAR_PLATFORM_SECRET` + the contract ids. The live Soroban calls are
  **implemented** in `web/src/lib/stellar.ts`: round anchoring (platform-signed), and ticket +
  collectible purchases (buyer-signed USDC split via the sale-splitter, then NFT mint). Deploy the
  contracts and flip the env — see [contracts/DEPLOY_GUIDE.md](contracts/DEPLOY_GUIDE.md).
- Admin: list admin `G...` addresses in `NEXT_PUBLIC_ADMIN_WALLETS`. For mainnet, add a server-side
  wallet-signature check (the client allowlist is not a security boundary).
- `RATELIMIT_MODE=upstash` for production rate limiting.
- Optional: `WALLET_PROVIDER=privy` with Privy keys for seedless embedded wallets (adapter stub in
  `web/src/wallet/index.ts`).

## Docs

| Doc | What it covers |
|---|---|
| [USER_FLOW.md](USER_FLOW.md) | **Start here to try the app** — run it, then walk through every fan & admin flow |
| [SUPABASE.md](SUPABASE.md) | Database setup (Supabase Postgres) |
| [contracts/DEPLOY_GUIDE.md](contracts/DEPLOY_GUIDE.md) | Deploy the smart contracts to Testnet + go live |
| [WORKFLOW.md](WORKFLOW.md) | Full system / integration reference |

## Layout

```
crownfi/
  web/         Next.js 15 app (frontend + backend + admin)
  contracts/   Soroban Rust workspace (5 contracts)
  docs/        Architecture decision log
```

This is an MVP scaffold for local testing and iteration, not a production deployment.
