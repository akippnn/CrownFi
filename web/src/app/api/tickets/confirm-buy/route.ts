import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submitSignedXdr, mintTicket } from "@/lib/stellar";
import { TICKET_TIERS, tierListingId } from "@/lib/tiers";

// STEP 2 of a USDC ticket purchase: submit the buyer-signed USDC payment, then mint the ticket NFT.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const tier = String(body?.tier ?? "");
  const fanId = String(body?.fanId ?? "");
  const signedXdr = String(body?.signedXdr ?? "");
  if (!fanId || !signedXdr || tierListingId(tier) == null)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const fan = await db.fan.findUnique({ where: { id: fanId } });
  if (!fan) return NextResponse.json({ error: "fan_not_found" }, { status: 404 });
  if (!fan.walletAddress) return NextResponse.json({ error: "no_wallet" }, { status: 400 });

  const priceUsdc = (TICKET_TIERS as any)[tier].priceUsdc as number;
  const seat = `GA-${Math.floor(Math.random() * 900 + 100)}`;

  try {
    // 1) Submit the buyer-signed USDC payment (split to the event treasury).
    const payment = await submitSignedXdr(signedXdr);
    // 2) Mint the ticket NFT to the buyer (platform-signed).
    const mint = await mintTicket({ toAddress: fan.walletAddress, eventName: "Coronation Night 2026", tier, seat });
    // 3) Record it.
    const ticket = await db.ticket.create({
      data: { fanId: fan.id, eventName: "Coronation Night 2026", tier, seat, priceUsdc, tokenId: mint.tokenId, mintTx: mint.txHash },
    });
    return NextResponse.json({ ok: true, ticket, paymentTx: payment.txHash, mintTx: mint.txHash });
  } catch (e: any) {
    console.error("[api/tickets/confirm-buy] failed:", e);
    return NextResponse.json({ error: e?.message ?? "confirm_failed" }, { status: 500 });
  }
}
