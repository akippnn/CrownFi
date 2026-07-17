import { NextRequest, NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(request: NextRequest) {
  const pageantId = request.nextUrl.searchParams.get("pageantId")?.trim();
  if (!pageantId) {
    return NextResponse.json({ error: "pageant_required" }, { status: 400 });
  }

  const response = await crownfiPublicFetch(
    `/voting/pageants/${encodeURIComponent(pageantId)}/rounds`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
