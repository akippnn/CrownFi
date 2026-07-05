import { NextRequest, NextResponse } from "next/server";
import { readUsdcBalance } from "@/lib/stellar";

// Read a wallet's test-USDC balance (read-only). Returns 0 in mock mode.
export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  if (!address.startsWith("G")) return NextResponse.json({ balanceUsdc: 0 });
  try {
    const balanceUsdc = await readUsdcBalance(address);
    return NextResponse.json({ balanceUsdc });
  } catch (e) {
    console.error("[api/usdc-balance] read failed:", e);
    return NextResponse.json({ balanceUsdc: 0 });
  }
}
