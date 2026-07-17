"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import { getJson } from "@/lib/api";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  EmptyState,
  PageSection,
  SectionHeader,
  StatusBadge,
} from "@/components/ui-kit";

type ProofStep = { position: "left" | "right"; hash: string };
type ReceiptProof = {
  snapshot_id: string;
  round_id: string;
  snapshot_status: string;
  receipt_hash: string;
  leaf_index: number;
  leaf_hash: string;
  merkle_root: string;
  proof: ProofStep[];
};

type AnchorRecord = {
  intent: {
    id: string;
    status: string;
    contract_id: string;
    contract_round_key: number;
    merkle_root: string;
    tally_sha256: string;
    total_votes: number;
    submitted_tx_hash?: string | null;
  };
  evidence?: {
    transaction_hash: string;
    ledger_sequence: number;
    event_reference: string;
    accepted_at: string;
  } | null;
};

export default function VoteReceiptPage() {
  const params = useParams<{ receiptHash: string }>();
  const receiptHash = params.receiptHash;
  const [proof, setProof] = useState<ReceiptProof | null>(null);
  const [anchor, setAnchor] = useState<AnchorRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getJson<ReceiptProof | null>(
      `/api/voting/receipts/${encodeURIComponent(receiptHash)}/proof`,
      null,
    ).then(async (nextProof) => {
      if (cancelled) return;
      setProof(nextProof);
      if (nextProof) {
        setAnchor(await getJson<AnchorRecord | null>(
          `/api/voting/rounds/${encodeURIComponent(nextProof.round_id)}/anchor`,
          null,
        ));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [receiptHash]);

  if (loading) {
    return (
      <PageSection className="max-w-4xl py-12">
        <EmptyState title="Checking receipt proof" description="Locating the immutable round snapshot and Merkle inclusion path." />
      </PageSection>
    );
  }

  if (!proof) {
    return (
      <PageSection className="max-w-4xl py-12">
        <EmptyState
          title="Receipt proof not available"
          description="The receipt is unknown, the round is still open, or the organizer has not created its immutable snapshot yet."
          action={<ButtonLink href="/vote" variant="secondary">Return to voting</ButtonLink>}
        />
      </PageSection>
    );
  }

  const anchored = proof.snapshot_status === "anchored" && Boolean(anchor?.evidence);
  return (
    <PageSection className="max-w-4xl space-y-8 px-0 py-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeader
          eyebrow="Vote receipt verification"
          title="Immutable inclusion proof"
          description="This receipt is included in the closed round's deterministic Merkle tree. Anchored status is shown only when CrownFi has accepted matching AuditAnchor contract-event evidence."
          className="mb-0"
        />
        <StatusBadge status={proof.snapshot_status as "open" | "closed"} />
      </div>

      <Card className="border-emerald/30 bg-emerald/5">
        <CardContent className="space-y-5 pt-6">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald/15 text-emerald"><CheckCircle2 size={25} /></span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald">Included in snapshot</p><h1 className="mt-1 font-display text-3xl font-semibold text-white">Receipt #{proof.leaf_index + 1}</h1></div>
          </div>
          <dl className="divide-y divide-line rounded-2xl border border-line bg-black/20 text-sm">
            <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Receipt hash</dt><dd className="break-all font-mono text-gold-soft">{proof.receipt_hash}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Leaf hash</dt><dd className="break-all font-mono text-gold-soft">{proof.leaf_hash}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Merkle root</dt><dd className="break-all font-mono text-gold-soft">{proof.merkle_root}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Proof depth</dt><dd className="text-white">{proof.proof.length} sibling hashes</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3"><GitBranch className="text-gold" size={20} /><h2 className="font-display text-2xl font-semibold text-white">Merkle path</h2></div>
          {proof.proof.length === 0 ? (
            <p className="rounded-2xl border border-line bg-black/20 p-4 text-sm text-gold-soft/45">This was the only accepted vote in the snapshot, so no sibling path is required.</p>
          ) : (
            <ol className="space-y-3">
              {proof.proof.map((step, index) => (
                <li key={`${step.hash}-${index}`} className="rounded-2xl border border-line bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3"><Badge tone="neutral">Level {index + 1}</Badge><span className="text-xs uppercase tracking-wider text-gold-soft/35">Sibling on {step.position}</span></div>
                  <p className="mt-3 break-all font-mono text-xs leading-5 text-gold-soft/60">{step.hash}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className={anchored ? "border-gold/30 bg-gold/5" : ""}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3"><ShieldCheck className={anchored ? "text-gold" : "text-gold-soft/35"} size={21} /><div><h2 className="font-display text-2xl font-semibold text-white">Stellar audit anchor</h2><p className="mt-1 text-sm text-gold-soft/45">{anchored ? "Matching Testnet contract-event evidence is accepted." : "The snapshot exists, but accepted anchor evidence is still pending."}</p></div></div>
            <Badge tone={anchored ? "success" : "gold"}>{anchored ? "Anchored" : anchor?.intent.status ?? "Not requested"}</Badge>
          </div>
          {anchor?.intent && (
            <dl className="divide-y divide-line rounded-2xl border border-line bg-black/20 text-sm">
              <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-gold-soft/40">Contract</dt><dd className="break-all font-mono text-gold-soft">{anchor.intent.contract_id}</dd></div>
              <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-gold-soft/40">Contract round key</dt><dd className="text-white">{anchor.intent.contract_round_key}</dd></div>
              <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-gold-soft/40">Total accepted votes</dt><dd className="text-white">{anchor.intent.total_votes}</dd></div>
              {anchor.evidence && <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-gold-soft/40">Transaction</dt><dd className="break-all font-mono text-gold-soft">{anchor.evidence.transaction_hash}</dd></div>}
            </dl>
          )}
        </CardContent>
      </Card>
    </PageSection>
  );
}
