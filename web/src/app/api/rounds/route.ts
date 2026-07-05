import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJson } from "@/lib/http";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  return readJson(() =>
    db.votingRound.findMany({
      orderBy: { openedAt: "desc" },
      include: { _count: { select: { votes: true } }, checkpoint: true },
    })
  );
}

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });
  const round = await db.votingRound.create({ data: { title } });
  return NextResponse.json(round);
}
