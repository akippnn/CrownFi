import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { merkleProof, verifyProof } from "@/lib/merkle";

// Returns a Merkle inclusion proof (a receipt) that a fan's vote is inside the published root.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await ctx.params;
  const fanId = req.nextUrl.searchParams.get("fanId");
  if (!fanId) return NextResponse.json({ error: "missing_fanId" }, { status: 400 });

  const checkpoint = await db.checkpoint.findUnique({ where: { roundId } });
  if (!checkpoint) return NextResponse.json({ error: "round_not_closed" }, { status: 409 });

  const vote = await db.vote.findFirst({ where: { roundId, fanId } });
  if (!vote) return NextResponse.json({ error: "no_vote_for_fan" }, { status: 404 });

  const leaves: string[] = JSON.parse(checkpoint.leavesJson);
  const index = leaves.indexOf(vote.leafHash);
  if (index < 0) return NextResponse.json({ error: "leaf_not_found" }, { status: 500 });

  const proof = merkleProof(leaves, index);
  const verified = verifyProof(vote.leafHash, proof, checkpoint.merkleRoot);

  return NextResponse.json({
    roundId,
    leaf: vote.leafHash,
    index,
    proof,
    merkleRoot: checkpoint.merkleRoot,
    anchorTx: checkpoint.anchorTx,
    verified,
  });
}
