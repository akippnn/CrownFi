import { randomBytes } from "crypto";

const INTENT_TTL_MS = 10 * 60 * 1000;

type BaseIntent = {
  id: string;
  kind: "ticket-buy" | "collectible-buy" | "round-close";
  txHash: string;
  expectedSource: string;
  expiresAt: number;
};

type TicketIntent = BaseIntent & { kind: "ticket-buy"; fanId: string; tier: string; listingId: number };
type CollectibleIntent = BaseIntent & { kind: "collectible-buy"; fanId: string; collectibleId: string; listingId: number };
type RoundCloseIntent = BaseIntent & { kind: "round-close"; roundId: string };

export type TxIntent = TicketIntent | CollectibleIntent | RoundCloseIntent;
type NewTxIntent =
  | Omit<TicketIntent, "id" | "expiresAt">
  | Omit<CollectibleIntent, "id" | "expiresAt">
  | Omit<RoundCloseIntent, "id" | "expiresAt">;

const intents = new Map<string, TxIntent>();

export function createTxIntent(intent: NewTxIntent): TxIntent {
  const id = randomBytes(24).toString("base64url");
  const stored = { ...intent, id, expiresAt: Date.now() + INTENT_TTL_MS } as TxIntent;
  intents.set(id, stored);
  return stored;
}

export function consumeTxIntent(id: string): TxIntent | null {
  const intent = intents.get(id);
  intents.delete(id);
  if (!intent) return null;
  if (Date.now() > intent.expiresAt) return null;
  return intent;
}
