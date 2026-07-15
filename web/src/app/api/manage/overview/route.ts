import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) {
    return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  }
  const response = await crownfiInternalFetch(
    `/internal/manage/overview/${encodeURIComponent(session.userId)}`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
