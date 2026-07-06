import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Sign in with a Stellar wallet. Creates the fan on first connect, returns it thereafter.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const walletAddress = String(b?.walletAddress ?? "").trim();
  if (!walletAddress.startsWith("G") || walletAddress.length < 20)
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });

  try {
    const fan = await db.fan.upsert({
      where: { walletAddress },
      update: {},
      create: { handle: `fan_${walletAddress.slice(-6)}`, walletAddress },
    });
    return NextResponse.json(fan);
  } catch (e) {
    console.error("[api/fans/connect] db write failed (is the database configured? see SUPABASE.md):", e);
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }
}
