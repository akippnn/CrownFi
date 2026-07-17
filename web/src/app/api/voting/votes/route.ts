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

  const limited = rateLimit(`durable-vote:${session.userId}:${clientIp(request)}`);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const roundId = String(body?.roundId ?? "").trim();
  const pageantContestantId = String(body?.pageantContestantId ?? "").trim();
  const idempotencyKey = String(body?.idempotencyKey ?? "").trim();
  if (!roundId || !pageantContestantId || !idempotencyKey) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const response = await crownfiInternalFetch(
    `/internal/voting/rounds/${encodeURIComponent(roundId)}/votes`,
    {
      method: "POST",
      headers: { "x-crownfi-user-id": session.userId },
      body: JSON.stringify({
        pageant_contestant_id: pageantContestantId,
        idempotency_key: idempotencyKey,
      }),
    },
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
