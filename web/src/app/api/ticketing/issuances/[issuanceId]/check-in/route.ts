import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/ratelimit";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ issuanceId: string }> },
) {
  const session = readAccountSession(request);
  if (!session) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }
  const limited = rateLimit(`ticket-check-in:${session.userId}:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { issuanceId } = await context.params;
  const body = await request.json().catch(() => null);
  const nonce = String(body?.nonce ?? "").trim();
  const deviceReference = String(body?.deviceReference ?? "").trim() || null;
  const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
  if (!nonce) {
    return NextResponse.json({ error: "check_in_nonce_required" }, { status: 400 });
  }

  const response = await crownfiInternalFetch(
    `/internal/ticketing/issuances/${encodeURIComponent(issuanceId)}/check-in`,
    {
      method: "POST",
      headers: { "x-crownfi-user-id": session.userId },
      body: JSON.stringify({
        nonce,
        device_reference: deviceReference,
        metadata,
      }),
    },
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
