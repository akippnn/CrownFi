import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mockTicketsStore } from "@/lib/mockStore";
import { requireAdmin } from "@/lib/adminAuth";

const SEAT_RE = /^(Diamond|Platinum|Gold|Silver)?\s*([A-Z]+-\d{1,3}|Row\s+\d{1,3}\s+Seat\s+\d{1,3}|Unassigned)$/i;

function isAuthorizedOwnerOrAdmin(req: NextRequest, ticketFanId: string, bodyFanId: string): boolean {
  const admin = requireAdmin(req);
  if (!(admin instanceof NextResponse)) return true;
  return Boolean(bodyFanId && bodyFanId === ticketFanId);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const seat = String(body?.seat ?? "").trim();
  const fanId = String(body?.fanId ?? "").trim();

  if (!seat) return NextResponse.json({ error: "missing_seat" }, { status: 400 });
  if (!SEAT_RE.test(seat)) return NextResponse.json({ error: "invalid_seat" }, { status: 400 });

  try {
    const existing = await db.ticket.findUnique({ where: { id }, include: { fan: true } });
    if (!existing) return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
    if (!isAuthorizedOwnerOrAdmin(req, existing.fanId, fanId)) {
      return NextResponse.json({ error: "not_ticket_owner_or_admin" }, { status: 403 });
    }

    const ticket = await db.ticket.update({ where: { id }, data: { seat }, include: { fan: true } });

    const storedIdx = mockTicketsStore.findIndex((t: any) => t.id === id);
    if (storedIdx !== -1) mockTicketsStore[storedIdx] = { ...mockTicketsStore[storedIdx], seat };

    return NextResponse.json({ ok: true, ticket });
  } catch {
    const storedIdx = mockTicketsStore.findIndex((t: any) => t.id === id);
    if (storedIdx === -1) return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });

    const stored = mockTicketsStore[storedIdx] as any;
    if (!isAuthorizedOwnerOrAdmin(req, stored.fanId, fanId)) {
      return NextResponse.json({ error: "not_ticket_owner_or_admin" }, { status: 403 });
    }

    mockTicketsStore[storedIdx] = { ...stored, seat };
    return NextResponse.json({ ok: true, ticket: mockTicketsStore[storedIdx] });
  }
}
