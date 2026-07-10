# CrownFi Session Summary 1

Memory bank for the next session. Terse decision-log. Project: CrownFi, a Stellar-powered pageant
platform (voting, ticketing, collectibles, fan engagement).
Team: Ryan Chris Ariego (lead / UX), Miles Kenneth Napilan (lead dev), Jose Daniel G. Percy (dev),
Rekcel M. Endencia (dev), Robin Avaristo (graphics / SMM). User (Keannu) advising and architecting.

## Core decisions
- Chain: Stellar (Layer 1) + Soroban smart contracts in Rust. NOT Solidity, NOT an EVM L2. Stellar
  is its own base chain, so there is no "L2 under" anything.
- Architecture: hybrid. Off-chain vote intake, dedup, and tally for speed. Stellar for proof
  (Merkle root anchor per round), ownership (NFT tickets and collectibles), and value (USDC).
  Never claim Stellar for vote throughput. This keeps the pitch defensible.
- Wallet: Freighter (browser extension, non-custodial) for the Testnet phase now. Privy embedded
  wallets deferred to Phase 2 for mainstream fans (Google login, no seed phrase; on Stellar the
  Stellar wallet is NOT auto-created by default, must be provisioned with chainType "stellar").
  Wallet sits behind one interface (src/wallet) so providers swap without touching app code.
- Network: Testnet first (Friendbot-funded, free deploys). Mainnet only after a security review.
- Voting types clarified: fan vote (public, millions, off-chain + anchor) is separate from
  judge / organizer scoring (small panel, role-gated, signed scorecards, tabulator aggregates).
  Fan-vs-judge blend weight (e.g. 30/70) is per-pageant and still TBD.
- Compliance: no KYC for voting or small buys. KYC only on the money-out side (payouts to
  contestants and organizers, large amounts), via a provider (Sumsub / Persona / Onfido). Fiat
  on-ramp handles its own KYC. Confirm thresholds with a compliance advisor (PH BSP, AU AUSTRAC).

## Deliverables (in crownfi.zip)
- Monorepo: web/ (Next.js 15 + TS + Tailwind, user + admin sides, mobile responsive, dark "stage"
  design, spotlight contestant carousel, bottom tab bar) + contracts/ (Soroban Rust) + docs/.
- Backend: Prisma (SQLite dev / Postgres prod), Merkle voting (intake -> dedup -> tally -> root ->
  receipt; unit-verified), API routes, in-memory rate limit, Stellar service (mock/live modes),
  wallet abstraction (mock / Privy / Freighter).
- Four hardened Soroban contracts:
  - audit-anchor: write-once checkpoint per round; admin.require_auth; publish event. soroban-sdk only, has tests.
  - ticket: only_owner mint; resale policy (soulbound until window opens); pause; max-supply cap; mint event. OZ non-fungible.
  - collectible: only_owner mint; royalties (bps validated <= 10000); pause; supply cap; mint event. OZ non-fungible + royalties.
  - sale-splitter: listing-based pricing (price + payee from storage, not caller); bps and price validation; pause; sale event. soroban-sdk only, has tests.
  - Note: ticket and collectible need OZ crate versions pinned from the OpenZeppelin Contract Wizard before they build. audit-anchor and sale-splitter build on soroban-sdk alone.
- Freighter integration: src/wallet/freighter.ts (connect / getAddress / sign, Testnet-pinned),
  FreighterButton in the account menu, fans PATCH endpoint to save the connected address, testnet
  env vars, @stellar/freighter-api dependency.
- Organizer request feature: OrganizerRequest model, public /organize application form, admin
  Requests tab (approve / reject).
- PDFs: CrownFi_Architecture_UserFlow.pdf and CrownFi_Build_Plan_Testnet.pdf (team review; the plan
  includes the organizer onboarding flow).
- UI/UX skill vendored at crownfi/.claude/skills/ui-ux-pro-max/ (searchable design databases +
  scripts). Run scripts/search.py; use --design-system for tokens. For CrownFi it recommends dark +
  gold (primary #1C1917, accent #A16207 WCAG-adjusted), Bodoni Moda / Jost typography, liquid-glass
  or premium style. Enforces: no emoji as icons (use SVG/Lucide), 44px touch targets, contrast >=4.5:1,
  reduced-motion, and a pre-delivery checklist.

## Verified
- npm install clean; tsc clean (Prisma model types cannot be generated offline here but resolve in
  the user's environment). Next bumped to 15.5.20 (CVE-2025-66478 patch). Merkle logic runtime-verified.
- Could not compile Soroban here (no Rust/Stellar toolchain in the sandbox); contracts are
  review-level plus their included cargo tests.

## TOP OPEN THREAD: multi-tenancy (next session, first task)
Reshape from single-event to a platform where many organizers post and run their own pageants.
- New Pageant entity, owned by an organizer. Scope Round, Contestant, Ticket, Collectible, Vote to
  pageantId so pageants are fully isolated (a vote in one never touches another).
- Public pageant directory: fans browse live pageants; each pageant behaves like a mini-site under
  the CrownFi brand.
- Organizer-scoped admin (their pageant only) vs platform super-admin (everything).
- Flow: OrganizerRequest (already built) -> approve -> organizer creates Pageant(s) -> directory.
- DECISION NEEDED: after approval, can organizers self-publish pageants freely, or does each new
  pageant need per-pageant admin sign-off (quality control over what carries the CrownFi name)?
- Also needed: organizer authentication (an Organizer entity that owns pageants), and Judge /
  Tabulator / Auditor roles for official scoring (signed scorecards, separate from the fan vote).
- Apply the ui-ux-pro-max skill throughout this build (query it before UI work; follow the checklist).

## Other open threads
- Live Stellar wiring in web/src/lib/stellar.ts (TODO(live)) once contract ids are deployed to testnet.
- sale-splitter cross-call to Collectible.mint for atomic pay-and-mint.
- Replace emoji icons in the bottom tab bar / pages with SVG icons (skill rule: no emoji as icons).
- Fan-vote vs judge-score weighting per pageant.

## Build reminders
- Testnet + Freighter. Deploy contracts via stellar-cli (target wasm32v1-none), copy the four C...
  ids into web/.env, set STELLAR_MODE=live.
- Run: cd web && cp .env.example .env && npm install && npx prisma migrate dev --name init && npm run seed && npm run dev
- Before any UI work: run crownfi/.claude/skills/ui-ux-pro-max/scripts/search.py for tokens and UX rules.
