import { NextRequest, NextResponse } from "next/server";
import { createAccountSession, readAccountSession, setAccountCookie } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";
import { displaySuffix, sealConfig } from "@/lib/protectedConfig";

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) {
    return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const integrations: Array<{
    provider: string;
    protected_value: string;
    value_suffix: string | null;
  }> = [];

  const r2 = body?.r2 && typeof body.r2 === "object" ? body.r2 : null;
  if (r2 && Object.values(r2).some((value) => String(value ?? "").trim())) {
    integrations.push({
      provider: "cloudflare-r2",
      protected_value: sealConfig({
        endpoint: String(r2.endpoint ?? "").trim(),
        bucket: String(r2.bucket ?? "").trim(),
        accessKeyId: String(r2.accessKeyId ?? "").trim(),
        secretAccessKey: String(r2.secretAccessKey ?? "").trim(),
      }),
      value_suffix: displaySuffix(r2.accessKeyId),
    });
  }

  const response = await crownfiInternalFetch("/internal/setup/complete", {
    method: "POST",
    body: JSON.stringify({
      bootstrap_token: String(body?.bootstrapToken ?? ""),
      user_id: session.userId,
      display_name: String(body?.displayName ?? ""),
      email: String(body?.email ?? "").trim() || null,
      site_name: String(body?.siteName ?? "CrownFi"),
      organization_name: String(body?.organizationName ?? ""),
      organization_slug: String(body?.organizationSlug ?? ""),
      stellar_network: String(body?.stellarNetwork ?? "testnet"),
      integrations,
    }),
  });
  const data = await responseJson(response);
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const result = NextResponse.json(data, { status: response.status });
  setAccountCookie(
    result,
    createAccountSession(data.profile.id, session.currentWallet),
  );
  return result;
}
