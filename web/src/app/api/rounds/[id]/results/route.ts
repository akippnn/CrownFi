import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await ctx.params;
  const round = await db.votingRound.findUnique({
    where: { id: roundId },
    include: { checkpoint: true },
  });
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });

  return NextResponse.json({
    round: { id: round.id, title: round.title, status: round.status, closedAt: round.closedAt },
    checkpoint: round.checkpoint
      ? {
          merkleRoot: round.checkpoint.merkleRoot,
          tallyHash: round.checkpoint.tallyHash,
          totalVotes: round.checkpoint.totalVotes,
          anchorTx: round.checkpoint.anchorTx,
          tally: JSON.parse(round.checkpoint.tallyJson),
        }
      : null,
  });
}
