import { NextRequest, NextResponse } from "next/server";
import { readUsdcBalance, readXlmBalance } from "@/lib/stellar";

// Read a wallet's test-USDC and native XLM balances (read-only).
export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  if (!address.startsWith("G")) return NextResponse.json({ balanceUsdc: 0, balanceXlm: 0 });
  try {
    const [balanceUsdc, balanceXlm] = await Promise.all([
      readUsdcBalance(address),
      readXlmBalance(address)
    ]);
    return NextResponse.json({ balanceUsdc, balanceXlm });
  } catch (e) {
    console.error("[api/usdc-balance] read failed:", e);
    return NextResponse.json({ balanceUsdc: 0, balanceXlm: 0 });
  }
}
