import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

async function requireSiteAdministrator(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return { error: "account_session_required", status: 401 } as const;
  const profileResponse = await crownfiInternalFetch(
    `/internal/identity/users/${encodeURIComponent(session.userId)}`,
  );
  const profile = await responseJson(profileResponse);
  if (!profileResponse.ok || !["owner", "admin"].includes(profile.site_role)) {
    return { error: "site_administrator_required", status: 403 } as const;
  }
  return { session } as const;
}

export async function GET(request: NextRequest) {
  const authorization = await requireSiteAdministrator(request);
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  const response = await crownfiInternalFetch("/internal/site-settings");
  return NextResponse.json(await responseJson(response), { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireSiteAdministrator(request);
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  const body = await request.json().catch(() => null);
  const response = await crownfiInternalFetch("/internal/site-settings", {
    method: "PATCH",
    body: JSON.stringify({
      ...body,
      actor_user_id: authorization.session.userId,
    }),
  });
  return NextResponse.json(await responseJson(response), { status: response.status });
}
