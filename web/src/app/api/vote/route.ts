import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voteLeaf } from "@/lib/merkle";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/ip";

// Off-chain vote intake. Fast path: rate limit, quota check, then a single insert whose
// unique constraint (roundId, fanId) is the real duplicate-vote guard.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`vote:${ip}`);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { roundId?: string; fanId?: string; contestantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { roundId, fanId, contestantId } = body;
  if (!roundId || !fanId || !contestantId)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const round = await db.votingRound.findUnique({ where: { id: roundId } });
  if (!round) return NextResponse.json({ error: "round_not_found" }, { status: 404 });
  if (round.status !== "open")
    return NextResponse.json({ error: "round_closed" }, { status: 409 });

  const quota = Number(process.env.VOTE_QUOTA_PER_ROUND ?? "1");
  const existing = await db.vote.count({ where: { roundId, fanId } });
  if (existing >= quota)
    return NextResponse.json({ error: "quota_reached" }, { status: 409 });

  try {
    const vote = await db.vote.create({
      data: { roundId, fanId, contestantId, leafHash: voteLeaf(fanId, contestantId, roundId) },
    });
    return NextResponse.json({ ok: true, voteId: vote.id });
  } catch (e: unknown) {
    // Unique constraint => duplicate vote.
    return NextResponse.json({ error: "duplicate_vote" }, { status: 409 });
  }
}
