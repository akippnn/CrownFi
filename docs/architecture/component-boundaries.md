# CrownFi component boundaries

This document defines the component ownership rules for the UI refactor. The goal is to make the Gemini/UI redesign safe: design changes should happen in one component, not across several duplicated page sections.

## Rule

Pages should compose features. They should not own large repeated UI blocks, copy blocks, or layout sections.

A page may keep:

- route-level state;
- data loading and mutation orchestration;
- navigation and redirects;
- one-off page composition.

A page should not keep:

- reusable cards;
- modals/drawers;
- status badges;
- long copy blocks;
- QR/voucher/proof display blocks;
- business copy such as anti-scalping language;
- seat formatting helpers.

## Ticketing component map

Current first-pass extraction:

| Concern | Component / module |
|---|---|
| Ticket page hero and balance panel | `web/src/components/tickets/TicketHero.tsx` |
| Tier cards/selectors | `web/src/components/tickets/TicketTierSelector.tsx` |
| Checkout CTA | `web/src/components/tickets/TicketCheckoutPanel.tsx` |
| Post-purchase success block | `web/src/components/tickets/TicketSuccessBanner.tsx` |
| Owned ticket cards | `web/src/components/tickets/TicketList.tsx` |
| Ticket status label | `web/src/components/tickets/TicketStatusBadge.tsx` |
| Demo/voucher links | `web/src/components/tickets/TicketDemoLinks.tsx` |
| Seat assignment modal | `web/src/components/tickets/SeatAssignmentModal.tsx` |
| Ticketing copy | `web/src/lib/tickets/ticketCopy.ts` |
| Seat formatting helpers | `web/src/lib/tickets/seat.ts` |
| Shared ticket types | `web/src/components/tickets/types.ts` |

## Remaining ticketing extraction

The following pages are still large and should be split next:

- `web/src/app/tickets/[id]/page.tsx`
- `web/src/app/tickets/verify/[id]/page.tsx`
- `web/src/components/SeatMap.tsx`

Target components/modules:

- `TicketVoucher.tsx`
- `TicketQRCode.tsx`
- `TicketProofBlock.tsx`
- `TicketVerificationPanel.tsx`
- `TicketRedeemPanel.tsx`
- `lib/tickets/ticketApi.ts`
- `lib/tickets/seatMap.ts`

## Copy ownership

User-facing product/security copy should live in a shared copy module when it appears in more than one place.

Important examples:

- anti-scalping wording;
- mock/testnet mode labels;
- ticket verification explanation;
- Stellar anchoring explanation;
- production limitation warnings.

Do not duplicate this wording directly in pages. Duplicated copy is easy to miss during redesign and can reintroduce overclaims.

## Security-sensitive UI controls

UI components are not security boundaries. For actions such as ticket redemption, seat assignment, admin approval, and anchoring:

- components may hide or show controls for UX;
- server routes must still enforce authorization;
- pages/components should not imply an action is secure if backend checks are missing;
- mock/testnet flows must be labelled as such.
