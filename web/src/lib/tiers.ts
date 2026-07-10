// Ticket tiers, mapped to their on-chain sale-splitter listing ids.
// Listings 101–104 are registered on the sale-splitter (payee = event treasury).
// Ordered front-to-back: Diamond (front row) → Platinum → Gold → Silver (general).
export const TICKET_TIERS = {
  Diamond: { listingId: 103, priceUsdc: 200, perks: "Front row + meet & greet", zone: 1, color: "#d4af37" },
  Platinum: { listingId: 104, priceUsdc: 150, perks: "Premium seating + backstage pass", zone: 2, color: "#7c3aed" },
  Gold: { listingId: 102, priceUsdc: 100, perks: "Priority seating + merch discount", zone: 3, color: "#f59e0b" },
  Silver: { listingId: 101, priceUsdc: 50, perks: "General admission", zone: 4, color: "#94a3b8" },
} as const;

export type TierName = keyof typeof TICKET_TIERS;

export const TIER_LIST = (Object.keys(TICKET_TIERS) as TierName[]).map((name) => ({
  name,
  ...TICKET_TIERS[name],
}));

export function tierListingId(tier: string): number | null {
  return (TICKET_TIERS as any)[tier]?.listingId ?? null;
}
