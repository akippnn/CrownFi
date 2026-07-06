import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJson } from "@/lib/http";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  return readJson(() => db.organizerRequest.findMany({ orderBy: { createdAt: "desc" } }));
}

// Public: an organizer submits an application to run a pageant.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const need = ["orgName", "contactName", "email", "pageantName", "country"];
  for (const k of need) if (!String(b?.[k] ?? "").trim()) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const created = await db.organizerRequest.create({
    data: {
      orgName: String(b.orgName).trim(),
      contactName: String(b.contactName).trim(),
      email: String(b.email).trim(),
      pageantName: String(b.pageantName).trim(),
      country: String(b.country).trim(),
      message: b.message ? String(b.message).trim() : null,
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}

// Admin: approve or reject a request.
export async function PATCH(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const b = await req.json().catch(() => null);
  if (!b?.id || !["approved", "rejected"].includes(b?.status))
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const updated = await db.organizerRequest.update({ where: { id: String(b.id) }, data: { status: b.status } });
  return NextResponse.json(updated);
}
