import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, setAdminCookie, verifyAdminSignature } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address = String(body?.address ?? "").trim();
  const message = String(body?.message ?? "");
  const signature = String(body?.signature ?? "");

  if (!address || !message || !signature) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const verified = await verifyAdminSignature({ address, message, signature });
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const res = NextResponse.json({ ok: true });
  setAdminCookie(res, createAdminSession(address));
  return res;
}
