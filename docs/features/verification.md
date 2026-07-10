# Verification and audit proofs

Verification is the main reason Stellar is useful for the voting portion of CrownFi. The backend accepts votes quickly, then periodically or manually publishes audit commitments. Raw voter personal data should not be stored on-chain.

## Current MVP flow

1. Fan submits a vote off-chain.
2. The app computes a vote leaf hash.
3. Admin closes or snapshots a round.
4. The system canonicalizes tally data.
5. The system computes a tally hash and Merkle root.
6. In mock mode, the checkpoint is stored locally with a mock transaction reference.
7. In live/testnet mode, the checkpoint is committed through the Soroban audit contract.
8. The verify page displays proof data and published tally information.

Relevant areas:

- `web/src/app/verify/page.tsx`
- `web/src/app/api/rounds/[id]/receipt/route.ts`
- `web/src/app/api/rounds/[id]/results/route.ts`
- `web/src/app/api/rounds/[id]/prepare-close/route.ts`
- `web/src/app/api/rounds/[id]/confirm-close/route.ts`
- `contracts/audit-anchor/`
- `services/api` snapshot/verify routes for the refactor path.

## Mock vs real mode

The UI must not pretend mock checkpoints are real blockchain transactions. When `STELLAR_MODE=mock`, verification should be labelled as local demo mode.

When `STELLAR_MODE=live`, verification should show:

- snapshot ID;
- event/category/round;
- canonical tally hash;
- Merkle root;
- Stellar transaction hash or Soroban contract state reference;
- timestamp;
- published tally.

## MVP acceptance path

A verification path is acceptable when a reviewer can:

1. vote once;
2. create a snapshot;
3. see a Merkle root/tally hash;
4. anchor it in mock mode;
5. open a verify page;
6. see that the vote/tally data matches the snapshot.

Full testnet verification is a follow-up unless contract IDs and a funded platform/admin wallet are configured.
