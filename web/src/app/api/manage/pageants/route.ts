import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const response = await crownfiInternalFetch("/internal/manage/pageants", {
    method: "POST",
    body: JSON.stringify({ ...body, actor_user_id: session.userId }),
  });
  return NextResponse.json(await responseJson(response), { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const response = await crownfiInternalFetch("/internal/manage/pageants", {
    method: "PATCH",
    body: JSON.stringify({ ...body, actor_user_id: session.userId }),
  });
  return NextResponse.json(await responseJson(response), { status: response.status });
}
