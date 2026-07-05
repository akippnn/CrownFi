import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const fans = await db.fan.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(fans);
}
