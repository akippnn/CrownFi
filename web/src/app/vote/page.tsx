"use client";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/session/SessionProvider";
import { Toast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";
import { flag, initials } from "@/lib/format";
import {
  PageSection,
  SectionHeader,
  StatusBadge,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  ThreeDCarousel,
  OrnatePortrait,
} from "@/components/ui-kit";

type Round = { id: string; title: string; status: string };
type Contestant = { id: string; name: string; country: string; sash: string; portraitUrl?: string };

const getPortraitPath = (sash: string) => {
  const map: Record<string, string> = {
    ph: "/assets/candidates/candidate_philippines_portrait_silver-gown.webp",
    jp: "/assets/candidates/candidate_japan_portrait_yellow-gown.webp",
    vn: "/assets/candidates/candidate_vietnam_portrait_silver-gown.webp",
    cn: "/assets/candidates/candidate_china_portrait_yellow-gown_outdoor.webp",
    sg: "/assets/candidates/candidate_singapore_portrait_silver-gown.webp",
    kr: "/assets/candidates/candidate_south-korea_portrait_yellow-gown.webp",
    th: "/assets/candidates/candidate_thailand_portrait_silver-gown_profile.webp",
    id: "/assets/candidates/candidate_indonesia_portrait_gold-gown.webp",
    in: "/assets/candidates/candidate_india_portrait_gold-gown_stage.webp",
    my: "/assets/candidates/candidate_malaysia_portrait_gold-gown.webp",
  };
  return map[sash.toLowerCase()] || `/portraits/${sash.toLowerCase()}.webp`;
};

function VotePageContent() {
  const { fan, ready } = useSession();
  const searchParams = useSearchParams();
  const initialCandidate = searchParams.get("candidate") || "";

  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" }>({ msg: "", tone: "ok" });

  useEffect(() => {
    getJson<Contestant[]>("/api/contestants", []).then((cs) => {
      setContestants(cs);
      if (initialCandidate && cs.some((c) => c.id === initialCandidate)) {
        setPicked(initialCandidate);
      }
    });
    getJson<Round[]>("/api/rounds", []).then((rs) =>
      setRound(rs.find((x: Round) => x.status === "open") ?? rs[0] ?? null)
    );
  }, [initialCandidate]);

  function flash(msg: string, tone: "ok" | "err") {
    setToast({ msg, tone });
    setTimeout(() => setToast({ msg: "", tone }), 2600);
  }

  async function cast() {
    if (!fan || !round || !picked) return;
    setBusy(true);
    const { ok, data } = await postJson<{ error?: string }>("/api/vote", {
      roundId: round.id,
      fanId: fan.id,
      contestantId: picked,
    });
    setBusy(false);
    const err = (data as any)?.error;
    if (ok) flash("Vote recorded. Verify it once the round closes.", "ok");
    else if (err === "duplicate_vote" || err === "quota_reached") flash("You have already voted in this round.", "err");
    else if (err === "db_unavailable") flash("Database isn't set up yet — see SUPABASE.md.", "err");
    else flash(`Could not vote${err ? `: ${err}` : "."}`, "err");
  }

  const pickedContestant = contestants.find((c) => c.id === picked);

  return (
    <PageSection className="space-y-8 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gold/15 pb-6">
        <SectionHeader
          eyebrow="Cast your vote"
          title="Who wears the crown?"
          className="mb-0"
        />
        <div className="flex items-center gap-3 flex-wrap">
          {round ? (
            <>
              <span className="text-sm font-semibold text-white/90 font-display">
                {round.title}
              </span>
              <StatusBadge status={round.status as any} />
            </>
          ) : (
            <span className="text-sm text-gold-soft/50">No active round</span>
          )}
          <Badge tone="neutral" emphasis="soft" className="text-[10px] tracking-wider uppercase">
            off-chain intake
          </Badge>
        </div>
      </div>

      {ready && !fan && (
        <Card className="border-gold/20 bg-gold/5">
          <CardContent className="py-4 text-center text-sm text-gold-soft">
            Connect your Freighter wallet (top right) to participate in voting.
          </CardContent>
        </Card>
      )}

      {contestants.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gold/15 rounded-2xl bg-black/25">
          <p className="text-sm text-gold-soft/50">Loading contestants...</p>
        </div>
      ) : (
        <ThreeDCarousel
          items={contestants}
          defaultActiveId={initialCandidate || undefined}
          onActiveChange={(item) => {
            // Active slide change handler
          }}
          renderItem={(c, isActive) => (
            <div className="w-[280px]">
              <OrnatePortrait
                id={c.id}
                name={c.name}
                country={c.country}
                sash={c.sash}
                imageUrl={c.portraitUrl || getPortraitPath(c.sash)}
                onVote={() => {
                  if (isActive) {
                    setPicked(c.id);
                  }
                }}
                className={picked === c.id ? "ring-2 ring-gold shadow-[0_0_25px_rgba(212,175,55,0.35)]" : ""}
              />
            </div>
          )}
        />
      )}

      {pickedContestant ? (
        <div className="mt-8 max-w-md mx-auto">
          <Card className="border-gold/30 bg-[#0d0f17] overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-gold/10 pb-4 text-center">
              <CardTitle className="text-gold font-display text-lg tracking-wider uppercase">
                Confirm Your Vote
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-20 rounded-lg overflow-hidden border border-gold/20 bg-gold/5 shrink-0 relative">
                  <img
                    src={pickedContestant.portraitUrl || getPortraitPath(pickedContestant.sash)}
                    alt={pickedContestant.name}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-display font-semibold text-white leading-snug">
                    {pickedContestant.name}
                  </h4>
                  <p className="text-xs uppercase tracking-wider text-gold-soft/70">
                    {flag(pickedContestant.sash)} {pickedContestant.country}
                  </p>
                </div>
              </div>

              <div className="border-t border-gold/10 pt-4 flex flex-col items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full uppercase tracking-wider text-xs font-bold"
                  disabled={busy || !fan || round?.status !== "open"}
                  onClick={cast}
                >
                  {busy ? "Submitting Vote..." : "Cast Vote"}
                </Button>

                {!fan && (
                  <p className="text-xs text-ruby/80">Connect Freighter wallet to vote.</p>
                )}
                {round?.status !== "open" && (
                  <p className="text-xs text-gold-soft/50">Voting is closed for this round.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gold-soft/50">
            Select a candidate from the 3D showcase above to cast your vote.
          </p>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/verify"
          className="text-xs font-semibold uppercase tracking-wider text-gold-soft/60 hover:text-gold hover:underline transition-colors underline-offset-4"
        >
          Already voted? Verify your receipt
        </Link>
      </div>

      <Toast msg={toast.msg} tone={toast.tone} />
    </PageSection>
  );
}

export default function VotePage() {
  return (
    <Suspense
      fallback={
        <PageSection className="text-center py-12">
          <p className="text-sm text-gold-soft/50 animate-pulse">Loading Vote System...</p>
        </PageSection>
      }
    >
      <VotePageContent />
    </Suspense>
  );
}
