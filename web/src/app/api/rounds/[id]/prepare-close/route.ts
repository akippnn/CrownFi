import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeCheckpoint } from "@/lib/roundClose";
import { buildAnchorTx } from "@/lib/stellar";
import { requireAdmin } from "@/lib/adminAuth";
import { createTxIntent } from "@/lib/txIntents";

const LIVE = (process.env.STELLAR_MODE ?? "mock") === "live";

// STEP 1 of admin-signed anchoring: compute the tally + Merkle root, and return an unsigned
// AuditAnchor.publish() tx for the admin to approve in Freighter. No DB changes yet.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id: roundId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const adminAddress = String(body?.adminAddress ?? "").trim();

  const round = await db.votingRound.findUnique({ where: { id: roundId } });
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });
  if (round.status === "closed" && round.closedAt)
    return NextResponse.json({ error: "already_closed" }, { status: 409 });

  const cp = await computeCheckpoint(roundId);

  if (!LIVE) return NextResponse.json({ mock: true, ...cp });
  if (!adminAddress.startsWith("G")) return NextResponse.json({ error: "connect_wallet" }, { status: 400 });
  if (admin.address !== adminAddress) return NextResponse.json({ error: "admin_wallet_mismatch" }, { status: 403 });

  try {
    const { xdr, txHash } = await buildAnchorTx({ adminAddress, roundId, merkleRoot: cp.root, tallyHash: cp.tHash, totalVotes: cp.totalVotes });
    const intent = createTxIntent({ kind: "round-close", roundId, expectedSource: adminAddress, txHash });
    return NextResponse.json({ xdr, intentId: intent.id, merkleRoot: cp.root, tallyHash: cp.tHash, totalVotes: cp.totalVotes, tally: cp.tally });
  } catch (e: any) {
    console.error("[api/rounds/prepare-close] failed:", e);
    return NextResponse.json({ error: e?.message ?? "prepare_failed" }, { status: 500 });
  }
}
