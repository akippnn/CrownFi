import { NextRequest, NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ roundId: string }> },
) {
  const { roundId } = await context.params;
  const response = await crownfiPublicFetch(
    `/voting/rounds/${encodeURIComponent(roundId)}/anchor`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
