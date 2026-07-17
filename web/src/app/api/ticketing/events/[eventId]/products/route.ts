import { NextRequest, NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const response = await crownfiPublicFetch(
    `/ticketing/events/${encodeURIComponent(eventId)}/products`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
