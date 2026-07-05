import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { merkleRoot } from "@/lib/merkle";
import { tallyHash, TallyEntry } from "@/lib/tally";
import { anchorCheckpoint } from "@/lib/stellar";

// Close a round: aggregate the tally off-chain, build the Merkle root over ordered leaves,
// anchor the root + tally hash on Stellar, and persist the checkpoint for receipt generation.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await ctx.params;

  const round = await db.votingRound.findUnique({ where: { id: roundId } });
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });
  if (round.status === "closed" && round.closedAt)
    return NextResponse.json({ error: "already_closed" }, { status: 409 });

  const votes = await db.vote.findMany({
    where: { roundId },
    orderBy: { createdAt: "asc" },
    include: { contestant: true },
  });

  const counts = new Map<string, TallyEntry>();
  for (const v of votes) {
    const e = counts.get(v.contestantId) ?? {
      contestantId: v.contestantId,
      name: v.contestant.name,
      votes: 0,
    };
    e.votes += 1;
    counts.set(v.contestantId, e);
  }
  const tally = [...counts.values()].sort((a, b) => b.votes - a.votes);

  const leaves = votes.map((v: { leafHash: string }) => v.leafHash);
  const root = merkleRoot(leaves);
  const tHash = tallyHash(tally);

  const anchor = await anchorCheckpoint({
    roundId,
    merkleRoot: root,
    tallyHash: tHash,
    totalVotes: votes.length,
  });

  await db.$transaction([
    db.votingRound.update({
      where: { id: roundId },
      data: { status: "closed", closedAt: new Date() },
    }),
    db.checkpoint.upsert({
      where: { roundId },
      create: {
        roundId,
        merkleRoot: root,
        tallyHash: tHash,
        totalVotes: votes.length,
        anchorTx: anchor.txHash,
        tallyJson: JSON.stringify(tally),
        leavesJson: JSON.stringify(leaves),
      },
      update: {
        merkleRoot: root,
        tallyHash: tHash,
        totalVotes: votes.length,
        anchorTx: anchor.txHash,
        tallyJson: JSON.stringify(tally),
        leavesJson: JSON.stringify(leaves),
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    merkleRoot: root,
    tallyHash: tHash,
    totalVotes: votes.length,
    anchorTx: anchor.txHash,
    anchorMode: anchor.mode,
    tally,
  });
}
