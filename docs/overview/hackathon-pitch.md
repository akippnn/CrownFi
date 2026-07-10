# CrownFi hackathon pitch notes

CrownFi is a pageant fan platform for voting, ticketing, contestant support, fan rewards, and digital memorabilia.

## Problem

Pageant voting and ticketing can fail under intense fan demand. Voting platforms can slow down or crash during short voting windows, while ticketing systems can suffer from counterfeits, poor ownership verification, and reseller abuse.

## CrownFi answer

CrownFi uses a scalable backend for high-volume vote intake and uses Stellar for tamper-evident public audit commitments, payments, ticket ownership, rewards, and collectible-style fan assets.

## Important framing

Do not say every vote is an on-chain transaction.

Correct explanation:

> CrownFi uses backend-first voting for speed and privacy. Stellar is used for proof commitments, ticket/payment ownership flows, and transparent audit checkpoints.

Do not say blockchain eliminates scalping.

Correct explanation:

> Blockchain tickets can reduce counterfeits, provide verifiable ownership, and give organizers programmable transfer controls. They do not fully eliminate off-platform scalping.

Do not say support payments increase voting power.

Correct explanation:

> Fan support helps contestants financially and unlocks perks, but voting remains capped and fair.

## Stellar integration

- Audit checkpoint contract stores tally hashes and Merkle roots.
- Ticket contract represents digital tickets/fan passes.
- Collectible contract represents official contestant memorabilia.
- Sale splitter contract supports transparent payment splits.
- Test USDC contract supports safe demo payments.

## MVP demo story

1. Fan opens CrownFi.
2. Fan views event and contestants.
3. Fan votes once for a contestant.
4. Duplicate vote is rejected.
5. Admin closes a round and creates a tally snapshot.
6. Snapshot hash/Merkle root is anchored.
7. Verification page proves published tally integrity.
8. Fan buys or views a digital ticket/fan pass.
9. Ticket can be verified at check-in.
