import { NextRequest, NextResponse } from "next/server";
import { createAccountSession, readAccountSession, setAccountCookie, verifyWalletSignature } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const challengeId = String(body?.challengeId ?? "").trim();
  const address = String(body?.address ?? "").trim();
  const network = String(body?.network ?? "testnet").trim().toLowerCase();
  const message = String(body?.message ?? "");
  const signature = String(body?.signature ?? "");
  const purpose = String(body?.purpose ?? "login").trim().toLowerCase();
  const current = readAccountSession(req);

  if (!challengeId || !address || !message || !signature) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (purpose === "link" && !current) {
    return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  }
  const verified = await verifyWalletSignature({ address, message, signature });
  if (!verified) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const response = await crownfiInternalFetch(`/internal/identity/challenges/${challengeId}/consume`, {
    method: "POST",
    body: JSON.stringify({
      address,
      network,
      message,
      requested_user_id: purpose === "link" ? current?.userId : null,
    }),
  });
  const data = await responseJson(response);
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const res = NextResponse.json(data);
  setAccountCookie(res, createAccountSession(data.profile.id, data.current_wallet));
  return res;
}
