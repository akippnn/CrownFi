"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/session/SessionProvider";
import { Icons } from "./icons";

function isActivePath(path: string, href: string) {
  return path === href || (href !== "/" && path.startsWith(`${href}/`));
}

function short(address: string, count = 5) {
  return `${address.slice(0, count + 1)}…${address.slice(-count)}`;
}

type PublicPageant = {
  id: string;
  name: string;
  slug: string;
  organization_name: string;
  status: string;
};

type SiteContext = {
  pageants: PublicPageant[];
  default_pageant_id?: string | null;
  pageant_selector_enabled: boolean;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [siteContext, setSiteContext] = useState<SiteContext>({
    pageants: [],
    default_pageant_id: null,
    pageant_selector_enabled: false,
  });
  const {
    account,
    address,
    isAdmin,
    isOrganizer,
    setupRequired,
    connect,
    disconnect,
    connecting,
    error,
    needsInstall,
    clearError,
    stellarNetwork,
  } = useSession();

  useEffect(() => {
    fetch("/api/site/context", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.pageants)) setSiteContext(data);
      })
      .catch(() => undefined);
  }, [setupRequired, account?.id]);

  const pathPageantId = path.match(/^\/platform\/pageants\/([^/]+)/)?.[1] ?? null;
  const queryPageantId = search.get("pageant");
  const activePageantId =
    pathPageantId ||
    queryPageantId ||
    siteContext.default_pageant_id ||
    siteContext.pageants[0]?.id ||
    null;
  const activePageant = siteContext.pageants.find((pageant) => pageant.id === activePageantId) ?? null;

  const globalLinks = useMemo(() => {
    const links = [{ href: "/platform", label: "Explore" }];
    if (setupRequired) links.push({ href: "/setup", label: "Setup" });
    if (isOrganizer) links.push({ href: "/manage", label: "Manage" });
    links.push({ href: "/account", label: "Account" });
    return links;
  }, [setupRequired, isOrganizer]);

  const contextLinks = activePageantId
    ? [
        { href: `/platform/pageants/${activePageantId}`, label: "Overview" },
        { href: `/platform/pageants/${activePageantId}#contestants`, label: "Contestants" },
        { href: `/vote?pageant=${activePageantId}`, label: "Vote" },
        { href: `/tickets?pageant=${activePageantId}`, label: "Tickets" },
        { href: `/pageants/${activePageantId}/predict`, label: "Predict" },
        { href: `/pageants/${activePageantId}/results`, label: "Results" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#070708] pb-20 text-white sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-black/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button className="btn-ghost h-9 w-9 shrink-0 !px-0 md:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Icons.Menu size={18} strokeWidth={1.75} />
            </button>
            <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="CrownFi home">
              <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-7 w-7 object-contain" />
              <span className="hidden font-display text-xl font-semibold tracking-wide text-gold sm:inline">CrownFi</span>
            </Link>

            {activePageant && (
              <div className="hidden min-w-0 items-center gap-2 border-l border-line pl-3 lg:flex">
                {siteContext.pageant_selector_enabled && siteContext.pageants.length > 1 ? (
                  <select
                    value={activePageant.id}
                    onChange={(event) => router.push(`/platform/pageants/${event.target.value}`)}
                    aria-label="Active pageant"
                    className="max-w-[220px] rounded-xl border border-line bg-black/60 px-3 py-2 text-sm text-gold-soft outline-none focus:border-gold/50"
                  >
                    {siteContext.pageants.map((pageant) => (
                      <option key={pageant.id} value={pageant.id}>{pageant.name}</option>
                    ))}
                  </select>
                ) : (
                  <Link href={`/platform/pageants/${activePageant.id}`} className="max-w-[220px] truncate text-sm font-semibold text-gold-soft/80 hover:text-white">
                    {activePageant.name}
                  </Link>
                )}
              </div>
            )}
          </div>

          <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Global navigation">
            {globalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3.5 py-1.5 transition ${isActivePath(path, link.href) ? "bg-gold text-black font-semibold" : "text-gold-soft/70 hover:bg-gold/10 hover:text-white"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="relative shrink-0">
            <button
              onClick={() => (address ? setMenu((current) => !current) : connect())}
              disabled={connecting}
              className="flex items-center gap-2 rounded-full border border-gold/20 bg-black/50 px-2.5 py-1.5 text-sm transition hover:border-gold disabled:opacity-60"
              aria-label={address ? "Open account menu" : "Sign in with Freighter"}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-gold text-black">
                <Icons.Wallet size={14} strokeWidth={2} />
              </span>
              <span className="hidden max-w-[130px] truncate text-gold-soft sm:inline">
                {connecting ? "Connecting…" : address ? short(address) : "Sign in"}
              </span>
            </button>

            {menu && address && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-line bg-[#0b0b0d]/98 p-3 text-sm shadow-2xl">
                  <div className="mb-2 rounded-xl border border-gold/10 bg-gold/10 px-3 py-3">
                    <div className="font-semibold text-white">{account?.display_name || "CrownFi account"}</div>
                    <div className="mt-1 font-mono text-xs text-gold-soft/55">{short(address, 7)}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                      <span className="rounded-full bg-black/30 px-2 py-1 text-gold-soft/60">{stellarNetwork}</span>
                      {isAdmin && <span className="rounded-full bg-gold/20 px-2 py-1 text-gold-soft">Site admin</span>}
                      {!isAdmin && isOrganizer && <span className="rounded-full bg-gold/20 px-2 py-1 text-gold-soft">Organizer</span>}
                    </div>
                  </div>
                  <Link href="/account" onClick={() => setMenu(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-gold-soft/75 hover:bg-gold/10 hover:text-white">
                    <Icons.Me size={15} /> Account and wallets
                  </Link>
                  {isOrganizer && (
                    <Link href="/manage" onClick={() => setMenu(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-gold-soft/75 hover:bg-gold/10 hover:text-white">
                      <Icons.Lock size={15} /> Manage
                    </Link>
                  )}
                  <button onClick={() => { disconnect(); setMenu(false); }} className="mt-1 w-full rounded-lg px-3 py-2.5 text-left text-red-200/70 hover:bg-red-400/10 hover:text-red-100">Sign out</button>
                </div>
              </>
            )}
          </div>
        </div>

        {contextLinks.length > 0 && (
          <nav className="border-t border-line/70" aria-label="Active pageant navigation">
            <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
              <span className="mr-2 hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.15em] text-gold-soft/30 sm:inline">{activePageant?.name}</span>
              {contextLinks.map((link) => (
                <Link key={link.label} href={link.href} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-gold-soft/60 hover:bg-gold/10 hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      {error && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <span>
              {error}
              {needsInstall && (
                <> <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="font-semibold text-gold underline">Get Freighter</a></>
              )}
            </span>
            <button onClick={clearError} aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-80 max-w-[88vw] border-r border-line bg-[#08080a] p-5">
            <div className="mb-6 flex items-center gap-2">
              <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-7 w-7" />
              <span className="font-display text-xl font-semibold text-gold">CrownFi</span>
            </div>
            {activePageant && (
              <div className="mb-5 rounded-2xl border border-line bg-white/[0.03] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Active pageant</div>
                <div className="mt-1 font-semibold text-white">{activePageant.name}</div>
              </div>
            )}
            <nav className="grid gap-1">
              {globalLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setDrawer(false)} className={`rounded-xl px-3 py-2.5 text-sm ${isActivePath(path, link.href) ? "bg-gold font-semibold text-black" : "text-gold-soft/75 hover:bg-gold/10"}`}>
                  {link.label}
                </Link>
              ))}
            </nav>
            {contextLinks.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Pageant</div>
                <nav className="grid gap-1">
                  {contextLinks.map((link) => <Link key={link.label} href={link.href} onClick={() => setDrawer(false)} className="rounded-xl px-3 py-2.5 text-sm text-gold-soft/70 hover:bg-gold/10">{link.label}</Link>)}
                </nav>
              </div>
            )}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-black/95 backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        <div className="mx-auto flex max-w-md items-stretch">
          <MobileLink href="/platform" label="Explore" active={isActivePath(path, "/platform")} Icon={Icons.Vote} />
          {isOrganizer && <MobileLink href="/manage" label="Manage" active={isActivePath(path, "/manage")} Icon={Icons.Lock} />}
          <MobileLink href="/account" label="Account" active={isActivePath(path, "/account")} Icon={Icons.Me} />
        </div>
      </nav>
    </div>
  );
}

function MobileLink({ href, label, active, Icon }: { href: string; label: string; active: boolean; Icon: typeof Icons.Me }) {
  return (
    <Link href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? "text-gold" : "text-gold-soft/50"}`}>
      <Icon size={20} strokeWidth={1.75} />
      {label}
    </Link>
  );
}
