"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ExternalLink, ShieldCheck, Ticket } from "lucide-react";
import { getJson } from "@/lib/api";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  EmptyState,
  PageSection,
  SectionHeader,
} from "@/components/ui-kit";

type TicketOwnership = {
  issuance_id: string;
  organization_id: string;
  ticket_event_id: string;
  ticket_product_id: string;
  token_id: string;
  owner_address: string;
  transaction_hash: string;
  ledger_sequence: number;
  contract_event_id: string;
  accepted_at: string;
  issuance_status: string;
  serial_number: number;
};

function short(value: string, edge = 8): string {
  return value.length > edge * 2 + 1
    ? `${value.slice(0, edge)}…${value.slice(-edge)}`
    : value;
}

export default function TicketVerificationPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params.tokenId;
  const [ticket, setTicket] = useState<TicketOwnership | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson<TicketOwnership | null>(
      `/api/ticketing/tokens/${encodeURIComponent(tokenId)}/verify`,
      null,
    ).then((record) => {
      if (cancelled) return;
      setTicket(record);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  if (loading) {
    return (
      <PageSection className="max-w-3xl py-12">
        <EmptyState
          title="Verifying ticket ownership"
          description="Reading the accepted indexed ownership event for this token."
        />
      </PageSection>
    );
  }

  if (!ticket) {
    return (
      <PageSection className="max-w-3xl py-12">
        <EmptyState
          title="No accepted ticket ownership"
          description="CrownFi could not find an issued ticket whose current owner is supported by accepted chain evidence. A submitted mint or transfer is not enough."
          action={<ButtonLink href="/tickets" variant="secondary">Return to tickets</ButtonLink>}
        />
      </PageSection>
    );
  }

  return (
    <PageSection className="max-w-3xl space-y-8 px-0 py-0">
      <SectionHeader
        eyebrow="Ticket verification"
        title="Accepted ownership evidence"
        description="This page is derived from the currently accepted mint or transfer event, not merely from an order, local token identifier, or submitted transaction hash."
        trailing={<Badge tone="gold">Stellar Testnet</Badge>}
      />

      <Card className="border-emerald/30 bg-emerald/5">
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald/15 text-emerald">
                <CheckCircle2 size={25} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald">Verified current owner</p>
                <h1 className="mt-1 font-display text-3xl font-semibold text-white">Ticket #{ticket.serial_number}</h1>
              </div>
            </div>
            <Badge tone="success">{ticket.issuance_status}</Badge>
          </div>

          <dl className="divide-y divide-line rounded-2xl border border-line bg-black/20">
            <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-gold-soft/40">Token ID</dt><dd className="break-all font-mono text-sm text-gold-soft">{ticket.token_id}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-gold-soft/40">Current owner</dt><dd className="break-all font-mono text-sm text-gold-soft">{ticket.owner_address}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-gold-soft/40">Transaction</dt><dd className="font-mono text-sm text-gold-soft" title={ticket.transaction_hash}>{short(ticket.transaction_hash, 12)}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-gold-soft/40">Ledger</dt><dd className="text-sm font-semibold text-white">{ticket.ledger_sequence.toLocaleString()}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-gold-soft/40">Contract event</dt><dd className="break-all font-mono text-sm text-gold-soft">{ticket.contract_event_id}</dd></div>
            <div className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="text-sm text-gold-soft/40">Accepted</dt><dd className="text-sm text-gold-soft">{new Date(ticket.accepted_at).toLocaleString()}</dd></div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/tickets" variant="secondary"><Ticket size={16} /> Ticket directory</ButtonLink>
            <ButtonLink href="https://stellar.expert/explorer/testnet" variant="ghost" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Stellar Explorer</ButtonLink>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 rounded-2xl border border-gold/20 bg-gold/5 p-4 text-sm leading-6 text-gold-soft/55">
        <ShieldCheck className="mt-0.5 shrink-0 text-gold" size={18} />
        Transfers do not replace history. CrownFi appends each accepted ownership event and points this ticket at the latest accepted owner projection.
      </div>
    </PageSection>
  );
}
