"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/session/SessionProvider";
import { short } from "@/lib/format";
import { getJson } from "@/lib/api";

export default function MePage() {
  const { fan, ready } = useSession();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!fan) return;
    getJson(`/api/dashboard?fanId=${fan.id}`, null).then(setData);
  }, [fan]);

  if (ready && !fan) return <div className="glass p-8 text-center text-ink/75 dark:text-gold-soft/75">Connect your Freighter wallet to see your dashboard.</div>;

  return (
    <div>
      <div className="mb-8">
        <div className="eyebrow mb-2">Your account</div>
        <h1 className="font-display text-4xl font-semibold text-ink dark:text-white">{fan?.handle}</h1>
      </div>

      {/* Identity + points */}
      <div className="grid gap-4 sm:grid-cols-3">
      <div className="glass p-5">
        <div className="text-xs uppercase tracking-wider text-ink/65 dark:text-gold-soft/65">Loyalty points</div>
        <div className="mt-1 font-display text-4xl font-semibold text-[#b8912f]">{fan?.points ?? 0}</div>
        <div className="mt-1 text-xs text-ink/50 dark:text-gold-soft/50">Earn more by voting and collecting</div>
      </div>
      <div className="glass p-5 sm:col-span-2">
        <div className="text-xs uppercase tracking-wider text-ink/65 dark:text-gold-soft/65">Stellar wallet</div>
        <div className="mono mt-2 break-all text-sm text-ink dark:text-white/90">{fan?.walletAddress ?? "Created on your first purchase"}</div>
        <div className="mt-2 text-xs text-ink/50 dark:text-gold-soft/50">Managed for you. No seed phrase, no XLM needed.</div>
      </div>
    </div>

      {/* Collections */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Panel title="Votes" empty="You have not voted yet." href="/vote" cta="Vote now" rows={(data?.votes ?? []).map((v: any) => ({ main: v.contestant, sub: v.round, tag: v.status }))} />
        <Panel title="Tickets" empty="No tickets yet." href="/tickets" cta="Buy a ticket" rows={(data?.tickets ?? []).map((t: any) => ({ main: `${t.tier} · seat ${t.seat}`, sub: t.eventName, tag: t.tokenId ? `NFT ${short(t.tokenId, 5)}` : "" }))} />
        <Panel title="Collectibles" empty="No collectibles yet." href="/contestants" cta="Collect" rows={(data?.collectibles ?? []).map((c: any) => ({ main: c.title, sub: `${c.priceUsdc} USDC`, tag: c.tokenId ? `NFT ${short(c.tokenId, 5)}` : "" }))} />
      </div>
    </div>
  );
}

function Panel({ title, rows, empty, href, cta }: { title: string; rows: { main: string; sub: string; tag: string }[]; empty: string; href: string; cta: string }) {
  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl text-ink dark:text-white">{title}</h2>
        <span className="chip">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-ink/60 dark:text-gold-soft/60">{empty}</p>
          <Link href={href} className="btn-ghost mt-3">{cta}</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl bg-cream dark:bg-gold/10 px-3 py-2 border border-line">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-ink dark:text-white">{r.main}</span>
                {r.tag && <span className="mono shrink-0 text-[11px] text-emerald">{r.tag}</span>}
              </div>
              <div className="truncate text-xs text-ink/60 dark:text-gold-soft/60">{r.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
