# CrownFi Refactor TODO List

This document tracks tasks for refactoring CrownFi following the audit of the ticketing system branch and the proposed new architecture.  Use this checklist to guide development and avoid drift.

- [ ] **Merge strategy**
    - Start from `security/admin-auth-ci-audit` branch (already merged into `main`).
    - Create a new branch (e.g. `refactor/ticketing-integration`) off of `security/admin-auth-ci-audit`.
    - Manually port useful parts of `feature/ticketing-system` (UI components, pages, guide) into the new branch.  Do **not** merge `feature/ticketing-system` directly.
    - Resolve conflicts manually, keeping all security features (admin auth, transaction intent validation, CI updates).

- [ ] **Security and backend hardening**
    - Retain server-side admin authentication via wallet-signed sessions.
    - Continue to require transaction intents for ticket purchases and verify the signed XDR’s body hash and source account.
    - Ensure API routes for tickets never trust client-supplied `price`, `tier`, `seat`, `fanId`, or other sensitive fields.  Fetch these from the server-side listing.
    - Implement seat assignment and ticket redemption routes with proper owner/admin authorization checks.
    - Add idempotency and unique constraints for purchases, seat assignments, and redemption to prevent duplicate processing.

- [ ] **Architecture refactor**
    - Adopt the monorepo structure suggested in the project prompt:
        - `apps/web` – Next.js frontend
        - `services/api` – Rust Axum backend
        - `contracts/crownfi_audit` – Soroban Rust contract for checkpoints
        - `packages/shared` – shared types and schemas
        - `infra/docker-compose.yml` – local DB/Redis setup
        - `docs/architecture.md` – architecture overview
        - `docs/hackathon-pitch.md` – hackathon pitch deck and narrative
    - Prepare `README.md` updates accordingly.

    - Add a new Rust/Axum microservice under `services/api` to replace Next.js API routes. This service should expose REST endpoints equivalent to the current `/api` routes and handle database access, rate limiting (via Redis where possible), transaction intent creation/consumption, and Stellar anchoring.

    - Create a `packages/shared` library (could be a Rust crate or TypeScript package) to hold shared types and request/response schemas. Use this to avoid duplication of DTO definitions across the web frontend and the Rust API.

    - Introduce an `infra/docker-compose.yml` with services for Postgres and Redis. Local development should start the database, Redis, and the API service together.

    - Rename or reorganize the Soroban workspace under `contracts/` to `contracts/crownfi_audit` and other contract packages (`ticket`, `collectible`, `sale-splitter`, `usdc-test`) to match the prompt’s naming convention.

    - [x] Add initial `services/api` Rust/Axum skeleton with health, events, vote, tally, snapshot, and mock anchor routes.
    - [x] Add `infra/docker-compose.yml` for Postgres, Redis, API, and web.
    - [x] Add local MVP smoke-test script for the API path.
    - [ ] Replace `services/api` in-memory state with Postgres repositories.
    - [ ] Replace demo admin token in the API with the wallet-signed admin session model or a server-to-server auth boundary.
    - [ ] Route the web app to `services/api` for voting/tally/snapshot flows after API parity is tested.


- [ ] **Ticketing UI refactor**
    - [x] Extract the first ticket purchase page pass into reusable components: `TicketHero`, `TicketTierSelector`, `TicketCheckoutPanel`, `TicketSuccessBanner`, `TicketList`, `TicketDemoLinks`, `SeatAssignmentModal`, and `TicketStatusBadge`.
    - [ ] Continue extraction for voucher/verification pages: `TicketVoucher`, `TicketQRCode`, `TicketProofBlock`, and `TicketVerificationPanel`.
    - [x] Move reusable seat formatting/seat-id helper logic into `lib/tickets/seat.ts`.
    - [ ] Move remaining seat map constants/geometry into `lib/tickets/seatMap.ts` and keep API calls in `lib/tickets/ticketApi.ts`.
    - [x] Add shared ticket component types in `components/tickets/types.ts`.
    - [ ] Write `ticketTypes.ts` defining ticket tier metadata (price, perks, zones, max supply).
    - [x] Write `ticketCopy.ts` for first-pass ticket purchase page copy, including anti-scalping wording.
    - [ ] Move voucher and verification page copy into `ticketCopy.ts`.
    - [x] Compose reusable components in `/tickets`.
    - [ ] Compose reusable components in `/tickets/[id]` and `/tickets/verify/[id]`.
    - Avoid inline styles; use Tailwind classes or component-specific modules.
    - Clearly mark pages running in demo/mock mode if contract IDs are not provided.

 - [ ] **Schema and data model**
    - Introduce a `vote_receipts` table to store individual vote receipts (leaf hashes and associated metadata) per vote. Use this for audit/verification pages.
    - Introduce a `tally_snapshots` table that stores canonicalised tally JSON and metadata for each round snapshot. Align this with the `Checkpoint` model or replace it accordingly.
    - Introduce an `audit_logs` table to record admin actions (round creations, closures, anchoring) and important system events. Make sure each record includes timestamps, action type, actor, and impacted entities.
    - (Optional) Introduce a `contestant_support_payments` table if you decide to implement financial support flows separate from ticket purchases.
    - Update Prisma schema migrations and adjust API code accordingly when these tables are added.

 - [ ] **Soroban contracts**
    - Rename the `audit-anchor` contract to `crownfi_audit` or otherwise align contract naming with the prompt. Ensure the contract exposes methods: `initialize`, `commit_checkpoint` (similar to `publish`), `get_checkpoint`, and optionally a method to list or fetch the latest checkpoint.
    - Update the contract’s interface and tests to match the spec. Ensure admin-only calls on checkpoint commits.
    - Review the `ticket` and `sale-splitter` contracts to ensure they do not rely on caller-supplied price or recipient values. Prices should come from stored listings; recipients should be the contestant and platform addresses stored on-chain.

 - [ ] **Design and copy**
    - Decide on a unified design direction (dark luxury theme with gold/purple accents as originally suggested, or the current light editorial style). Update the design tokens in the design system accordingly and refactor components to adhere to the chosen palette and typography.
    - Replace anti-scalping language in the UI and documentation. Use: “Blockchain tickets can reduce counterfeits, provide verifiable ownership, and give organizers programmable transfer controls. They do not fully eliminate off‑platform scalping.”
    - Ensure that any mock/testnet implementations are clearly labelled in the UI (e.g. “Local demo mode” when STELLAR_MODE=mock). Avoid implying production-level security when running in mock mode.

- [ ] **Voting subsystem alignment**
    - Align ticket purchase logic with vote-power decoupling (purchases/support do not increase vote count).
    - Ensure ticketing flows respect the database duplication constraint on votes (`UNIQUE(event_id, category_id, voter_id)`).
    - Continue to anchor tally snapshots to Stellar via the `audit-anchor` contract.

- [ ] **Documentation and tests**
    - [x] Update `SECURITY.md` and `docs/security/security-audit.md` with hackathon/VPS posture, platform-refactor security expectations, and component-duplication risk notes.
    - Update or create `docs/features/ticketing.md` to reflect the refactored implementation and correct anti-scalping language.
    - Write backend tests for ticket purchase, seat assignment, and redemption to ensure authorization and idempotency.
    - Fix ticketing test scripts to be cross-platform and align with CI (remove Windows-specific `npx.cmd`).
    - Add tests for refactored components as needed.

    - Write `docs/architecture.md` explaining the backend-first voting design, how the Rust API communicates with the database and Stellar, and how the Soroban audit contract is called.

    - Write `docs/hackathon-pitch.md` outlining the problem, how CrownFi addresses it, and why off-chain voting plus Stellar proofs is more credible than on-chain vote processing.

    - Update `README.md`, `docs/setup/supabase.md`, and `docs/operations/workflow.md` once the new services/api and infra are established, ensuring the local setup instructions match the new monorepo layout.

    - [x] Add `docs/LOCAL_MVP_TESTING.md` for the concrete local testing path.
    - [x] Add `docs/PRODUCTION_COMPOSE_PATH.md` for the first production-like Docker Compose path.
    - [x] Add `docs/HACKATHON_PITCH.md` with the defensible Stellar integration story.
    - [ ] Add API integration tests once dependencies can be installed in CI.
    - [ ] Add a CI job for `services/api` cargo fmt/test/check.

- [ ] **CI improvements**
    - Keep GitHub Actions workflows for `npm audit`, TypeScript checks, Merkle tests, Rust format and tests, and `cargo audit` for vulnerabilities.
    - Continue to run `cargo audit --deny warnings` in non-blocking mode to surface transitive advisories.
    - [x] Enable full CodeQL code scanning with uploaded results for JavaScript/TypeScript, Rust, and GitHub Actions.
    - Ensure the dependency hygiene check uses `npm ci --ignore-scripts --no-audit --no-fund` instead of lockfile diffs, to avoid metadata rewriting issues.

- [ ] **Future tasks / Gemini UI redesign**
    - Once the ticketing UI is refactored into components, coordinate with the UI/UX designer to implement the Gemini redesign using the new components as a base.
    - Keep the design modular to facilitate style updates.
    - Continue to document tradeoffs and label any mock implementations or risky shortcuts as TODO items.

---
