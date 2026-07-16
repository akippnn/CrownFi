"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  LayoutDashboard,
  Sparkles,
  Ticket,
  Trophy,
  UsersRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/session/SessionProvider";
import { publicPageantModules, type PublicPageantModuleId } from "@/lib/crownfiModules";
import { Icons } from "./icons";

function routePath(href: string) {
  return href.split(/[?#]/)[0] || "/";
}

function isActivePath(path: string, href: string) {
  const target = routePath(href);
  return path === target || (target !== "/" && path.startsWith(`${target}/`));
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

const contextIcons: Record<PublicPageantModuleId, LucideIcon> = {
  overview: LayoutDashboard,
  contestants: UsersRound,
  vote: Vote,
  tickets: Ticket,
  predict: Sparkles,
  results: BarChart3,
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

  useEffect(() => setDrawer(false), [path]);

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
    ? publicPageantModules.map((module) => ({
        ...module,
        href: module.href(activePageantId),
        Icon: contextIcons[module.id],
      }))
    : [];

  function changePageant(pageantId: string) {
    router.push(`/platform/pageants/${pageantId}`);
    setDrawer(false);
  }

  return (
    <div className="min-h-screen bg-[#070708] pb-20 text-white md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button className="btn-ghost h-10 w-10 shrink-0 !px-0 md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
              <Icons.Menu size={18} strokeWidth={1.75} />
            </button>
            <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="CrownFi home">
              <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-7 w-7 object-contain" />
              <span className="hidden font-display text-xl font-semibold tracking-wide text-gold sm:inline">CrownFi</span>
            </Link>

            {activePageant && (
              <>
                <Link
                  href={`/platform/pageants/${activePageant.id}`}
                  className="min-w-0 max-w-[45vw] truncate border-l border-line pl-3 text-sm font-semibold text-gold-soft/80 sm:hidden"
                >
                  {activePageant.name}
                </Link>
                <div className="hidden min-w-0 items-center gap-2 border-l border-line pl-3 lg:flex">
                  {siteContext.pageant_selector_enabled && siteContext.pageants.length > 1 ? (
                    <select
                      value={activePageant.id}
                      onChange={(event) => changePageant(event.target.value)}
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
              </>
            )}
          </div>

          <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Global navigation">
            {globalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3.5 py-1.5 transition ${isActivePath(path, link.href) ? "bg-gold font-semibold text-black" : "text-gold-soft/70 hover:bg-gold/10 hover:text-white"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="relative shrink-0">
            <button
              onClick={() => (address ? setMenu((current) => !current) : connect())}
              disabled={connecting}
              className="flex min-h-10 items-center gap-2 rounded-full border border-gold/20 bg-black/50 px-2.5 py-1.5 text-sm transition hover:border-gold disabled:opacity-60"
              aria-label={address ? "Open account menu" : "Sign in with Freighter"}
              aria-expanded={address ? menu : undefined}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gold text-black">
                <Icons.Wallet size={14} strokeWidth={2} />
              </span>
              <span className="hidden max-w-[130px] truncate text-gold-soft sm:inline">
                {connecting ? "Connecting…" : address ? short(address) : "Sign in"}
              </span>
            </button>

            {menu && address && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-line bg-[#0b0b0d]/98 p-3 text-sm shadow-2xl">
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
          <nav className="hidden border-t border-line/70 md:block" aria-label="Active pageant navigation">
            <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
              <span className="mr-2 hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.15em] text-gold-soft/30 lg:inline">{activePageant?.name}</span>
              {contextLinks.map(({ id, label, href, Icon }) => (
                <Link
                  key={id}
                  href={href}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isActivePath(path, href) ? "bg-gold/15 text-gold-soft" : "text-gold-soft/60 hover:bg-gold/10 hover:text-white"}`}
                >
                  <Icon size={14} /> {label}
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
          <div className="absolute inset-0 bg-black/75" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-80 max-w-[88vw] overflow-y-auto border-r border-line bg-[#08080a] p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between gap-3">
              <Link href="/" onClick={() => setDrawer(false)} className="flex items-center gap-2">
                <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-7 w-7" />
                <span className="font-display text-xl font-semibold text-gold">CrownFi</span>
              </Link>
              <button onClick={() => setDrawer(false)} className="grid h-9 w-9 place-items-center rounded-full border border-line text-gold-soft/60" aria-label="Close navigation">
                <Icons.X size={17} />
              </button>
            </div>

            {activePageant && (
              <div className="mb-6 rounded-2xl border border-gold/20 bg-gold/[0.07] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Active pageant</div>
                {siteContext.pageant_selector_enabled && siteContext.pageants.length > 1 ? (
                  <select
                    value={activePageant.id}
                    onChange={(event) => changePageant(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-line bg-black/60 px-3 py-2.5 text-sm text-white"
                    aria-label="Choose active pageant"
                  >
                    {siteContext.pageants.map((pageant) => <option key={pageant.id} value={pageant.id}>{pageant.name}</option>)}
                  </select>
                ) : (
                  <Link href={`/platform/pageants/${activePageant.id}`} onClick={() => setDrawer(false)} className="mt-1 block font-semibold text-white">
                    {activePageant.name}
                  </Link>
                )}
                <div className="mt-1 text-xs text-gold-soft/45">{activePageant.organization_name}</div>
              </div>
            )}

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/30">Primary</div>
            <nav className="mt-2 grid gap-1">
              {globalLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setDrawer(false)} className={`rounded-xl px-3 py-2.5 text-sm ${isActivePath(path, link.href) ? "bg-gold font-semibold text-black" : "text-gold-soft/75 hover:bg-gold/10"}`}>
                  {link.label}
                </Link>
              ))}
            </nav>

            {contextLinks.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/30">Pageant experience</div>
                <nav className="grid gap-1">
                  {contextLinks.map(({ id, mobileLabel, href, Icon }) => (
                    <Link key={id} href={href} onClick={() => setDrawer(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${isActivePath(path, href) ? "bg-gold/15 text-gold-soft" : "text-gold-soft/70 hover:bg-gold/10"}`}>
                      <Icon size={17} /> {mobileLabel}
                    </Link>
                  ))}
                </nav>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-line bg-white/[0.02] px-3 py-3 text-xs text-gold-soft/40">
              Stellar {stellarNetwork === "public" ? "Mainnet" : "Testnet"}
            </div>
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-black/95 backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        <div className="mx-auto flex max-w-md items-stretch">
          <MobileLink href="/platform" label="Explore" active={isActivePath(path, "/platform")} Icon={Icons.Vote} />
          {activePageantId && <MobileLink href={`/platform/pageants/${activePageantId}`} label="Pageant" active={path.startsWith(`/platform/pageants/${activePageantId}`)} Icon={Trophy} />}
          {isOrganizer && <MobileLink href="/manage" label="Manage" active={isActivePath(path, "/manage")} Icon={Icons.Lock} />}
          <MobileLink href="/account" label="Account" active={isActivePath(path, "/account")} Icon={Icons.Me} />
        </div>
      </nav>
    </div>
  );
}

function MobileLink({ href, label, active, Icon }: { href: string; label: string; active: boolean; Icon: LucideIcon }) {
  return (
    <Link href={href} className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-semibold ${active ? "text-gold" : "text-gold-soft/50"}`}>
      <Icon size={19} strokeWidth={active ? 2.25 : 1.75} />
      <span>{label}</span>
    </Link>
  );
}
