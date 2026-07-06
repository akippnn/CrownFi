import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildBuyTx } from "@/lib/stellar";
import { createTxIntent } from "@/lib/txIntents";

const LIVE = (process.env.STELLAR_MODE ?? "mock") === "live";

// STEP 1 of a USDC purchase: return an unsigned transaction for the buyer to sign in Freighter.
// In mock mode there's no chain, so we tell the client to fall back to the simple (mint-only) flow.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const collectibleId = String(body?.collectibleId ?? "");
  const buyerAddress = String(body?.buyerAddress ?? "").trim();

  const collectible = await db.collectible.findUnique({ where: { id: collectibleId } });
  if (!collectible) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!LIVE) return NextResponse.json({ mock: true });

  if (collectible.listingId == null)
    return NextResponse.json({ error: "not_listed" }, { status: 409 });
  if (!buyerAddress.startsWith("G"))
    return NextResponse.json({ error: "connect_wallet" }, { status: 400 });

  try {
    const { xdr, txHash } = await buildBuyTx({ buyerAddress, listingId: collectible.listingId });
    const intent = createTxIntent({
      kind: "collectible-buy",
      fanId: String(body?.fanId ?? ""),
      collectibleId,
      listingId: collectible.listingId,
      expectedSource: buyerAddress,
      txHash,
    });
    return NextResponse.json({ xdr, intentId: intent.id, priceUsdc: collectible.priceUsdc, listingId: collectible.listingId });
  } catch (e: any) {
    console.error("[api/collectibles/prepare-buy] failed:", e);
    return NextResponse.json({ error: e?.message ?? "prepare_failed" }, { status: 500 });
  }
}
