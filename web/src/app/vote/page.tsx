"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, Wallet } from "lucide-react";
import { useSession } from "@/session/SessionProvider";
import { Toast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";
import { flag, short } from "@/lib/format";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  ConfirmModal,
  EmptyState,
  OrnatePortrait,
  PageSection,
  SectionHeader,
  StatusBadge,
} from "@/components/ui-kit";

type Round = {
  id: string;
  title: string;
  status: string;
  opens_at: string;
  closes_at: string;
  total_votes: number;
};

type Contestant = {
  pageant_contestant_id: string;
  display_name: string;
  country_code?: string | null;
  country_representation?: string | null;
  sash?: string | null;
  portrait_url?: string | null;
};

type RoundView = { round: Round; contestants: Contestant[] };
type VoteReceipt = {
  vote_id: string;
  round_id: string;
  pageant_contestant_id: string;
  receipt_hash: string;
  accepted_at: string;
};

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

function idempotencyKey(roundId: string, contestantId: string): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `vote:${roundId}:${contestantId}:${nonce}`;
}

function VotePageContent() {
  const { fan, address, ready, connecting, connect, hostedPageantId } = useSession();
  const searchParams = useSearchParams();
  const initialCandidate = searchParams.get("candidate") || "";
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" }>({ msg: "", tone: "ok" });

  useEffect(() => {
    if (!hostedPageantId) {
      setRound(null);
      setContestants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getJson<RoundView[]>(
      `/api/voting/rounds?pageantId=${encodeURIComponent(hostedPageantId)}`,
      [],
    )
      .then((items) => {
        const selected = items.find((item) => item.round.status === "open") ?? items[0] ?? null;
        setRound(selected?.round ?? null);
        setContestants(selected?.contestants ?? []);
        if (
          initialCandidate &&
          selected?.contestants.some(
            (contestant) => contestant.pageant_contestant_id === initialCandidate,
          )
        ) {
          setPicked(initialCandidate);
          setConfirming(true);
        }
      })
      .finally(() => setLoading(false));
  }, [hostedPageantId, initialCandidate]);

  function flash(msg: string, tone: "ok" | "err") {
    setToast({ msg, tone });
    setTimeout(() => setToast({ msg: "", tone }), 3000);
  }

  function chooseCandidate(id: string) {
    setPicked(id);
    setReceipt(null);
    setConfirming(true);
  }

  async function cast() {
    if (!fan || !round || !picked) return;
    setBusy(true);
    try {
      const { ok, data } = await postJson<VoteReceipt & { error?: string }>(
        "/api/voting/votes",
        {
          roundId: round.id,
          pageantContestantId: picked,
          idempotencyKey: idempotencyKey(round.id, picked),
        },
      );
      const payload = data as VoteReceipt & { error?: string };
      if (ok) {
        setReceipt(payload);
        setConfirming(false);
        flash("Vote accepted. Keep your receipt for proof verification after closure.", "ok");
      } else if (payload.error === "duplicate_vote" || payload.error === "quota_reached") {
        flash("This account has already used its vote for the round.", "err");
      } else if (payload.error === "voting_closed" || payload.error === "round_closed") {
        flash("Voting closed before this vote could be submitted.", "err");
      } else if (payload.error === "authentication_required") {
        flash("Connect and verify your wallet before voting.", "err");
      } else {
        flash(`Could not accept the vote${payload.error ? `: ${payload.error}` : "."}`, "err");
      }
    } finally {
      setBusy(false);
    }
  }

  const pickedContestant = contestants.find(
    (contestant) => contestant.pageant_contestant_id === picked,
  );
  const votingOpen = round?.status === "open";

  return (
    <PageSection className="max-w-6xl space-y-8 px-0 py-0">
      <div className="flex flex-col gap-4 border-b border-gold/15 pb-6 md:flex-row md:items-end md:justify-between">
        <SectionHeader
          eyebrow="Cast your vote"
          title="Choose the next crown bearer"
          description="Your account-bound vote is committed exactly once. Closing the round freezes an immutable Merkle snapshot before its audit checkpoint can be accepted from Stellar Testnet."
          className="mb-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          {round ? (
            <>
              <Badge tone="gold">{round.title}</Badge>
              <StatusBadge status={round.status as "open" | "closed"} />
            </>
          ) : (
            <Badge tone="neutral">No voting round</Badge>
          )}
          <Badge tone="info">Durable intake</Badge>
        </div>
      </div>

      {!hostedPageantId && (
        <Card className="border-gold/25 bg-gold/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div>
              <h2 className="font-semibold text-white">Choose a pageant first</h2>
              <p className="mt-1 text-sm text-gold-soft/45">Voting rounds are pageant-scoped and never use one global fixture ballot.</p>
            </div>
            <ButtonLink href="/pageants" variant="secondary">Explore pageants</ButtonLink>
          </CardContent>
        </Card>
      )}

      {ready && hostedPageantId && !fan && (
        <Card className="border-gold/25 bg-gold/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold"><Wallet size={19} /></span>
              <div>
                <h2 className="font-semibold text-white">Connect before choosing your finalist</h2>
                <p className="mt-1 text-sm text-gold-soft/45">CrownFi requires an active account with a verified Testnet wallet for this round.</p>
              </div>
            </div>
            <Button onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect Freighter"}</Button>
          </CardContent>
        </Card>
      )}

      {!votingOpen && round && (
        <div className="rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-gold-soft/60">
          Voting is {round.status} for <strong className="text-gold-soft">{round.title}</strong>. Receipts can be checked after its immutable snapshot is available.
        </div>
      )}

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[3/5] animate-pulse rounded-2xl border border-line bg-white/5" />)}
        </div>
      ) : contestants.length === 0 ? (
        <EmptyState title="No contestants are available" description="The selected pageant has no published voting round with eligible contestants." />
      ) : (
        <section aria-labelledby="candidate-grid-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="candidate-grid-heading" className="font-display text-2xl font-semibold text-white">Eligible contestants</h2>
            <span className="text-sm text-gold-soft/40">{contestants.length} candidates</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {contestants.map((contestant) => {
              const sash = contestant.sash || contestant.country_code || "";
              const country = contestant.country_representation || contestant.country_code || "Contestant";
              return (
                <OrnatePortrait
                  key={contestant.pageant_contestant_id}
                  id={contestant.pageant_contestant_id}
                  name={contestant.display_name}
                  country={country}
                  sash={sash}
                  imageUrl={contestant.portrait_url || getPortraitPath(sash)}
                  onVote={() => chooseCandidate(contestant.pageant_contestant_id)}
                  className={picked === contestant.pageant_contestant_id ? "ring-2 ring-gold shadow-[0_0_25px_rgba(212,175,55,0.28)]" : ""}
                />
              );
            })}
          </div>
        </section>
      )}

      {receipt && pickedContestant && (
        <Card className="border-emerald/30 bg-emerald/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald/15 text-emerald"><CheckCircle2 size={23} /></span>
              <div>
                <h2 className="font-display text-xl font-semibold text-white">Vote accepted for {pickedContestant.display_name}</h2>
                <p className="mt-1 break-all text-sm text-gold-soft/50">Receipt {receipt.receipt_hash} becomes independently verifiable after snapshot creation.</p>
              </div>
            </div>
            <ButtonLink href="/verify" variant="secondary"><ShieldCheck size={17} /> Open verification</ButtonLink>
          </CardContent>
        </Card>
      )}

      <ConfirmModal
        open={confirming && Boolean(pickedContestant)}
        onClose={() => setConfirming(false)}
        onConfirm={cast}
        title="Confirm your vote"
        description="Review the selected contestant and round before this account-bound vote is submitted."
        confirmLabel={pickedContestant ? `Vote for ${pickedContestant.display_name}` : "Cast vote"}
        pendingLabel="Accepting vote…"
        pending={busy}
      >
        {pickedContestant && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
              <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-gold/25 bg-black/30">
                <img
                  src={pickedContestant.portrait_url || getPortraitPath(pickedContestant.sash || pickedContestant.country_code || "")}
                  alt={pickedContestant.display_name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col justify-center">
                <Badge tone="gold" className="w-fit">{flag(pickedContestant.sash || pickedContestant.country_code || "")} {pickedContestant.country_representation || pickedContestant.country_code || "Contestant"}</Badge>
                <h3 className="mt-3 font-display text-3xl font-semibold text-white">{pickedContestant.display_name}</h3>
                <p className="mt-2 text-sm leading-6 text-gold-soft/50">A second submission from this account is rejected by a database uniqueness constraint.</p>
              </div>
            </div>
            <dl className="space-y-2 rounded-2xl border border-line bg-black/25 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-gold-soft/40">Voting round</dt><dd className="font-semibold text-gold-soft">{round?.title ?? "Unavailable"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gold-soft/40">Wallet</dt><dd className="mono text-xs text-gold-soft">{address ? short(address, 8) : "Not connected"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gold-soft/40">Blockchain step</dt><dd className="text-right text-gold-soft">Accepted audit evidence after closure</dd></div>
            </dl>
            {!fan && <p className="rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">Connect Freighter before confirming this vote.</p>}
            {!votingOpen && <p className="rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">This round is not open for voting.</p>}
          </div>
        )}
      </ConfirmModal>

      <Toast msg={toast.msg} tone={toast.tone} />
    </PageSection>
  );
}

export default function VotePage() {
  return (
    <Suspense fallback={<PageSection className="py-12 text-center text-sm text-gold-soft/50">Loading voting experience…</PageSection>}>
      <VotePageContent />
    </Suspense>
  );
}
