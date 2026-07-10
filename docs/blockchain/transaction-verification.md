# Transaction verification notes

This document tracks what the app should verify when it claims something happened through Stellar/Soroban.

## Signed XDR confirmation

The backend should not blindly trust a signed XDR submitted by the browser. For payment/ticket/collectible flows, the backend should verify that the signed XDR corresponds to a transaction intent created by the server.

Current hardening pieces:

- `web/src/lib/txIntents.ts`
- `web/src/app/api/tickets/prepare-buy/route.ts`
- `web/src/app/api/tickets/confirm-buy/route.ts`
- `web/src/app/api/collectibles/prepare-buy/route.ts`
- `web/src/app/api/collectibles/confirm-buy/route.ts`

Expected checks:

- intent ID exists and is not expired;
- intent kind matches the route;
- expected buyer/admin/source account matches;
- expected transaction hash/body matches;
- tier/listing/price comes from server state or contract state, not request body.

## Audit checkpoint verification

For snapshot anchoring, the system should verify:

- snapshot ID;
- round/event/category;
- Merkle root;
- tally hash;
- total votes;
- transaction hash or contract state reference;
- mock vs live mode.

## MVP caveat

The current system demonstrates verification semantics. It is not a formal chain indexer. A production version would need a durable job/worker, retry handling, transaction confirmation polling, and possibly an indexer or RPC verification service.
