import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const fans = await db.fan.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(fans);
}
