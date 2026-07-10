import { NextRequest, NextResponse } from "next/server";
import { mintTestUsdc } from "@/lib/stellar";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/ip";

// Test-USDC faucet: mints demo USDC to a wallet so it can buy collectibles.
// Owner-signed by the platform (the token owner). Testnet only.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`faucet:${clientIp(req)}`);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const walletAddress = String(body?.walletAddress ?? "").trim();
  if (!walletAddress.startsWith("G") || walletAddress.length < 20)
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });

  const amountUsdc = Number(body?.amountUsdc ?? 50);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0 || amountUsdc > 500)
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  try {
    const res = await mintTestUsdc({ toAddress: walletAddress, amountUsdc });
    return NextResponse.json({ ok: true, amountUsdc, ...res });
  } catch (e: any) {
    console.error("[api/faucet] mint failed:", e);
    return NextResponse.json({ error: e?.message ?? "faucet_failed" }, { status: 500 });
  }
}
