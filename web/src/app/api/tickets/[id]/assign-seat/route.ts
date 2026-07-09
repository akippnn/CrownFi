import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mockTicketsStore } from "@/lib/mockStore";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const seat = String(body?.seat ?? "");

  if (!seat) {
    return NextResponse.json({ error: "missing_seat" }, { status: 400 });
  }

  try {
    // 1. Try to update in database
    const ticket = await db.ticket.update({
      where: { id },
      data: { seat },
      include: { fan: true },
    });

    // Update in mock store too if found
    const storedIdx = mockTicketsStore.findIndex((t: any) => t.id === id);
    if (storedIdx !== -1) {
      mockTicketsStore[storedIdx] = { ...mockTicketsStore[storedIdx], seat };
    }

    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    // 2. Database unavailable, update in-memory mock store
    const storedIdx = mockTicketsStore.findIndex((t: any) => t.id === id);
    if (storedIdx !== -1) {
      mockTicketsStore[storedIdx] = { ...mockTicketsStore[storedIdx], seat };
      return NextResponse.json({ ok: true, ticket: mockTicketsStore[storedIdx] });
    }

    // Fallback mock ticket
    const fallbackTicket = {
      id: id || "demo-ticket-12345",
      eventName: "Coronation Night 2026",
      tier: "Gold",
      seat,
      priceUsdc: 100.0,
      status: "minted",
      createdAt: new Date().toISOString(),
      fan: { handle: "demo_fan" }
    };
    return NextResponse.json({ ok: true, ticket: fallbackTicket });
  }
}
