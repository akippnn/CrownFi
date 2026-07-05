import { db } from "@/lib/db";
import { merkleRoot } from "@/lib/merkle";
import { tallyHash, TallyEntry } from "@/lib/tally";

// Compute a round's tally + Merkle root from its votes (deterministic). Shared by the close routes.
export async function computeCheckpoint(roundId: string) {
  const votes = await db.vote.findMany({
    where: { roundId },
    orderBy: { createdAt: "asc" },
    include: { contestant: true },
  });

  const counts = new Map<string, TallyEntry>();
  for (const v of votes) {
    const e = counts.get(v.contestantId) ?? { contestantId: v.contestantId, name: v.contestant.name, votes: 0 };
    e.votes += 1;
    counts.set(v.contestantId, e);
  }
  const tally = [...counts.values()].sort((a, b) => b.votes - a.votes);
  const leaves = votes.map((v: { leafHash: string }) => v.leafHash);

  return { tally, leaves, root: merkleRoot(leaves), tHash: tallyHash(tally), totalVotes: votes.length };
}

// Persist the checkpoint + mark the round closed, with the given on-chain anchor tx hash.
export async function saveCheckpoint(roundId: string, cp: Awaited<ReturnType<typeof computeCheckpoint>>, anchorTx: string) {
  const data = {
    merkleRoot: cp.root,
    tallyHash: cp.tHash,
    totalVotes: cp.totalVotes,
    anchorTx,
    tallyJson: JSON.stringify(cp.tally),
    leavesJson: JSON.stringify(cp.leaves),
  };
  await db.$transaction([
    db.votingRound.update({ where: { id: roundId }, data: { status: "closed", closedAt: new Date() } }),
    db.checkpoint.upsert({ where: { roundId }, create: { roundId, ...data }, update: data }),
  ]);
}
