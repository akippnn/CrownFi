import { NextRequest, NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ receiptHash: string }> },
) {
  const { receiptHash } = await context.params;
  const response = await crownfiPublicFetch(
    `/voting/receipts/${encodeURIComponent(receiptHash)}/proof`,
  );
  return NextResponse.json(await responseJson(response), { status: response.status });
}
