import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organization_required" }, { status: 400 });
  const response = await crownfiInternalFetch(
    `/internal/access/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(session.userId)}`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const organizationId = String(body?.organizationId ?? "");
  if (!organizationId) return NextResponse.json({ error: "organization_required" }, { status: 400 });
  const response = await crownfiInternalFetch(
    `/internal/access/organizations/${encodeURIComponent(organizationId)}/members`,
    {
      method: "POST",
      body: JSON.stringify({
        actor_user_id: session.userId,
        wallet_address: String(body?.walletAddress ?? ""),
        network: String(body?.network ?? "testnet"),
        role: String(body?.role ?? "editor"),
      }),
    },
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
