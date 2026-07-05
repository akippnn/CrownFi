import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeCheckpoint, saveCheckpoint } from "@/lib/roundClose";
import { submitSignedXdr } from "@/lib/stellar";

// STEP 2 of admin-signed anchoring: submit the admin's signed publish() tx, then persist the
// checkpoint and close the round.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const signedXdr = String(body?.signedXdr ?? "");
  if (!signedXdr) return NextResponse.json({ error: "missing_signed_tx" }, { status: 400 });

  const round = await db.votingRound.findUnique({ where: { id: roundId } });
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });
  if (round.status === "closed" && round.closedAt)
    return NextResponse.json({ error: "already_closed" }, { status: 409 });

  try {
    const anchor = await submitSignedXdr(signedXdr);
    const cp = await computeCheckpoint(roundId);
    await saveCheckpoint(roundId, cp, anchor.txHash);
    return NextResponse.json({ ok: true, anchorTx: anchor.txHash, merkleRoot: cp.root, totalVotes: cp.totalVotes, tally: cp.tally });
  } catch (e: any) {
    console.error("[api/rounds/confirm-close] failed:", e);
    return NextResponse.json({ error: e?.message ?? "confirm_failed" }, { status: 500 });
  }
}
