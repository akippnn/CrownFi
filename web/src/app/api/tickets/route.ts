import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWallet } from "@/wallet";
import { mintTicket } from "@/lib/stellar";
import { readJson } from "@/lib/http";

export async function GET() {
  return readJson(() =>
    db.ticket.findMany({
      orderBy: { createdAt: "desc" },
      include: { fan: true },
    })
  );
}

// Purchase a ticket: resolve the fan's wallet, mint the NFT (mock or live), persist.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.fanId || !body?.eventName || !body?.tier)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const fan = await db.fan.findUnique({ where: { id: body.fanId } });
  if (!fan) return NextResponse.json({ error: "fan_not_found" }, { status: 404 });

  const address = fan.walletAddress ?? (await getWallet().ensureAddress(fan.handle));
  if (!fan.walletAddress)
    await db.fan.update({ where: { id: fan.id }, data: { walletAddress: address } });

  const seat = body.seat ?? `GA-${Math.floor(Math.random() * 900 + 100)}`;
  const mint = await mintTicket({ toAddress: address, eventName: body.eventName, tier: body.tier, seat });

  const ticket = await db.ticket.create({
    data: {
      fanId: fan.id,
      eventName: body.eventName,
      tier: body.tier,
      seat,
      priceUsdc: Number(body.priceUsdc ?? 50),
      tokenId: mint.tokenId,
      mintTx: mint.txHash,
    },
  });

  return NextResponse.json({ ok: true, ticket, mintMode: mint.mode });
}
