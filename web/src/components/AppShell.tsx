"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/session/SessionProvider";
import { Icons } from "./icons";
import { short } from "@/lib/format";

const USER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/vote", label: "Vote" },
  { href: "/verify", label: "Verify" },
  { href: "/tickets", label: "Tickets" },
  { href: "/contestants", label: "Collect" },
  { href: "/organize", label: "Organize" },
  { href: "/me", label: "Me" },
];

const TABS = [
  { href: "/vote", label: "Vote", Icon: Icons.Vote },
  { href: "/verify", label: "Verify", Icon: Icons.Verify },
  { href: "/tickets", label: "Tickets", Icon: Icons.Tickets },
  { href: "/contestants", label: "Collect", Icon: Icons.Collect },
  { href: "/me", label: "Me", Icon: Icons.Me },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const { fan, address, isAdmin, connect, disconnect, connecting, error, needsInstall, clearError } = useSession();

  const links = isAdmin ? [...USER_LINKS, { href: "/admin", label: "Admin" }] : USER_LINKS;

  return (
    <div className="min-h-screen pb-20 sm:pb-0 text-ink dark:text-white">
      <header className="fixed top-4 inset-x-0 z-50 mx-auto max-w-5xl w-[92%] sm:w-full rounded-full border border-gold/25 bg-white/85 dark:bg-black/85 backdrop-blur-xl px-2.5 py-1.5 shadow-lg shadow-black/5 dark:shadow-[0_12px_40px_rgba(0,0,0,0.9)]">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="btn-ghost h-9 w-9 !px-0 sm:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Icons.Menu size={18} strokeWidth={1.75} />
            </button>
            <Link href="/" className="flex items-center gap-2 pl-2">
              <img src="/assets/brand/crownfi_logo_crown-chain_gold_transparent_reclean.webp" alt="CrownFi Logo" className="h-6 w-6 object-contain" />
              <span className="font-display text-xl font-semibold tracking-wide text-gold">CrownFi</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 text-sm sm:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href}
                className={`rounded-full px-3.5 py-1.5 transition ${path === l.href ? "bg-gradient-to-b from-[#f1df99] via-[#e3bd47] to-[#cca025] dark:from-[#f3e5ab] dark:via-[#e7c858] dark:to-[#d1ab2c] text-black font-semibold shadow-md" : "text-ink/70 hover:text-ink hover:bg-gold/15 dark:text-gold-soft/75 dark:hover:text-white dark:hover:bg-gold/10"}`}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="relative">
            {/* One click: connect straight to Freighter when signed out; open the account menu when signed in. */}
            <button
              onClick={() => (address ? setMenu((m) => !m) : connect())}
              disabled={connecting}
              className="flex items-center gap-2 rounded-full border border-gold/25 bg-white/50 dark:bg-black/50 px-2.5 py-1.5 text-sm transition hover:border-gold disabled:opacity-60"
              aria-label={address ? "Account" : "Connect Freighter"}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-b from-[#f1df99] via-[#e3bd47] to-[#cca025] dark:from-[#f3e5ab] dark:via-[#e7c858] dark:to-[#d1ab2c] text-black">
                <Icons.Wallet size={14} strokeWidth={2} />
              </span>
              <span className="max-w-[130px] truncate text-gold-ink dark:text-gold-soft font-semibold">
                {connecting ? "Connecting…" : address ? short(address, 4) : "Connect Freighter"}
              </span>
            </button>

            {menu && address && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-50 mt-2 w-64 glass p-3 text-sm shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]">
                  <div className="mb-2 rounded-xl bg-gold/10 px-3 py-2 border border-gold/10">
                    <div className="text-xs text-ink/60 dark:text-gold-soft/60">Connected</div>
                    <div className="mono text-ink dark:text-white">{short(address, 6)}</div>
                    {fan && <div className="mt-1 text-xs text-gold">{fan.points} loyalty points</div>}
                    {isAdmin && <div className="mt-1 inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-gold-soft">Admin wallet</div>}
                  </div>
                  <button onClick={() => { disconnect(); setMenu(false); }} className="w-full rounded-lg px-3 py-1.5 text-left text-ink dark:text-gold-soft hover:bg-gold/10 dark:hover:text-white">Disconnect</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Connection feedback — so a failed connect never looks like a dead button. */}
      {error && (
        <div className="mx-auto mt-3 max-w-6xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby-ink">
            <div className="flex items-start gap-2">
              <Icons.Wallet size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>
                {error}
                {needsInstall && (
                  <>
                    {" "}
                    <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2 text-gold">
                      Get Freighter
                    </a>
                  </>
                )}
              </span>
            </div>
            <button onClick={clearError} aria-label="Dismiss" className="shrink-0 rounded-md px-1 text-ruby-ink/70 hover:text-ruby-ink">✕</button>
          </div>
        </div>
      )}

      {drawer && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 h-full w-72 border-r border-line bg-cream dark:bg-black/95 p-5">
            <div className="mb-6 flex items-center gap-2">
              <img src="/assets/brand/crownfi_logo_crown-chain_gold_transparent_reclean.webp" alt="CrownFi Logo" className="h-6 w-6 object-contain" />
              <span className="font-display text-xl font-semibold text-gold">CrownFi</span>
            </div>
            <nav className="grid gap-1">
              {links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setDrawer(false)}
                  className={`rounded-xl px-3 py-2.5 text-sm ${path === l.href ? "bg-gradient-to-b from-[#f1df99] via-[#e3bd47] to-[#cca025] dark:from-[#f3e5ab] dark:via-[#e7c858] dark:to-[#d1ab2c] text-black font-semibold" : "text-ink/80 dark:text-gold-soft/80 hover:bg-gold/10 hover:text-ink dark:hover:text-white"}`}>
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pt-24 pb-8 sm:px-6 sm:pt-28">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/90 dark:bg-black/90 backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {TABS.map(({ href, label, Icon }) => {
            const active = path === href;
            return (
              <Link key={href} href={href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? "text-gold-ink dark:text-gold" : "text-ink/60 dark:text-gold-soft/50"}`}>
                <Icon size={20} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
