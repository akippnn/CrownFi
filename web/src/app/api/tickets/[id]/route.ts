import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mockTicketsStore } from "@/lib/mockStore";
import { requireAdmin } from "@/lib/adminAuth";

function findMockTicketInStore(id: string) {
  return mockTicketsStore.find((t: any) => t.id === id);
}

function getMockTicket(id: string, status = "minted") {
  const stored = findMockTicketInStore(id);
  if (stored) return { ...stored, status };

  return {
    id: id || "demo-ticket-12345",
    eventName: "Coronation Night 2026",
    tier: "Gold",
    seat: "GA-402",
    priceUsdc: 75.0,
    tokenId: "CAS-Soroban-NFT-Mock-0x38d9fa39281a",
    mintTx: "stellar-tx-mock-0x76b2c2898c0b",
    status,
    createdAt: new Date().toISOString(),
    fan: { handle: "demo_fan", walletAddress: "GBD7K2...MOCK_WALLET...R4X2Q" },
  };
}

const mockStatusStore: Record<string, string> = {};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const ticket = await db.ticket.findUnique({ where: { id }, include: { fan: true } });
    if (!ticket) {
      if (id.startsWith("demo-") || findMockTicketInStore(id)) {
        return NextResponse.json({ ok: true, ticket: getMockTicket(id, mockStatusStore[id] || "minted") });
      }
      return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ticket });
  } catch {
    return NextResponse.json({ ok: true, ticket: getMockTicket(id, mockStatusStore[id] || "minted") });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await ctx.params;
  try {
    const ticket = await db.ticket.findUnique({ where: { id }, include: { fan: true } });
    if (!ticket) {
      if (id.startsWith("demo-") || findMockTicketInStore(id)) {
        if (mockStatusStore[id] === "redeemed") {
          return NextResponse.json({ error: "ticket_already_redeemed", ticket: getMockTicket(id, "redeemed") }, { status: 400 });
        }
        mockStatusStore[id] = "redeemed";
        return NextResponse.json({ ok: true, ticket: getMockTicket(id, "redeemed") });
      }
      return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
    }

    if (ticket.status === "redeemed") return NextResponse.json({ error: "ticket_already_redeemed", ticket }, { status: 400 });

    const updatedTicket = await db.ticket.update({ where: { id }, data: { status: "redeemed" }, include: { fan: true } });
    return NextResponse.json({ ok: true, ticket: updatedTicket });
  } catch {
    const currentStatus = mockStatusStore[id] || "minted";
    if (currentStatus === "redeemed") {
      return NextResponse.json({ error: "ticket_already_redeemed", ticket: getMockTicket(id, "redeemed") }, { status: 400 });
    }
    mockStatusStore[id] = "redeemed";
    return NextResponse.json({ ok: true, ticket: getMockTicket(id, "redeemed") });
  }
}
