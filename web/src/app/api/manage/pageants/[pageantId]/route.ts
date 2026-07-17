import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pageantId: string }> },
) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  const { pageantId } = await params;
  const response = await crownfiInternalFetch(
    `/internal/manage/pageants/${pageantId}?actor_user_id=${session.userId}`,
    {
      method: "DELETE",
      headers: {
        "x-crownfi-user-id": session.userId,
      },
    },
  );
  if (response.status === 204) {
    return new Response(null, { status: 204 });
  }
  return NextResponse.json(await responseJson(response), { status: response.status });
}
