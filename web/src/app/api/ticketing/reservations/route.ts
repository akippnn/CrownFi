import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/ratelimit";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }
  const limited = rateLimit(`ticket-reservation:${session.userId}:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const ticketProductId = String(body?.ticketProductId ?? "").trim();
  const quantity = Number(body?.quantity ?? 0);
  const idempotencyKey = String(body?.idempotencyKey ?? "").trim();
  if (!ticketProductId || !Number.isSafeInteger(quantity) || quantity <= 0 || !idempotencyKey) {
    return NextResponse.json({ error: "invalid_reservation" }, { status: 400 });
  }

  const response = await crownfiInternalFetch(
    `/internal/ticketing/products/${encodeURIComponent(ticketProductId)}/reservations`,
    {
      method: "POST",
      headers: { "x-crownfi-user-id": session.userId },
      body: JSON.stringify({ quantity, idempotency_key: idempotencyKey }),
    },
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
