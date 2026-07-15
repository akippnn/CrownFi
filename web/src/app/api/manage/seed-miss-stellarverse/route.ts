import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const response = await crownfiInternalFetch("/internal/manage/seed-miss-stellarverse", {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: session.userId,
      organization_id: body?.organizationId || null,
    }),
  });
  return NextResponse.json(await responseJson(response), { status: response.status });
}
