import { NextRequest, NextResponse } from "next/server";
import { createAccountSession, readAccountSession, setAccountCookie } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";
import { maskedSuffix, sealConfiguration } from "@/lib/configEnvelope";

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) {
    return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const bootstrapToken = String(body?.bootstrapToken ?? "").trim();
  if (!bootstrapToken) {
    return NextResponse.json({ error: "bootstrap_token_required" }, { status: 400 });
  }

  const integrations: Array<{
    provider: string;
    protected_value: string;
    value_suffix: string | null;
  }> = [];
  const r2 = body?.r2 && typeof body.r2 === "object" ? body.r2 : null;
  if (r2 && Object.values(r2).some((value) => String(value ?? "").trim())) {
    const endpoint = String(r2.endpoint ?? "").trim();
    const bucket = String(r2.bucket ?? "").trim();
    const accessKeyId = String(r2.accessKeyId ?? "").trim();
    const secretAccessKey = String(r2.secretAccessKey ?? "").trim();
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: "r2_configuration_incomplete" }, { status: 400 });
    }
    integrations.push({
      provider: "cloudflare-r2",
      protected_value: sealConfiguration({ endpoint, bucket, accessKeyId, secretAccessKey }),
      value_suffix: maskedSuffix(accessKeyId),
    });
  }

  const response = await crownfiInternalFetch("/internal/setup/complete", {
    method: "POST",
    body: JSON.stringify({
      bootstrap_token: bootstrapToken,
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
