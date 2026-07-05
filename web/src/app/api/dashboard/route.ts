import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJson } from "@/lib/http";

export async function GET(req: NextRequest) {
  const fanId = req.nextUrl.searchParams.get("fanId");
  if (!fanId) return NextResponse.json({ error: "missing_fanId" }, { status: 400 });

  return readJson(async () => {
  const [votes, tickets, purchases] = await Promise.all([
    db.vote.findMany({
      where: { fanId },
      orderBy: { createdAt: "desc" },
      include: { contestant: true, round: true },
    }),
    db.ticket.findMany({ where: { fanId }, orderBy: { createdAt: "desc" } }),
    db.purchase.findMany({
      where: { fanId },
      orderBy: { createdAt: "desc" },
      include: { collectible: true },
    }),
  ]);

  return {
    votes: votes.map((v: any) => ({ contestant: v.contestant.name, round: v.round.title, status: v.round.status })),
    tickets: tickets.map((t: any) => ({ tier: t.tier, seat: t.seat, eventName: t.eventName, tokenId: t.tokenId })),
    collectibles: purchases.map((p: any) => ({ title: p.collectible.title, priceUsdc: p.priceUsdc, tokenId: p.tokenId })),
  };
  });
}
