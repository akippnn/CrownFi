"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Activity, CircleDollarSign, ExternalLink, ShieldCheck } from "lucide-react";
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

type OutcomeSummary = {
  outcome_id: string;
  code: string;
  label: string;
  active_positions: number;
  total_active_minor: number;
};

type PositionsSummary = {
  market_id: string;
  total_positions: number;
  total_active_minor: number;
  outcomes: OutcomeSummary[];
};

type SettlementStatus = {
  market_id: string;
  run_id: string;
  kind: string;
  run_status: string;
  total_stake_minor: number;
  fee_minor: number;
  distributable_minor: number;
  total_planned_minor: number;
  planned_items: number;
  submitted_items: number;
  confirmed_items: number;
  failed_items: number;
  created_at: string;
  updated_at: string;
};

function minorAmount(value: number): string {
  return `${(value / 10_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })} asset units`;
}

export default function MarketEvidencePage() {
  const params = useParams<{ marketId: string }>();
  const marketId = params.marketId;
  const [positions, setPositions] = useState<PositionsSummary | null>(null);
  const [settlement, setSettlement] = useState<SettlementStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getJson<PositionsSummary | null>(
        `/api/markets/${encodeURIComponent(marketId)}/positions-summary`,
        null,
      ),
      getJson<SettlementStatus | null>(
        `/api/markets/${encodeURIComponent(marketId)}/settlement-status`,
        null,
      ),
    ]).then(([nextPositions, nextSettlement]) => {
      if (cancelled) return;
      setPositions(nextPositions);
      setSettlement(nextSettlement);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  if (loading) {
    return (
      <PageSection className="max-w-5xl py-12">
        <EmptyState
          title="Loading market evidence"
          description="Reading active chain-authoritative positions and durable settlement state."
        />
      </PageSection>
    );
  }

  return (
    <PageSection className="max-w-5xl space-y-8 px-0 py-0">
      <div className="flex flex-col gap-4 border-b border-gold/15 pb-6 md:flex-row md:items-end md:justify-between">
        <SectionHeader
          eyebrow="Prediction Market evidence"
          title="Position and settlement truth"
          description="A signed or submitted stake is not an active position. CrownFi shows positions only after accepted indexed evidence, and settlement only after every planned payout or refund is independently confirmed."
          className="mb-0"
        />
        <div className="flex flex-wrap gap-2">
          <Badge tone="gold">Testnet only</Badge>
          <Badge tone="info">Chain authoritative</Badge>
        </div>
      </div>

      {!positions ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              title="No accepted positions"
              description="This market has no public chain-authoritative position evidence yet."
              action={<ButtonLink href="/markets" variant="secondary">Back to markets</ButtonLink>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <Activity className="text-gold" size={20} />
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-gold-soft/35">Accepted positions</p>
                <p className="mt-1 font-display text-3xl font-semibold text-white">{positions.total_positions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <CircleDollarSign className="text-gold" size={20} />
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-gold-soft/35">Active exposure</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">{minorAmount(positions.total_active_minor)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <ShieldCheck className="text-emerald" size={20} />
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-gold-soft/35">Settlement</p>
                <div className="mt-2">{settlement ? <StatusBadge status={settlement.run_status as "open" | "closed"} /> : <Badge tone="neutral">Not planned</Badge>}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gold-soft/35">Outcome exposure</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-white">Accepted position distribution</h2>
                </div>
                <Badge tone="info">Market {positions.market_id.slice(0, 8)}…</Badge>
              </div>
              <div className="divide-y divide-line rounded-2xl border border-line bg-black/20">
                {positions.outcomes.map((outcome) => {
                  const share = positions.total_active_minor > 0
                    ? Math.round((outcome.total_active_minor / positions.total_active_minor) * 100)
                    : 0;
                  return (
                    <div key={outcome.outcome_id} className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div><p className="font-semibold text-white">{outcome.label}</p><p className="mt-1 text-xs text-gold-soft/35">{outcome.active_positions} accepted positions</p></div>
                        <div className="text-right"><p className="font-semibold text-gold">{minorAmount(outcome.total_active_minor)}</p><p className="mt-1 text-xs text-gold-soft/35">{share}% of exposure</p></div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gold" style={{ width: `${share}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {settlement && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft/35">Settlement run</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-white">{settlement.kind === "refund" ? "Cancellation refunds" : "Resolution payouts"}</h2>
              </div>
              <StatusBadge status={settlement.run_status as "open" | "closed"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-line bg-black/20 p-4"><p className="text-xs text-gold-soft/35">Total stake</p><p className="mt-1 font-semibold text-white">{minorAmount(settlement.total_stake_minor)}</p></div>
              <div className="rounded-2xl border border-line bg-black/20 p-4"><p className="text-xs text-gold-soft/35">Fee</p><p className="mt-1 font-semibold text-white">{minorAmount(settlement.fee_minor)}</p></div>
              <div className="rounded-2xl border border-line bg-black/20 p-4"><p className="text-xs text-gold-soft/35">Planned</p><p className="mt-1 font-semibold text-white">{settlement.planned_items} items</p></div>
              <div className="rounded-2xl border border-line bg-black/20 p-4"><p className="text-xs text-gold-soft/35">Confirmed</p><p className="mt-1 font-semibold text-emerald">{settlement.confirmed_items}/{settlement.planned_items}</p></div>
            </div>
            <div className="rounded-2xl border border-gold/20 bg-gold/5 p-4 text-sm leading-6 text-gold-soft/55">
              The market is not finalized until every planned item has exact recipient, amount, transaction, ledger, operation, and event evidence. Recorded submissions remain pending.
            </div>
            <ButtonLink href="/markets" variant="secondary"><ExternalLink size={16} /> Return to market directory</ButtonLink>
          </CardContent>
        </Card>
      )}
    </PageSection>
  );
}
