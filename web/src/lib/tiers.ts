// Ticket tiers, mapped to their on-chain sale-splitter listing ids.
// Listings 101/102/103 are registered on the sale-splitter (payee = event treasury).
export const TICKET_TIERS = {
  Silver: { listingId: 101, priceUsdc: 50, perks: "General admission" },
  Gold: { listingId: 102, priceUsdc: 100, perks: "Priority seating + merch discount" },
  Diamond: { listingId: 103, priceUsdc: 200, perks: "Front row + meet & greet" },
} as const;

export type TierName = keyof typeof TICKET_TIERS;

export const TIER_LIST = (Object.keys(TICKET_TIERS) as TierName[]).map((name) => ({
  name,
  ...TICKET_TIERS[name],
}));

export function tierListingId(tier: string): number | null {
  return (TICKET_TIERS as any)[tier]?.listingId ?? null;
}
