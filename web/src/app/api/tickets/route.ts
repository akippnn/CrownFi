import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWallet } from "@/wallet";
import { mintTicket } from "@/lib/stellar";
import { mockTicketsStore } from "@/lib/mockStore";
import { TICKET_TIERS, type TierName } from "@/lib/tiers";

const LIVE = (process.env.STELLAR_MODE ?? "mock") === "live";
const DEMO_EVENT_NAME = "Coronation Night 2026";

function isTierName(tier: string): tier is TierName {
  return Object.prototype.hasOwnProperty.call(TICKET_TIERS, tier);
}

export async function GET() {
  try {
    const tickets = await db.ticket.findMany({
      orderBy: { createdAt: "desc" },
      include: { fan: true },
    });
    return NextResponse.json(tickets);
  } catch {
    console.warn("[api/tickets] database unavailable, returning in-memory mock tickets.");
    return NextResponse.json(mockTicketsStore);
  }
}

// Mock/dev purchase path only. Live purchases must use prepare-buy -> Freighter -> confirm-buy.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "mock_disabled_in_production" }, { status: 403 });
  }
  if (LIVE) return NextResponse.json({ error: "use_prepare_confirm_flow" }, { status: 409 });

  const body = await req.json().catch(() => null);
  const fanId = String(body?.fanId ?? "").trim();
  const tier = String(body?.tier ?? "").trim();
  const seat = body?.seat ? String(body.seat) : "Unassigned";

  if (!fanId || !tier) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (!isTierName(tier)) return NextResponse.json({ error: "invalid_tier" }, { status: 400 });

  const tierConfig = TICKET_TIERS[tier];

  let fan: { id: string; handle: string; walletAddress?: string | null } | null = null;
  try {
    fan = await db.fan.findUnique({ where: { id: fanId } });
    if (!fan) return NextResponse.json({ error: "fan_not_found" }, { status: 404 });
  } catch {
    // Offline demo fallback only for mock fans created by /api/fans/connect when DB is unavailable.
    if (!fanId.startsWith("mock-fan-")) return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
    fan = { id: fanId, handle: `fan_${fanId.slice(-6)}`, walletAddress: `G${"A".repeat(55)}` };
  }

  const address = fan.walletAddress ?? (await getWallet().ensureAddress(fan.handle));
  let tokenId = `mock-token-id-${Math.floor(Math.random() * 100000)}`;
  let mintTx = `mock-tx-hash-${Math.floor(Math.random() * 1000000)}`;

  try {
    const mint = await mintTicket({ toAddress: address, eventName: DEMO_EVENT_NAME, tier, seat });
    tokenId = mint.tokenId || tokenId;
    mintTx = mint.txHash || mintTx;
  } catch {
    // Ignore blockchain mint failure in offline mock testing.
  }

  const ticketData = {
    id: `mock-ticket-${Math.floor(Math.random() * 1000000)}`,
    fanId: fan.id,
    eventName: DEMO_EVENT_NAME,
    tier,
    seat,
    priceUsdc: tierConfig.priceUsdc,
    tokenId,
    mintTx,
    status: "minted",
    createdAt: new Date().toISOString(),
    fan: { handle: fan.handle, walletAddress: address },
  };

  try {
    const ticket = await db.ticket.create({
      data: {
        fanId: fan.id,
        eventName: DEMO_EVENT_NAME,
        tier,
        seat,
        priceUsdc: tierConfig.priceUsdc,
        tokenId,
        mintTx,
      },
      include: { fan: true },
    });
    mockTicketsStore.unshift(ticket);
    return NextResponse.json({ ok: true, ticket });
  } catch {
    console.warn("[api/tickets] database unavailable, saving mock ticket to in-memory store.");
    mockTicketsStore.unshift(ticketData);
    return NextResponse.json({ ok: true, ticket: ticketData });
  }
}
