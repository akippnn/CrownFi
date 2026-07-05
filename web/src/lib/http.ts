import { NextResponse } from "next/server";

// Wrap a read handler so a database/connection failure returns a clean 503 JSON body
// (and a server-side log) instead of throwing — which would send an empty/HTML response
// that makes the client's `r.json()` fail with "Unexpected end of JSON input".
export async function readJson(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    console.error("[api] read failed (is the database configured? see SUPABASE.md):", e);
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }
}
