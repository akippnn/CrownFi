# CrownFi — User Flow & Test Guide

A hands-on guide for teammates to run CrownFi locally and walk through every feature — as a **fan
(normal user)** and as an **admin**. Blockchain-backed voting, ticketing, and collectibles for
pageants, built on Stellar.

> **TL;DR:** it runs on Supabase (DB) + Stellar Testnet (chain). Set up the DB, run the app, connect
> Freighter, and try the flows below. On-chain mode is optional — the app works fully in "mock" mode
> too.

---

## 1. Prerequisites

- **Node 18+** and **npm**
- **Freighter wallet** browser extension (<https://www.freighter.app/>), switched to **Testnet**
- A **Supabase** project (free) — see [`../setup/supabase.md`](../setup/supabase.md)

---

## 2. Get it running (≈10 min)

```bash
git clone <repo-url>
cd crownfi/web
cp .env.example .env          # then paste your Supabase DATABASE_URL + DIRECT_URL (see `docs/setup/supabase.md`)
npm install
npx prisma migrate dev --name init   # creates the tables
npm run seed                          # adds 4 contestants, 1 open round, 4 collectibles
npm run dev
```

Open **http://localhost:3000**. You should see contestants in the carousel.

**Mock vs live mode** (in `web/.env`):
- `STELLAR_MODE="mock"` → on-chain actions return *simulated* tx hashes. No wallet/keys needed. Best
  for trying the app.
- `STELLAR_MODE="live"` → on-chain actions submit **real Stellar Testnet transactions**. Requires the
  contracts deployed + `STELLAR_PLATFORM_SECRET` set — see [`contracts/DEPLOY_GUIDE.md`](../../contracts/DEPLOY_GUIDE.md).

Either way, the flows below are identical — only whether the tx is real vs simulated changes.

---

## 3. Signing in (important — read this first)

**Sign-in = connecting your Freighter wallet.** There are no email/password accounts. Your wallet
address *is* your identity.

- Click **Connect Freighter** (top-right). A **Freighter popup** appears → approve it.
- **Buying a ticket or a collectible pops Freighter again** — because the fan pays real USDC, they
  sign that transaction themselves. This is the "money moves on-chain" moment.
- **Closing + anchoring a round pops Freighter** too — the admin signs the on-chain proof (no USDC,
  just a tiny XLM fee). The admin wallet must be the audit-anchor contract admin (see §5).
- Voting and ticket/collectible *minting* are signed by the platform server-side — those don't pop.
- If **nothing pops up** when you click Connect: Freighter isn't installed or isn't detected. The app
  shows a banner with a **"Get Freighter"** link. Install it, set it to **Testnet**, reload.

---

## 4. Fan (normal user) flow

| Step | Where | What you do | What to expect |
|---|---|---|---|
| 1. Connect | top-right | Click **Connect Freighter**, approve popup | Your `G…` address shows; a `Fan` record is created |
| 2. Vote | **/vote** | Pick a contestant → **Cast vote** | "Vote recorded." One vote per round (duplicates blocked) |
| 3. Verify | **/verify** | Pick a **closed** round → **Verify** | A Merkle **receipt** proving your vote is in the official tally |
| 4. Buy a ticket | **/tickets** | Get test USDC → pick a tier → **Buy → sign in Freighter** | Real **USDC splits on-chain** to the event treasury → **NFT ticket** minted to your wallet |
| 5a. Get test USDC | **/contestants** | Click **Get test USDC** (live mode) | +50 test USDC lands in your wallet (a faucet) |
| 5b. Collect | **/contestants** | Buy a portrait → **sign in Freighter** | Real **USDC splits on-chain** (95% contestant / 5% platform) → **collectible NFT** minted → **+10 points** |
| 6. Dashboard | **/me** | — | Your votes, tickets, collectibles, wallet, and points |
| 7. Apply as organizer | **/organize** | Submit the form | Creates a pending organizer request (admin reviews) |

> Voting only works while a round is **open**. If there's no open round, an admin needs to create one
> (Step 4 in the admin flow).

---

## 5. Admin flow

Admin is decided by your **wallet address**, not a password.

### Become an admin
1. Add your Freighter `G…` address to `web/.env`:
   ```dotenv
   NEXT_PUBLIC_ADMIN_WALLETS="G...your address...,G...another admin..."
   ```
2. **Restart** `npm run dev` (this variable is baked in at startup).
3. Connect that wallet → an **Admin** link appears in the nav.

> **To Close + anchor (sign on-chain), your admin wallet must be the audit-anchor contract's admin.**
> In this project that's the deployer key `alice`. To sign from the browser, import alice into
> Freighter: run `stellar keys show alice`, copy the `S…` secret, then Freighter → **Import account** →
> paste it → connect as alice. (Or redeploy audit-anchor with your own wallet as `--admin`.) The other
> admin actions — create round, add contestant, approve requests — are database-only and work with any
> allowlisted wallet.

### What you can do (in **/admin**)
| Tab | Action | Result |
|---|---|---|
| **Overview** | — | Live totals, GMV, vote leaderboard |
| **Rounds** | **Create round** | Opens a new voting round |
| **Rounds** | **Close + anchor** | Tallies votes → builds a Merkle root → **you sign in Freighter** → **anchors it on Stellar** (audit-anchor). Returns `anchorTx`. No USDC — just a tiny XLM fee. |
| **Contestants** | **Add contestant** | Adds a contestant (auto-creates a collectible edition) |
| **Requests** | **Approve / reject** | Reviews organizer applications |

### Proving it's on-chain (live mode only)
After **Close + anchor**, the result includes `anchorTx`. Open it in a block explorer:
```
https://stellar.expert/explorer/testnet/tx/<anchorTx>
```
That transaction is the tamper-proof record of the round's result on Stellar. In mock mode the hash
is simulated (not on the explorer).

---

## 6. The end-to-end demo (the "hero" flow)

1. **Fan:** connect → **/vote** → vote for a contestant.
2. **Admin:** **/admin → Rounds → Close + anchor** the round.
3. **Fan:** **/verify** → select that round → get your **Merkle receipt** (proof your vote counted).
4. (Live mode) open the `anchorTx` on stellar.expert → **the proof is on-chain**.

That loop — *vote fast off-chain, prove it on Stellar, verify with no identity exposed* — is the core
idea of CrownFi.

---

## 7. How it works under the hood (1-minute version)

- **Off-chain (Supabase/Postgres):** vote intake, de-duplication, tally, app data. Fast, scalable.
- **On-chain (Stellar):** the **Merkle root** of each closed round (proof), **NFT tickets &
  collectibles** (ownership), and **USDC** (value). The chain never sees voter identity.
- **Bridge:** when a round closes, the backend publishes *only the Merkle root* to the audit-anchor
  contract. Fans verify their vote with an inclusion proof against that root.

Contracts (Rust/Soroban) live in [`contracts/`](../../contracts/); app (Next.js 15) in [`web/`](../../web/).

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Page shows "Unexpected end of JSON input" / no data | DB not configured — check `web/.env`, see [`../setup/supabase.md`](../setup/supabase.md) |
| Clicking **Connect** does nothing | Freighter not installed / not on Testnet. Install it, reload. |
| No **Admin** tab | Your wallet isn't in `NEXT_PUBLIC_ADMIN_WALLETS`, or you didn't restart after editing `.env` |
| Can't vote ("No active round") | An admin needs to create/open a round |
| Actions feel instant with fake tx hashes | You're in `STELLAR_MODE="mock"` (that's fine for testing) |
| Live action errors | Check `STELLAR_MODE="live"`, contract ids, and `STELLAR_PLATFORM_SECRET` in `web/.env` |

---

## Related docs
- [`README.md`](../../README.md) — project overview
- [`../setup/supabase.md`](../setup/supabase.md) — database setup
- [`contracts/DEPLOY_GUIDE.md`](../../contracts/DEPLOY_GUIDE.md) — deploy the smart contracts + go live
- [`../operations/workflow.md`](../operations/workflow.md) — full system/integration reference
