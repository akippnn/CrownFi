import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildBuyTx, buildXlmBuyTx } from "@/lib/stellar";
import { createTxIntent } from "@/lib/txIntents";

const LIVE = (process.env.STELLAR_MODE ?? "mock") === "live";

// STEP 1 of a USDC or XLM purchase: return an unsigned transaction for the buyer to sign in Freighter.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const collectibleId = String(body?.collectibleId ?? "");
  const buyerAddress = String(body?.buyerAddress ?? "").trim();
  const paymentMethod = String(body?.paymentMethod ?? "usdc").toLowerCase();

  const collectible = await db.collectible.findUnique({ where: { id: collectibleId } });
  if (!collectible) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!LIVE) return NextResponse.json({ mock: true });

  if (collectible.listingId == null)
    return NextResponse.json({ error: "not_listed" }, { status: 409 });
  if (!buyerAddress.startsWith("G"))
    return NextResponse.json({ error: "connect_wallet" }, { status: 400 });

  try {
    let xdr: string;
    let txHash: string;

    if (paymentMethod === "xlm") {
      const priceXlm = collectible.priceUsdc * 10; // 1 USDC = 10 XLM
      const payeeAddress = process.env.DEMO_CONTESTANT_PAYOUT || "GCK4VGS6VXHJCUZV3U4ACMKS77NYRWXITTFE6PW5P2DRJV6B7GN34S2J";
      const tx = await buildXlmBuyTx({ buyerAddress, priceXlm, payeeAddress });
      xdr = tx.xdr;
      txHash = tx.txHash;
    } else {
      const tx = await buildBuyTx({ buyerAddress, listingId: collectible.listingId });
      xdr = tx.xdr;
      txHash = tx.txHash;
    }

    const intent = createTxIntent({
      kind: "collectible-buy",
      fanId: String(body?.fanId ?? ""),
      collectibleId,
      listingId: collectible.listingId,
      expectedSource: buyerAddress,
      txHash,
    });
    return NextResponse.json({ xdr, intentId: intent.id, priceUsdc: collectible.priceUsdc, listingId: collectible.listingId, paymentMethod });
  } catch (e: any) {
    console.error("[api/collectibles/prepare-buy] failed:", e);
    return NextResponse.json({ error: e?.message ?? "prepare_failed" }, { status: 500 });
  }
}
