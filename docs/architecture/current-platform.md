# CrownFi architecture (decision log)

Chain: Stellar (Soroban). Scope: MVP scaffold, runnable offline by default. Full user + admin sides.

## Core decision
Hybrid, off-chain first. Vote intake, dedup, tally run off-chain for speed. Stellar carries proof
(Merkle root per round), ownership (NFT tickets, collectibles), value (USDC sale settlement).
Never claim Stellar for vote throughput.

## Voting proof flow
1. Fan votes -> row insert; unique(roundId,fanId) blocks duplicates; in-memory rate limit + quota.
2. Admin closes round -> ordered leaf hashes -> Merkle root + tally hash.
3. Root anchored via audit-anchor contract (mock tx hash unless STELLAR_MODE=live).
4. Fan pulls receipt -> Merkle inclusion proof verified against published root. No PII on-chain.

## Frontend + identity
- Design: dark "stage" theme (midnight navy, gold spotlight, ivory). Playfair Display + Inter via next/font.
- Signature element: spotlight contestant carousel (SpotlightCarousel), auto-advancing, swipe on mobile.
- Mobile: top bar + slide-over drawer + fixed bottom tab bar. Responsive throughout. Reduced-motion respected.
- Identity: SessionProvider (React context + localStorage). Sign in as a fan, create fans, admin-mode toggle.
- Components: CountUp, Marquee, Portrait (gradient monogram + flag, no image assets), Toast.

## Pages
- User: / (hero + carousel + stats + 3-step + marquee), /vote, /verify, /tickets, /contestants (collect), /me (dashboard).
- Admin: /admin (gated by admin mode) with Overview (stats + leaderboard), Rounds (create/close+anchor), Contestants (create).

## Backend routes (Next.js API)
- fans GET/POST, contestants GET/POST (POST auto-creates a collectible), rounds GET/POST.
- vote POST, rounds/[id]/close POST, rounds/[id]/results GET, rounds/[id]/receipt GET.
- tickets GET/POST (mint), collectibles GET/POST (records Purchase, +10 points).
- stats GET (home + admin), dashboard GET?fanId (per-fan votes/tickets/collectibles).

## Data model additions
- Purchase model links Fan <-> Collectible (ownership + minted token) for the user dashboard.
- Collectible is now a catalog edition; tokenId/mintTx moved to Purchase.

## Contracts (unchanged this pass)
- audit-anchor self-contained; ticket/collectible on OZ patterns; sale-splitter USDC split.
- Deploy target target/wasm32v1-none/release. Deploy to testnet via stellar-cli, copy C... ids into web/.env.

## Runnable-by-default (all env-switchable)
- DB SQLite; rate limit in-memory; STELLAR_MODE=mock; WALLET_PROVIDER=mock.

## Open threads
- Live Stellar wiring in web/src/lib/stellar.ts (TODO(live)); Privy adapter in web/src/wallet (TODO(privy)).
- sale-splitter cross-call to Collectible.mint (TODO).
- OZ crate versions for ticket/collectible pinned from Contract Wizard.
- Passkey Kit smart-wallet path deferred to v2.
- Live contract-id wiring pending testnet deploy.
