import { NextRequest, NextResponse } from "next/server";
import { clearAccountCookie, readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) {
    return NextResponse.json({ account: null }, { status: 200 });
  }
  const response = await crownfiInternalFetch(
    `/internal/identity/users/${encodeURIComponent(session.userId)}`,
  );
  if (!response.ok) {
    const result = NextResponse.json({ account: null }, { status: 200 });
    clearAccountCookie(result);
    return result;
  }
  return NextResponse.json({
    account: await responseJson(response),
    currentWallet: session.currentWallet,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAccountCookie(response);
  return response;
}
