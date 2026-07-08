# Ticketing System Guide

A complete guide for developers working on the CrownFi ticketing system — covering the purchase flow, voucher printing, QR code verification, Freighter wallet integration, and deployment.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [End-to-End Purchase Flow](#2-end-to-end-purchase-flow)
3. [File Reference Map](#3-file-reference-map)
4. [Voucher Print & PDF Export](#4-voucher-print--pdf-export)
5. [QR Code Verification & Redemption](#5-qr-code-verification--redemption)
6. [Freighter Wallet Integration](#6-freighter-wallet-integration)
7. [Mock Mode vs Live Mode](#7-mock-mode-vs-live-mode)
8. [Environment Variables](#8-environment-variables)
9. [Local Testing (No Database Required)](#9-local-testing-no-database-required)
10. [Deployment — Database + Blockchain](#10-deployment--database--blockchain)
11. [Testing Checklist](#11-testing-checklist)
12. [Known Limitations & Future Work](#12-known-limitations--future-work)

---

## 1. Architecture Overview

The ticketing system has four main components:

| Component | Route | Purpose |
|-----------|-------|---------|
| **Dashboard** | `/tickets` | Tier selector, buy button, owned tickets list, post-purchase success banner |
| **Claim Voucher** | `/tickets/[id]` | Printable voucher with QR code, event details, buyer info, on-chain proof |
| **Verification Scanner** | `/tickets/verify/[id]` | QR scan target — shows ticket validity, allows usher to redeem |
| **API** | `/api/tickets/...` | Purchase flow, ticket lookup, and redemption endpoints |

---

## 2. End-to-End Purchase Flow

```
USER CLICKS "BUY GOLD TICKET"
│
├─ 1. POST /api/tickets/prepare-buy
│     Body: { tier: "Gold", buyerAddress: "G..." }
│
├─ 2a. MOCK MODE → API returns { mock: true }
│      → Frontend POSTs to /api/tickets to create record
│      → Ticket saved with mock tokenId/mintTx
│
├─ 2b. LIVE MODE → API returns unsigned XDR
│      → Freighter popup asks user to sign USDC payment
│      → Signed XDR POSTed to /api/tickets/confirm-buy
│      → Backend submits payment + mints NFT on Stellar
│      → Ticket saved with real tokenId + txHash
│
├─ 3. Success banner appears with:
│     → "View Claim Voucher" → /tickets/[id]
│     → "Test QR Verification" → /tickets/verify/[id]
│
├─ 4. Voucher page renders with dynamic QR code
│     → QR encodes: /tickets/verify/[id]
│     → "Print / Save PDF" triggers window.print()
│
└─ 5. QR scanned at venue entrance
      → /tickets/verify/[id] checks status
      → Usher clicks "Confirm & Redeem"
      → POST /api/tickets/[id] sets status = "redeemed"
      → Future scans show "Already Redeemed"
```

---

## 3. File Reference Map

| File | Purpose |
|------|---------|
| `web/src/app/tickets/page.tsx` | Dashboard: tier selector, buy button, ticket cards, success banner |
| `web/src/app/tickets/[id]/page.tsx` | Printable voucher: QR code, transaction table, buyer info, on-chain proof |
| `web/src/app/tickets/verify/[id]/page.tsx` | Verification: status check, ticket details, redeem button |
| `web/src/app/api/tickets/route.ts` | `GET` list tickets, `POST` create ticket (mock purchase) |
| `web/src/app/api/tickets/[id]/route.ts` | `GET` single ticket, `POST` mark as redeemed |
| `web/src/app/api/tickets/prepare-buy/route.ts` | Build unsigned Soroban XDR for Freighter |
| `web/src/app/api/tickets/confirm-buy/route.ts` | Submit signed XDR, mint NFT, save ticket |
| `web/src/lib/stellar.ts` | Soroban calls: `mintTicket`, `buildBuyTx`, `submitSignedXdr` |
| `web/src/wallet/freighter.ts` | Freighter adapter: connect, sign, get address |
| `web/src/session/SessionProvider.tsx` | Session context: wallet address, fan identity, admin status |
| `web/prisma/schema.prisma` | Database schema including the `Ticket` model |

---

## 4. Voucher Print & PDF Export

The "Print / Save PDF" button calls `window.print()`. Embedded `@media print` CSS:

- Hides all app navigation (header, bottom tabs, sidebar).
- Renders the voucher at full width without app margins.
- Preserves colors via `print-color-adjust: exact`.
- Users save to PDF via their browser's "Save as PDF" printer option.

The voucher layout includes:
- **Tier-colored gradient** header (Silver / Gold / Diamond).
- **Event card** with tier, seat, and price.
- **Transaction table** with line items and total.
- **Buyer info cards** with wallet address.
- **On-chain proof block** showing NFT Token ID and Stellar tx hash.
- **QR code** with decorative corner brackets.
- **Tear-off line** with scissors icon.
- **Terms & conditions** and CrownFi issuer footer.

---

## 5. QR Code Verification & Redemption

Every voucher QR code encodes: `https://<host>/tickets/verify/<ticket_id>`

When scanned:

1. Page calls `GET /api/tickets/<id>` to fetch ticket status.
2. If `status === "minted"` → **green "Valid Ticket"** banner with "Confirm & Redeem" button.
3. Usher clicks "Confirm & Redeem" → `POST /api/tickets/<id>` updates status to `"redeemed"`.
4. Any future scan → **red "Already Redeemed"** banner with lock icon.

**Single-use enforcement** is at the database level. The `POST` handler checks `if (ticket.status === "redeemed")` and returns `400` before updating.

---

## 6. Freighter Wallet Integration

### Connection
1. User clicks "Connect Freighter" in the app header.
2. `connectFreighter()` checks if the extension is installed, then calls `requestAccess()`.
3. The returned `G...` address is saved to the `Fan` database record and `localStorage`.

### Transaction Signing (Live Mode)
1. Backend builds unsigned Soroban XDR via `buildBuyTx()`.
2. Frontend calls `signWithFreighter(xdr, address)` → Freighter popup opens.
3. User approves → signed XDR returned to frontend.
4. Frontend POSTs signed XDR to `/api/tickets/confirm-buy`.
5. Backend submits payment and mints NFT on-chain.

### Network
Freighter is pinned to **Stellar Testnet**. If the user's Freighter is on a different network, connection is rejected with a clear error.

---

## 7. Mock Mode vs Live Mode

| Feature | Mock (`STELLAR_MODE=mock`) | Live (`STELLAR_MODE=live`) |
|---------|---------------------------|---------------------------|
| Wallet connection | Works (Freighter popup) | Works (Freighter popup) |
| USDC payment | Simulated | Real USDC on Stellar |
| NFT minting | Returns synthetic tokenId | Calls Soroban contract |
| Transaction hash | Mock hash | Real Stellar tx hash |
| Database record | ✅ Created | ✅ Created |
| Voucher & QR verify | ✅ Works | ✅ Works |

The voucher and verification pages work identically in both modes. The only difference is whether the `tokenId` and `mintTx` values are simulated or real.

---

## 8. Environment Variables

Set in `web/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes (for DB) | — | Supabase pooled connection (port 6543) |
| `DIRECT_URL` | Yes (for DB) | — | Supabase direct connection (port 5432) |
| `STELLAR_MODE` | No | `"mock"` | `"mock"` or `"live"` |
| `WALLET_PROVIDER` | No | `"mock"` | `"mock"` or `"privy"` |
| `TICKET_CONTRACT_ID` | Live only | — | Deployed Soroban ticket NFT contract (`C...`) |
| `STELLAR_PLATFORM_SECRET` | Live only | — | Platform secret key for minting (`S...`) |
| `NEXT_PUBLIC_ADMIN_WALLETS` | No | — | Comma-separated `G...` addresses for admin |

---

## 9. Local Testing (No Database Required)

The API includes an in-memory mock fallback. Preview the full flow immediately:

- **Voucher Layout:** `http://localhost:3000/tickets/demo-ticket-12345`
- **Verification Scanner:** `http://localhost:3000/tickets/verify/demo-ticket-12345`

Redemption on the demo ID saves status in memory, so you can watch the scanner swap from Valid (green) to Redeemed (red).

### Freighter Mock Fallback
For ease of local testing, if the Freighter extension is not installed in the browser, clicking the **"Connect Freighter"** button in the header will automatically generate a mock developer Stellar address (e.g. `GDEMO...`) and connect it. This allows developers to test the live `/tickets` purchase buttons, see the post-purchase voucher redirection banner, and cast votes on the `/vote` page immediately without installing browser extensions.

To start the dev server:
```bash
cd web
npm install
npm run dev
```

---

## 10. Deployment — Database + Blockchain

### Step 1: Database
Configure Postgres in `web/.env` (see [`SUPABASE.md`](./SUPABASE.md)):
```dotenv
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Run migrations and seed:
```bash
cd web
npx prisma migrate dev --name init
npm run seed
```

### Step 2: Blockchain (Optional)
Deploy contracts to Stellar Testnet (see [`DEPLOY.md`](./DEPLOY.md)), then update `.env`:
```dotenv
STELLAR_MODE="live"
TICKET_CONTRACT_ID="C..."
STELLAR_PLATFORM_SECRET="S..."
```

---

## 11. Testing Checklist

### Without Database (Demo Mode)
- [ ] Visit `/tickets/demo-ticket-12345` → voucher renders with mock data
- [ ] Click "Print / Save PDF" → browser print dialog opens, layout is clean
- [ ] Visit `/tickets/verify/demo-ticket-12345` → shows "Valid Ticket" (green)
- [ ] Click "Confirm & Redeem" → changes to "Already Redeemed" (red)
- [ ] Reload → still shows "Already Redeemed"

### With Database (Mock Stellar)
- [ ] Connect Freighter wallet
- [ ] Select a tier and click "Buy" → success banner appears
- [ ] Click "View Claim Voucher" → voucher renders with real database data
- [ ] Scan QR code → shows valid ticket
- [ ] Click "Confirm & Redeem" → ticket marked as redeemed in database
- [ ] Return to `/tickets` → ticket card shows "redeemed" badge

### With Database + Live Stellar
- [ ] Deploy contracts to Testnet
- [ ] Set `STELLAR_MODE=live` and contract IDs
- [ ] Get test USDC from faucet
- [ ] Buy a ticket → Freighter popup for USDC payment
- [ ] Voucher shows real Stellar transaction hash and NFT Token ID

---

## 12. Known Limitations & Future Work

| Limitation | Suggested Fix |
|-----------|---------------|
| QR code uses external API (`api.qrserver.com`) | Use `qrcode.react` for offline generation |
| Redemption is not role-gated | Add server-side admin wallet check on `POST /api/tickets/[id]` |
| No email on purchase | Integrate email service to send voucher PDF |
| No image export | Add `html2canvas` to export voucher as PNG |
| No ticket transfer/resale | Build transfer page with Soroban NFT transfer |
| Single event hardcoded | Make event name configurable from admin panel |
