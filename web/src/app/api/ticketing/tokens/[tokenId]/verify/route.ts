import { NextRequest, NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await context.params;
  const response = await crownfiPublicFetch(
    `/ticketing/tokens/${encodeURIComponent(tokenId)}/verify`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
