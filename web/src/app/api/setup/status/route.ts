import { NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET() {
  const response = await crownfiPublicFetch("/setup/status");
  return NextResponse.json(await responseJson(response), { status: response.status });
}
