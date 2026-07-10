export type Ticket = {
  id: string;
  eventName: string;
  tier: string;
  seat: string;
  priceUsdc: number;
  tokenId?: string;
  status: string;
  fan: { handle: string };
};

export type TicketTierView = {
  name: string;
  price: number;
  perks: string;
};
