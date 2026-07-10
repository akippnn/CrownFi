# CrownFi System Workflow

Full-system integration reference. Two deployables: `contracts/` (Stellar) and `web/` (Next.js app).

## Folder map
- `contracts/` - five Soroban Rust contracts. Deploy to Stellar Testnet.
- `web/` - Next.js 15 app (fan, admin, organizer). Calls the contracts by id.
- `docs/` - decision logs and session summaries.
- `.claude/skills/ui-ux-pro-max/` - vendored design skill.
- `../setup/deployment.md` - step-by-step deploy runbook.

## Identity (no demo accounts)
- Sign-in is connecting Freighter (Testnet). `POST /api/fans/connect` upserts a Fan by walletAddress.
- A Fan is a wallet address + derived handle + loyalty points. walletAddress is unique (one wallet, one fan).
- Admin is a connected wallet listed in `NEXT_PUBLIC_ADMIN_WALLETS`. Enforce this server-side before mainnet
  (use the wallet challenge/sign/verify pattern; client allowlist alone is not a security boundary).

## End-to-end flows
1. Vote: connect wallet, `/vote` pick a contestant, `POST /api/vote` (dedup by unique roundId+fanId),
   admin closes the round, Merkle root anchored via audit-anchor, fan pulls a receipt at `/verify`
   (Merkle inclusion proof). No voter identity on-chain.
2. Ticket: connect, `/tickets` pick a tier, `prepare-buy` builds the tx, the buyer signs in Freighter,
   `confirm-buy` submits the USDC split (to the event treasury) then mints the NFT ticket to the wallet.
3. Collectible: fan buys at `/contestants` the same way — buyer-signed USDC via the sale-splitter splits
   to the contestant + platform, the collectible NFT mints to the wallet, +10 loyalty points, Purchase recorded.
   (Faucet `POST /api/faucet` mints test USDC; `GET /api/usdc-balance` reads it.)
4. Organizer: apply at `/organize`, an OrganizerRequest is created (pending), admin approves or rejects
   in the Requests tab.

## On-chain vs off-chain
- Off-chain: vote intake, dedup, tally, and app data (Supabase Postgres via Prisma).
- On-chain (Stellar): the Merkle root per round (proof), NFT tickets and collectibles (ownership), USDC (value).
- Bridge: the tally engine publishes only the root. The chain never sees voter identity.

## Contracts
- audit-anchor: write-once checkpoint per round.
- ticket: only_owner mint, resale locked until the window opens, pause, supply cap.
- collectible: only_owner mint, royalties (bps validated), pause, supply cap.
- sale-splitter: listing-based USDC split (price and payee from storage, not the caller), validated, pause.
- usdc-test: mintable SEP-41 token standing in for USDC on Testnet (owner-gated mint = faucet). Swap for Circle USDC on mainnet.
Deploy + full setup (incl. USDC + listings): `contracts/DEPLOY_GUIDE.md`. Paste the ids into `web/.env`, set `STELLAR_MODE=live`.

## Run (Supabase)
- `web/.env`: `DATABASE_URL` (Supabase pooled 6543 `?pgbouncer=true`), `DIRECT_URL` (5432),
  `STELLAR_MODE`, `STELLAR_NETWORK`, `NEXT_PUBLIC_ADMIN_WALLETS`.
- `cd web && npm install && npx prisma migrate dev && npm run seed && npm run dev`
- Seed creates contestants, a round, and collectibles. No demo fans.

## Design
- Light theme: white background, gold accent. Fonts Bodoni Moda (display) + Jost (body). Lucide icons (no emoji).
- Tokens and rules: `CrownFi_Design_System.md`. Design skill: `.claude/skills/ui-ux-pro-max`.

## Live mode (implemented)
- `web/src/lib/stellar.ts` submits real Soroban txs when `STELLAR_MODE=live`:
  - **Round close** → `AuditAnchor.publish` (platform-signed by `STELLAR_PLATFORM_SECRET`).
  - **Buy ticket / collectible** → two-step buyer-signed USDC flow: `prepare-buy` builds `SaleSplitter.buy`
    with the buyer as tx source → the buyer signs in Freighter → `confirm-buy` submits the split, then the
    platform mints the NFT. Ticket tiers → listings in `web/src/lib/tiers.ts`; collectibles carry a `listingId`.
  - **Faucet** → `UsdcTest.mint` (platform, token owner). Balance read via contract simulation.
- Full deploy + USDC + listing setup: `contracts/DEPLOY_GUIDE.md`.

## Open threads (next)
- Multi-tenancy (Pageant entity + public directory + organizer-scoped admin).
- Server-side admin enforcement (wallet signature) — `NEXT_PUBLIC_ADMIN_WALLETS` is client-side only.
- Atomic buy+mint: cross-call `Collectible.mint` / `Ticket.mint` from inside `SaleSplitter.buy` so payment
  and mint are one tx (today it's split-then-mint in two txs).
- Swap `usdc-test` for Circle's real USDC contract on mainnet (one env var).
