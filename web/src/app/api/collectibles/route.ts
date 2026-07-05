import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWallet } from "@/wallet";
import { buyCollectible } from "@/lib/stellar";
import { readJson } from "@/lib/http";

export async function GET() {
  return readJson(() =>
    db.collectible.findMany({
      orderBy: { createdAt: "desc" },
      include: { contestant: true },
    })
  );
}

// Buy a collectible: resolve wallet, mint (mock or live via the sale-splitter), record the purchase,
// and reward loyalty points. In live mode the payment split happens on-chain.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.fanId || !body?.collectibleId)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const fan = await db.fan.findUnique({ where: { id: body.fanId } });
  const collectible = await db.collectible.findUnique({ where: { id: body.collectibleId } });
  if (!fan || !collectible) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const address = fan.walletAddress ?? (await getWallet().ensureAddress(fan.handle));
  if (!fan.walletAddress) await db.fan.update({ where: { id: fan.id }, data: { walletAddress: address } });

  const buy = await buyCollectible({ toAddress: address, metadataUri: collectible.metadataUri });

  const purchase = await db.purchase.create({
    data: { fanId: fan.id, collectibleId: collectible.id, priceUsdc: collectible.priceUsdc, tokenId: buy.tokenId, mintTx: buy.txHash },
  });
  await db.fan.update({ where: { id: fan.id }, data: { points: { increment: 10 } } });

  return NextResponse.json({ ok: true, purchase, buyMode: buy.mode });
}
