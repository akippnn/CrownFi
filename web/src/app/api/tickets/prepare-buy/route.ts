import { NextRequest, NextResponse } from "next/server";
import { buildBuyTx } from "@/lib/stellar";
import { TICKET_TIERS, tierListingId } from "@/lib/tiers";

const LIVE = (process.env.STELLAR_MODE ?? "mock") === "live";

// STEP 1 of a USDC ticket purchase: return an unsigned tx for the buyer to sign in Freighter.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const tier = String(body?.tier ?? "");
  const buyerAddress = String(body?.buyerAddress ?? "").trim();

  const listingId = tierListingId(tier);
  if (listingId == null) return NextResponse.json({ error: "unknown_tier" }, { status: 400 });

  if (!LIVE) return NextResponse.json({ mock: true });
  if (!buyerAddress.startsWith("G")) return NextResponse.json({ error: "connect_wallet" }, { status: 400 });

  try {
    const { xdr } = await buildBuyTx({ buyerAddress, listingId });
    return NextResponse.json({ xdr, tier, priceUsdc: (TICKET_TIERS as any)[tier].priceUsdc, listingId });
  } catch (e: any) {
    console.error("[api/tickets/prepare-buy] failed:", e);
    return NextResponse.json({ error: e?.message ?? "prepare_failed" }, { status: 500 });
  }
}
