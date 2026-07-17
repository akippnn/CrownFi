import { NextRequest, NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ marketId: string }> },
) {
  const { marketId } = await context.params;
  const response = await crownfiPublicFetch(
    `/markets/${encodeURIComponent(marketId)}/settlement-status`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
