import { NextRequest, NextResponse } from "next/server";
import { buildBuyTx, buildXlmBuyTx } from "@/lib/stellar";
import { TICKET_TIERS, tierListingId } from "@/lib/tiers";
import { createTxIntent } from "@/lib/txIntents";

const LIVE = (process.env.STELLAR_MODE ?? "mock") === "live";

// STEP 1 of a USDC or XLM ticket purchase: return an unsigned tx for the buyer to sign in Freighter.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const tier = String(body?.tier ?? "");
  const buyerAddress = String(body?.buyerAddress ?? "").trim();
  const paymentMethod = String(body?.paymentMethod ?? "usdc").toLowerCase();

  const listingId = tierListingId(tier);
  if (listingId == null) return NextResponse.json({ error: "unknown_tier" }, { status: 400 });

  if (!LIVE) return NextResponse.json({ mock: true });
  if (!buyerAddress.startsWith("G")) return NextResponse.json({ error: "connect_wallet" }, { status: 400 });

  try {
    let xdr: string;
    let txHash: string;
    const priceUsdc = (TICKET_TIERS as any)[tier].priceUsdc;

    if (paymentMethod === "xlm") {
      const priceXlm = priceUsdc * 10; // 1 USDC = 10 XLM
      const payeeAddress = process.env.EVENT_TREASURY_PAYOUT || "GC3PXGAWQWHHV6M6AKR3LSZZ7RNYZXASGNJM7BSU3EMWI5KG2R5QSIY3";
      const tx = await buildXlmBuyTx({ buyerAddress, priceXlm, payeeAddress });
      xdr = tx.xdr;
      txHash = tx.txHash;
    } else {
      const tx = await buildBuyTx({ buyerAddress, listingId });
      xdr = tx.xdr;
      txHash = tx.txHash;
    }

    const intent = createTxIntent({ kind: "ticket-buy", fanId: String(body?.fanId ?? ""), tier, listingId, expectedSource: buyerAddress, txHash });
    return NextResponse.json({ xdr, intentId: intent.id, tier, priceUsdc, listingId, paymentMethod });
  } catch (e: any) {
    console.error("[api/tickets/prepare-buy] failed:", e);
    return NextResponse.json({ error: e?.message ?? "prepare_failed" }, { status: 500 });
  }
}
