"use client";

import { Link2, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { useSession } from "@/session/SessionProvider";

function short(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-7)}`;
}

export default function AccountPage() {
  const {
    account,
    address,
    connect,
    linkWallet,
    disconnect,
    connecting,
    stellarNetwork,
    error,
    ready,
  } = useSession();

  if (!ready) {
    return <div className="rounded-3xl border border-line bg-black/35 p-8 text-gold-soft/55">Loading account…</div>;
  }

  if (!account) {
    return (
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-gold/25 bg-black/40 p-8 text-center sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold/10 text-gold"><UserRound size={25} /></span>
        <h1 className="mt-5 font-display text-3xl font-semibold text-white">Your CrownFi account</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gold-soft/55">
          Sign in by proving ownership of a Freighter wallet. CrownFi creates one persistent account that may hold multiple linked wallets and role memberships.
        </p>
        <button onClick={connect} disabled={connecting} className="mt-6 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
          {connecting ? "Waiting for Freighter…" : "Sign in with Freighter"}
        </button>
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[2rem] border border-gold/25 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.16),transparent_45%),rgba(7,7,9,0.94)] p-7 sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft/45">CrownFi account</div>
            <h1 className="mt-2 font-display text-4xl font-semibold text-white">{account.display_name}</h1>
            <p className="mt-2 text-sm text-gold-soft/55">Account ID {account.id}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100/80">
            <ShieldCheck className="mr-2 inline" size={17} /> Wallet-authenticated session
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-black/35 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">Linked wallets</h2>
            <p className="mt-1 text-sm text-gold-soft/50">
              A wallet can belong to only one CrownFi account per Stellar network. Linking requires a fresh signed message.
            </p>
          </div>
          <button onClick={linkWallet} disabled={connecting} className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold-soft disabled:opacity-50">
            <Link2 className="mr-2 inline" size={16} /> {connecting ? "Waiting…" : "Link another wallet"}
          </button>
        </div>
        <div className="mt-6 grid gap-3">
          {account.wallets.map((wallet) => (
            <div key={wallet.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-black/25 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 text-gold"><Wallet size={18} /></span>
                <div>
                  <div className="font-mono text-sm text-white" title={wallet.address}>{short(wallet.address)}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-gold-soft/40">{wallet.network}</div>
                </div>
              </div>
              <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                {wallet.address === address && <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-200">Current</span>}
                {wallet.is_primary && <span className="rounded-full bg-gold/10 px-2.5 py-1 text-gold-soft">Primary</span>}
                {wallet.verified_at && <span className="rounded-full bg-white/5 px-2.5 py-1 text-gold-soft/55">Verified</span>}
              </div>
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-line bg-black/35 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-soft/40">Site role</div>
          <div className="mt-2 text-lg font-semibold text-white">{account.site_role || "Public user"}</div>
          <div className="mt-1 text-sm text-gold-soft/50">Current network: {stellarNetwork === "public" ? "Stellar Mainnet" : "Stellar Testnet"}</div>
        </div>
        <div className="rounded-3xl border border-line bg-black/35 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-soft/40">Organization roles</div>
          {account.organization_roles.length === 0 ? (
            <div className="mt-2 text-sm text-gold-soft/50">No organizer memberships.</div>
          ) : (
            <div className="mt-3 grid gap-2">
              {account.organization_roles.map((membership) => (
                <div key={membership.organization_id} className="flex justify-between gap-3 text-sm">
                  <span className="text-white">{membership.organization_name}</span>
                  <span className="capitalize text-gold-soft/60">{membership.role === "editor" ? "organizer" : membership.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <button onClick={disconnect} className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-200">
        Sign out of CrownFi
      </button>
    </div>
  );
}
