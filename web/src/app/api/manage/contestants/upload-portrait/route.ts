import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/accountAuth";
import { crownfiInternalFetch, responseJson } from "@/lib/crownfi-internal";

function adminToken() {
  return (
    process.env.CROWNFI_API_ADMIN_TOKEN?.trim() ||
    process.env.ADMIN_DEMO_TOKEN?.trim() ||
    ""
  );
}

export async function POST(request: NextRequest) {
  const session = readAccountSession(request);
  if (!session) return NextResponse.json({ error: "account_session_required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const token = adminToken();
  if (!token) return NextResponse.json({ error: "admin_token_missing" }, { status: 503 });

  const { intent } = body;

  if (intent === "presign") {
    const { organizationId, originalFilename, contentType, byteSize, sha256 } = body;
    const response = await crownfiInternalFetch(
      `/admin/platform/organizations/${organizationId}/media/upload-intents`,
      {
        method: "POST",
        headers: {
          "x-admin-demo-token": token,
          "x-crownfi-user-id": session.userId,
        },
        body: JSON.stringify({
          original_filename: originalFilename,
          content_type: contentType,
          byte_size: byteSize,
          sha256,
        }),
      },
    );
    return NextResponse.json(await responseJson(response), { status: response.status });
  }

  if (intent === "complete") {
    const { mediaAssetId, pageantContestantId } = body;
    
    // 1. Complete upload
    const completeResponse = await crownfiInternalFetch(
      `/admin/platform/media/${mediaAssetId}/complete`,
      {
        method: "POST",
        headers: {
          "x-admin-demo-token": token,
          "x-crownfi-user-id": session.userId,
        },
        body: JSON.stringify({}),
      },
    );
    if (!completeResponse.ok) {
      return NextResponse.json(await responseJson(completeResponse), { status: completeResponse.status });
    }

    // 2. Attach media to contestant as portrait
    const attachResponse = await crownfiInternalFetch(
      `/admin/platform/pageant-contestants/${pageantContestantId}/media`,
      {
        method: "POST",
        headers: {
          "x-admin-demo-token": token,
          "x-crownfi-user-id": session.userId,
        },
        body: JSON.stringify({
          media_asset_id: mediaAssetId,
          role: "portrait",
          caption: "Portrait image",
          sort_order: 0,
        }),
      },
    );
    return NextResponse.json(await responseJson(attachResponse), { status: attachResponse.status });
  }

  return NextResponse.json({ error: "unknown_intent" }, { status: 400 });
}
