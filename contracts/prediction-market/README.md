# CrownFi Prediction Market v2

This Soroban contract is a testnet-only implementation target for CrownFi pageant prediction markets. It deliberately replaces the unrelated-history prototype instead of copying it.

## Safety properties

- Market fee, resolver, treasury, close time, and review delay are immutable per market.
- Resolution cannot be proposed before the advertised close time.
- Resolution is two-step: a result hash and winning option are published, then finalized only after the configured review delay.
- The fee applies to profit, not returned principal.
- The final winning claimant receives any integer-division remainder, so the escrowed pool is fully distributed.
- Emergency pause blocks new stakes but does not block users from unstaking before close.
- Cancellation enables full, one-time refunds.
- Persistent market, pool, position, and claim records renew their Soroban TTL when accessed.

## Boundary

The contract does not determine whether a market is lawful in a jurisdiction and does not provide an oracle. CrownFi must keep the feature disabled outside explicit testnet/demo environments until eligibility, KYC, age, geofencing, market moderation, and resolution governance are defined.
