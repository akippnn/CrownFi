"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, FileCheck2, ShieldCheck } from "lucide-react";
import { useSession } from "@/session/SessionProvider";
import { short } from "@/lib/format";
import { getJson } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionHeader,
  SelectField,
} from "@/components/ui-kit";

 type Round = { id: string; title: string; status: string };

type ReceiptResult = {
  verified: boolean;
  proof?: unknown[];
  anchorTx?: string;
  merkleRoot?: string;
  leaf?: string;
  index?: number;
  mock?: boolean;
};

export default function VerifyPage() {
  const { fan, address } = useSession();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState("");
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getJson<Round[]>("/api/rounds", []).then((rs) => {
      setRounds(rs);
      const closed = rs.find((r) => r.status === "closed");
      setRoundId(closed?.id ?? rs[0]?.id ?? "");
    });
  }, []);

  const selectedRound = useMemo(() => rounds.find((round) => round.id === roundId), [roundId, rounds]);

  async function verify() {
    if (!fan || !roundId) return;
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/receipt?fanId=${fan.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          data.error === "round_not_closed"
            ? "This round is still open. Your receipt becomes verifiable after the final checkpoint is published."
            : data.error === "no_vote_for_fan"
              ? "No vote from this wallet was found in the selected round."
              : data.error ?? "The receipt could not be checked right now.",
        );
        return;
      }
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Proof of vote"
        title="Verify your vote receipt"
        description="Choose a completed round to check whether your wallet's vote is included in the published Merkle checkpoint. Personal voter data stays off-chain; the final proof is anchored to Stellar."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card>
          <CardHeader>
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="text-gold" size={20} />
              <Badge tone="gold">Receipt lookup</Badge>
            </div>
            <CardTitle>Select a voting round</CardTitle>
            <CardDescription>
              CrownFi uses your connected wallet to locate the vote receipt. No receipt ID needs to be copied manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectField
              id="verification-round"
              label="Voting round"
              value={roundId}
              onChange={(event) => {
                setRoundId(event.target.value);
                setResult(null);
                setErr("");
              }}
              helper={selectedRound ? `Status: ${selectedRound.status}` : "Choose a round to continue."}
            >
              <option value="">Choose a round…</option>
              {rounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.title} ({round.status})
                </option>
              ))}
            </SelectField>

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!fan || !roundId || loading} onClick={verify}>
                <FileCheck2 size={17} />
                {loading ? "Checking receipt…" : "Verify my vote"}
              </Button>
              {!fan && <p className="text-sm text-gold-soft/50">Connect Freighter to identify your vote.</p>}
            </div>

            {address && (
              <div className="rounded-2xl border border-line bg-black/25 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-soft/40">Wallet used for lookup</div>
                <div className="mono mt-1 text-sm text-gold-soft">{short(address, 10)}</div>
              </div>
            )}

            {err && (
              <div role="alert" className="flex items-start gap-3 rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">
                <CircleAlert className="mt-0.5 shrink-0" size={18} />
                <span>{err}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>What gets verified?</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 text-sm text-gold-soft/60">
              {[
                "CrownFi finds the vote associated with your connected wallet.",
                "The vote leaf is rebuilt and checked against the published Merkle root.",
                "The root is matched with the round checkpoint anchored on Stellar.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/25 bg-gold/10 text-xs font-semibold text-gold">{index + 1}</span>
                  <span className="pt-1 leading-6">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {!result && !err && (
        <EmptyState
          title="No receipt checked yet"
          description="Select a completed round and verify with the wallet that cast the vote."
        />
      )}

      {result && (
        <Card className={result.verified ? "border-emerald/30" : "border-ruby/30"}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${result.verified ? "bg-emerald/15 text-emerald" : "bg-ruby/15 text-ruby"}`}>
                  {result.verified ? <CheckCircle2 size={24} /> : <CircleAlert size={24} />}
                </span>
                <div>
                  <CardTitle>{result.verified ? "Your vote is included" : "The proof did not verify"}</CardTitle>
                  <CardDescription>
                    {result.verified
                      ? `The receipt passed ${result.proof?.length ?? 0} Merkle proof steps and matches the published checkpoint.`
                      : "The receipt does not match the checkpoint currently published for this round."}
                  </CardDescription>
                </div>
              </div>
              <Badge tone={result.verified ? "success" : "danger"}>{result.mock ? "Local demo proof" : "Stellar checkpoint"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <details className="group rounded-2xl border border-line bg-black/25">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gold-soft transition hover:text-white">
                Technical proof details
                <span className="float-right text-gold-soft/40 transition group-open:rotate-180">⌄</span>
              </summary>
              <dl className="space-y-3 border-t border-line px-4 py-4 text-sm">
                {[
                  ["Anchor transaction", result.anchorTx],
                  ["Merkle root", result.merkleRoot],
                  ["Your vote leaf", result.leaf],
                  ["Leaf index", result.index == null ? undefined : String(result.index)],
                  ["Proof steps", String(result.proof?.length ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="grid gap-1 border-b border-line/60 pb-3 last:border-0 last:pb-0 sm:grid-cols-[150px_1fr]">
                    <dt className="text-gold-soft/45">{label}</dt>
                    <dd className="mono break-all text-xs text-gold-soft">{value ? (label === "Leaf index" || label === "Proof steps" ? value : short(value, 18)) : "Not available"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
