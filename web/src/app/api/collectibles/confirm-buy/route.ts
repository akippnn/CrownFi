import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submitSignedXdr, mintCollectible } from "@/lib/stellar";

// STEP 2 of a USDC purchase: submit the buyer's signed transaction (the USDC split), then mint the
// collectible NFT to them and record the purchase (+10 loyalty points).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const collectibleId = String(body?.collectibleId ?? "");
  const fanId = String(body?.fanId ?? "");
  const signedXdr = String(body?.signedXdr ?? "");
  if (!collectibleId || !fanId || !signedXdr)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const [fan, collectible] = await Promise.all([
    db.fan.findUnique({ where: { id: fanId } }),
    db.collectible.findUnique({ where: { id: collectibleId } }),
  ]);
  if (!fan || !collectible) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!fan.walletAddress) return NextResponse.json({ error: "no_wallet" }, { status: 400 });

  try {
    // 1) Submit the buyer-signed USDC split.
    const payment = await submitSignedXdr(signedXdr);
    // 2) Mint the collectible NFT to the buyer (platform-signed).
    const mint = await mintCollectible({ toAddress: fan.walletAddress, metadataUri: collectible.metadataUri });
    // 3) Record the purchase + reward loyalty.
    const purchase = await db.purchase.create({
      data: { fanId: fan.id, collectibleId: collectible.id, priceUsdc: collectible.priceUsdc, tokenId: mint.tokenId, mintTx: mint.txHash },
    });
    await db.fan.update({ where: { id: fan.id }, data: { points: { increment: 10 } } });

    return NextResponse.json({ ok: true, purchase, paymentTx: payment.txHash, mintTx: mint.txHash });
  } catch (e: any) {
    console.error("[api/collectibles/confirm-buy] failed:", e);
    return NextResponse.json({ error: e?.message ?? "confirm_failed" }, { status: 500 });
  }
}
