import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const address = String(body?.address ?? "").trim();
  const network = String(body?.network ?? "testnet").trim().toLowerCase();
  const purpose = String(body?.purpose ?? "login").trim().toLowerCase();
  const session = readAccountSession(request);

  if (purpose === "link" && !session) {
    return NextResponse.json({ error: "account_session_required" }, { status: 401 });
  }
  if (!["login", "link", "setup"].includes(purpose)) {
    return NextResponse.json({ error: "invalid_purpose" }, { status: 400 });
  }

  const response = await crownfiInternalFetch("/internal/identity/challenges", {
    method: "POST",
    body: JSON.stringify({
      address,
      network,
      purpose,
      requested_user_id: purpose === "link" ? session?.userId : null,
      origin: request.nextUrl.origin,
    }),
  });
  return NextResponse.json(await responseJson(response), { status: response.status });
}
