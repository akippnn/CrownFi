# Collectibles and contestant support

CrownFi includes NFT-like digital memorabilia for pageant contestants. The purpose is fan engagement and contestant support, not increased voting power.

## Current MVP behavior

The current app has collectible catalogue and purchase flows:

- `web/src/app/contestants/page.tsx`
- `web/src/app/api/collectibles/route.ts`
- `web/src/app/api/collectibles/prepare-buy/route.ts`
- `web/src/app/api/collectibles/confirm-buy/route.ts`
- `contracts/collectible/`
- `contracts/sale-splitter/`

The `sale-splitter` contract is intended to hold listing/price data and payout split configuration rather than trusting client-supplied prices or recipients.

## Rule

Support and purchases must not multiply vote power. Use this framing:

> Support helps contestants financially and unlocks fan perks, but voting remains capped and fair.

## MVP limitations

- The current implementation is suitable for testnet/demo usage only.
- Full live settlement depends on deployed contract IDs, configured Stellar keys, and testnet funding.
- Real-money/mainnet support requires a deeper contract and backend review.
