"use client";

import { useEffect, useState } from "react";
import { Gem, LoaderCircle, Sparkles, Ticket, Vote, Wallet } from "lucide-react";
import { useSession } from "@/session/SessionProvider";
import { short } from "@/lib/format";
import { getJson } from "@/lib/api";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionHeader,
} from "@/components/ui-kit";

type DashboardRow = { main: string; sub: string; tag?: string };

export default function MePage() {
  const { fan, address, ready, connecting, connect } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fan) {
      setData(null);
      return;
    }
    setLoading(true);
    getJson(`/api/dashboard?fanId=${fan.id}`, null).then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [fan]);

  if (!ready) {
    return (
      <div className="flex min-h-72 items-center justify-center text-gold-soft/50">
        <LoaderCircle className="mr-2 animate-spin" size={20} /> Loading your CrownFi profile…
      </div>
    );
  }

  if (!fan) {
    return (
      <EmptyState
        className="mx-auto max-w-2xl py-14"
        title="Connect your wallet to open your CrownFi profile"
        description="Your votes, tickets, collectibles, loyalty points, and verification receipts are grouped here by wallet."
        action={<Button onClick={connect} disabled={connecting}><Wallet size={17} />{connecting ? "Connecting…" : "Connect Freighter"}</Button>}
      />
    );
  }

  const votes: DashboardRow[] = (data?.votes ?? []).map((vote: any) => ({ main: vote.contestant, sub: vote.round, tag: vote.status }));
  const tickets: DashboardRow[] = (data?.tickets ?? []).map((ticket: any) => ({
    main: `${ticket.tier} · ${ticket.seat === "Unassigned" ? "seat pending" : `seat ${ticket.seat}`}`,
    sub: ticket.eventName,
    tag: ticket.tokenId ? `Token ${short(ticket.tokenId, 5)}` : ticket.status,
  }));
  const collectibles: DashboardRow[] = (data?.collectibles ?? []).map((collectible: any) => ({
    main: collectible.title,
    sub: `${collectible.priceUsdc} USDC`,
    tag: collectible.tokenId ? `Token ${short(collectible.tokenId, 5)}` : "Collected",
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          className="mb-0"
          eyebrow="Your CrownFi account"
          title={fan.handle || "My profile"}
          description="Review everything connected to this Stellar wallet across CrownFi's voting, ticketing, and collectible experiences."
        />
        <Badge tone="success">Wallet connected</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-[0.65fr_1.35fr]">
        <Card className="border-gold/25 bg-gold/5">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft/40">Loyalty points</div>
              <Sparkles className="text-gold" size={19} />
            </div>
            <div className="mt-3 font-display text-5xl font-semibold text-gold">{fan.points ?? 0}</div>
            <p className="mt-2 text-sm text-gold-soft/45">Earn points by participating in supported CrownFi experiences.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Wallet className="text-gold" size={19} /><CardTitle>Connected Stellar wallet</CardTitle></div>
            <CardDescription>This public address identifies your CrownFi account. CrownFi never asks for your seed phrase.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mono break-all rounded-2xl border border-line bg-black/25 px-4 py-3 text-sm text-gold-soft">{address}</div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-line bg-black/20 text-gold-soft/45">
          <LoaderCircle className="mr-2 animate-spin" size={18} /> Loading participation history…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ActivityPanel
            icon={<Vote size={19} />}
            title="Votes and receipts"
            rows={votes}
            empty="You have not voted yet."
            description="Votes cast by this wallet appear here with their round status."
            href="/vote"
            cta="Vote now"
          />
          <ActivityPanel
            icon={<Ticket size={19} />}
            title="Tickets"
            rows={tickets}
            empty="You do not own any tickets."
            description="Minted event passes and seat assignments appear here."
            href="/tickets"
            cta="Browse tickets"
          />
          <ActivityPanel
            icon={<Gem size={19} />}
            title="Collectibles"
            rows={collectibles}
            empty="You have not collected a portrait."
            description="Official contestant collectibles purchased by this wallet appear here."
            href="/contestants"
            cta="Browse collectibles"
          />
        </div>
      )}
    </div>
  );
}

function ActivityPanel({
  icon,
  title,
  rows,
  empty,
  description,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  rows: DashboardRow[];
  empty: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-gold">{icon}<CardTitle className="text-white">{title}</CardTitle></div>
          <Badge tone="neutral">{rows.length}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-black/20 px-4 py-7 text-center">
            <p className="text-sm text-gold-soft/45">{empty}</p>
            <ButtonLink href={href} size="sm" variant="secondary" className="mt-4">{cta}</ButtonLink>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={`${row.main}-${index}`} className="rounded-2xl border border-line bg-black/25 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{row.main}</div>
                    <div className="mt-1 truncate text-xs text-gold-soft/40">{row.sub}</div>
                  </div>
                  {row.tag && <Badge tone="info" className="shrink-0">{row.tag}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
