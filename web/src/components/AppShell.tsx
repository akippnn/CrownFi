"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Globe2,
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
  if (target === "/platform") return path === target;
  if (target === "/") return path === "/";
  return path === target || path.startsWith(`${target}/`);
}

function isPublicModuleActive(id: PublicPageantModuleId, path: string, pageantId: string) {
  const pageantPath = `/platform/pageants/${pageantId}`;
  switch (id) {
    case "overview":
      return path === pageantPath;
    case "contestants":
      return path.startsWith(`${pageantPath}/contestants`);
    case "vote":
      return path === "/vote";
    case "tickets":
      return path === "/tickets";
    case "predict":
      return path === `/pageants/${pageantId}/predict`;
    case "results":
      return path === `/pageants/${pageantId}/results`;
  }
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
  const [accountMenu, setAccountMenu] = useState(false);
  const [pageantMenu, setPageantMenu] = useState(false);
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

  useEffect(() => {
    setDrawer(false);
    setAccountMenu(false);
    setPageantMenu(false);
  }, [path]);

  const isControlPanel = path.startsWith("/manage");
  const isDirectory = path === "/platform";
  const pathPageantId = path.match(/^\/platform\/pageants\/([^/]+)/)?.[1] ?? null;
  const queryPageantId = search.get("pageant");
  const routeNeedsPageant = path === "/vote" || path === "/tickets" || path.startsWith("/pageants/") || path === "/contestants";
  const activePageantId =
    pathPageantId ||
    queryPageantId ||
    (!isDirectory && routeNeedsPageant ? siteContext.default_pageant_id || siteContext.pageants[0]?.id || null : null);
  const activePageant = siteContext.pageants.find((pageant) => pageant.id === activePageantId) ?? null;

  const contextLinks = activePageantId
    ? publicPageantModules.map((module) => ({
        ...module,
        href: module.href(activePageantId),
        Icon: contextIcons[module.id],
        active: isPublicModuleActive(module.id, path, activePageantId),
      }))
    : [];

  const desktopLinks = useMemo(() => {
    const links: Array<{ id: string; href: string; label: string; Icon?: LucideIcon; active: boolean }> = [
      { id: "explore", href: "/platform", label: "Explore", active: path === "/platform" },
    ];
    for (const item of contextLinks) {
      links.push({ id: item.id, href: item.href, label: item.label, Icon: item.Icon, active: item.active });
    }
    return links;
  }, [contextLinks, path]);

  const drawerLinks = useMemo(() => {
    const links = [
      { href: "/", label: "CrownFi home" },
      { href: "/platform", label: "Explore pageants" },
    ];
    if (setupRequired) links.push({ href: "/setup", label: "First-run setup" });
    if (isOrganizer) links.push({ href: "/manage", label: "Open control panel" });
    links.push({ href: "/account", label: "Account and wallets" });
    return links;
  }, [isOrganizer, setupRequired]);

  function changePageant(pageantId: string) {
    router.push(`/platform/pageants/${pageantId}`);
    setDrawer(false);
    setPageantMenu(false);
  }

  if (isControlPanel) {
    return <div className="min-h-screen bg-[#070708] text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#070708] pb-28 text-white lg:pb-0">
      <header className="sticky top-0 z-40 hidden border-b border-line bg-black/90 backdrop-blur-xl lg:block">
        <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5 px-6 py-3">
          <div className="relative flex min-w-0 items-center gap-3 justify-self-start">
            <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="CrownFi home">
              <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-8 w-8 object-contain" />
              <span className="font-display text-xl font-semibold tracking-wide text-gold">CrownFi</span>
            </Link>

            <button
              type="button"
              onClick={() => setPageantMenu((open) => !open)}
              className={`flex min-w-0 max-w-[300px] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${activePageant ? "border-gold/30 bg-gold/[0.08]" : "border-line bg-black/40 hover:border-gold/30"}`}
              aria-expanded={pageantMenu}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold"><Trophy size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-gold-soft/35">{activePageant ? "Viewing pageant" : "Pageant context"}</span>
                <span className="block truncate text-sm font-semibold text-white">{activePageant?.name || "Choose a pageant"}</span>
                {activePageant && <span className="block truncate text-[10px] text-gold-soft/40">{activePageant.organization_name}</span>}
              </span>
              <ChevronDown size={15} className={`shrink-0 text-gold-soft/50 transition ${pageantMenu ? "rotate-180" : ""}`} />
            </button>

            {pageantMenu && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setPageantMenu(false)} aria-label="Close pageant chooser" />
                <div className="absolute left-36 top-[calc(100%+0.75rem)] z-50 w-[min(430px,calc(100vw-3rem))] rounded-3xl border border-gold/20 bg-[#0b0b0d]/[0.98] p-3 shadow-2xl backdrop-blur-xl">
                  <div className="px-2 pb-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-soft/35">Change pageant</div>
                    <p className="mt-1 text-xs leading-5 text-gold-soft/45">Selecting another pageant changes the navigation and all pageant-scoped actions.</p>
                  </div>
                  <Link href="/platform" onClick={() => setPageantMenu(false)} className={`mb-2 flex items-center gap-3 rounded-2xl border p-3 ${isDirectory ? "border-gold/45 bg-gold/10" : "border-line bg-black/25 hover:border-gold/30"}`}>
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-gold"><Globe2 size={18} /></span>
                    <span><span className="block text-sm font-semibold text-white">Explore all pageants</span><span className="mt-0.5 block text-xs text-gold-soft/40">Leave the current pageant context</span></span>
                  </Link>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {siteContext.pageants.map((pageant) => {
                      const selected = pageant.id === activePageant?.id;
                      return (
                        <button key={pageant.id} type="button" onClick={() => changePageant(pageant.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? "border-gold/50 bg-gold/10" : "border-line bg-black/25 hover:border-gold/30 hover:bg-gold/[0.05]"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{pageant.name}</div><div className="mt-1 truncate text-xs text-gold-soft/40">{pageant.organization_name}</div></div>
                            <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${selected ? "bg-gold text-black" : "bg-white/[0.05] text-gold-soft/50"}`}>{selected ? "Current" : pageant.status}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <nav className="flex items-center justify-center gap-1 justify-self-center" aria-label="Primary navigation">
            {desktopLinks.map(({ id, href, label, Icon, active }) => (
              <Link key={id} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition ${active ? "bg-gold text-black" : "text-gold-soft/65 hover:bg-gold/10 hover:text-white"}`}>
                {Icon && <Icon size={14} />} {label}
              </Link>
            ))}
          </nav>

          <div className="relative flex items-center justify-end gap-2 justify-self-end">
            {isOrganizer && <Link href="/manage" className="rounded-full border border-gold/25 px-4 py-2 text-xs font-semibold text-gold-soft transition hover:bg-gold hover:text-black">Control panel</Link>}
            <button
              type="button"
              onClick={() => (address ? setAccountMenu((open) => !open) : connect())}
              disabled={connecting}
              className="flex min-h-10 items-center gap-2 rounded-full border border-gold/20 bg-black/50 px-2.5 py-1.5 text-sm transition hover:border-gold disabled:opacity-60"
              aria-label={address ? "Open account menu" : "Sign in with Freighter"}
              aria-expanded={address ? accountMenu : undefined}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gold text-black"><Icons.Wallet size={14} strokeWidth={2} /></span>
              <span className="max-w-[130px] truncate text-gold-soft">{connecting ? "Connecting…" : address ? short(address) : "Sign in"}</span>
            </button>
            {accountMenu && address && <AccountMenu account={account} address={address} isAdmin={isAdmin} isOrganizer={isOrganizer} stellarNetwork={stellarNetwork} disconnect={disconnect} close={() => setAccountMenu(false)} />}
          </div>
        </div>
      </header>

      <div className="lg:hidden">
        <button type="button" onClick={() => setDrawer(true)} className="fixed left-4 top-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-gold/25 bg-black/80 text-gold-soft shadow-2xl backdrop-blur-xl" aria-label="Open navigation">
          <Icons.Menu size={19} />
        </button>
        <button type="button" onClick={() => (address ? setAccountMenu((open) => !open) : connect())} className="fixed right-4 top-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-gold/25 bg-black/80 text-black shadow-2xl backdrop-blur-xl" aria-label={address ? "Open account menu" : "Sign in with Freighter"}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold"><Icons.Wallet size={15} /></span>
        </button>

        <div className="mx-auto flex max-w-7xl items-center justify-center px-20 pt-5 text-center">
          <Link href={activePageant ? `/platform/pageants/${activePageant.id}` : "/"} className="flex min-w-0 flex-col items-center">
            <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-10 w-10 object-contain" />
            <span className="mt-1 max-w-[230px] truncate font-display text-lg font-semibold text-gold">{activePageant?.name || "CrownFi"}</span>
            <span className="max-w-[230px] truncate text-[10px] uppercase tracking-[0.14em] text-gold-soft/35">{activePageant ? activePageant.organization_name : isDirectory ? "Explore all pageants" : "Pageant platform"}</span>
          </Link>
        </div>

        {accountMenu && address && <div className="fixed right-4 top-16 z-50"><AccountMenu account={account} address={address} isAdmin={isAdmin} isOrganizer={isOrganizer} stellarNetwork={stellarNetwork} disconnect={disconnect} close={() => setAccountMenu(false)} mobile /></div>}
      </div>

      {error && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <span>{error}{needsInstall && <> <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="font-semibold text-gold underline">Get Freighter</a></>}</span>
            <button onClick={clearError} aria-label="Dismiss"><Icons.X size={15} /></button>
          </div>
        </div>
      )}

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/75" onClick={() => setDrawer(false)} aria-label="Close navigation" />
          <aside className="absolute left-3 top-3 h-[calc(100%-1.5rem)] w-[min(360px,calc(100vw-1.5rem))] overflow-y-auto rounded-[2rem] border border-line bg-[#08080a] p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between gap-3">
              <Link href="/" onClick={() => setDrawer(false)} className="flex items-center gap-2"><img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-8 w-8" /><span className="font-display text-xl font-semibold text-gold">CrownFi</span></Link>
              <button onClick={() => setDrawer(false)} className="grid h-10 w-10 place-items-center rounded-full border border-line text-gold-soft/60" aria-label="Close navigation"><Icons.X size={17} /></button>
            </div>

            <div className="mb-6 rounded-3xl border border-gold/20 bg-gold/[0.07] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Pageant context</div>
              <div className="mt-2 text-lg font-semibold text-white">{activePageant?.name || "No pageant selected"}</div>
              <div className="mt-1 text-xs text-gold-soft/40">{activePageant?.organization_name || "Choose a pageant to change the available experience."}</div>
              <div className="mt-4 space-y-2">
                <Link href="/platform" onClick={() => setDrawer(false)} className="block rounded-2xl border border-line bg-black/25 px-3 py-3 text-sm font-semibold text-gold-soft">Explore all pageants</Link>
                {siteContext.pageants.map((pageant) => (
                  <button key={pageant.id} type="button" onClick={() => changePageant(pageant.id)} className={`w-full rounded-2xl border px-3 py-3 text-left ${pageant.id === activePageant?.id ? "border-gold/50 bg-gold/10" : "border-line bg-black/25"}`}>
                    <span className="block text-sm font-semibold text-white">{pageant.name}</span><span className="mt-1 block text-xs text-gold-soft/40">{pageant.organization_name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/30">Primary</div>
            <nav className="mt-2 grid gap-1">
              {drawerLinks.map((link) => <Link key={link.href} href={link.href} onClick={() => setDrawer(false)} className={`rounded-xl px-3 py-3 text-sm ${isActivePath(path, link.href) ? "bg-gold font-semibold text-black" : "text-gold-soft/75 hover:bg-gold/10"}`}>{link.label}</Link>)}
            </nav>

            {contextLinks.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/30">Selected pageant</div>
                <nav className="grid gap-1">
                  {contextLinks.map(({ id, mobileLabel, href, Icon, active }) => <Link key={id} href={href} onClick={() => setDrawer(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "bg-gold/15 text-gold-soft" : "text-gold-soft/70 hover:bg-gold/10"}`}><Icon size={17} /> {mobileLabel}</Link>)}
                </nav>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-line bg-white/[0.02] px-3 py-3 text-xs text-gold-soft/40">Stellar {stellarNetwork === "public" ? "Mainnet" : "Testnet"}</div>
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <nav className="fixed bottom-3 left-3 right-3 z-40 overflow-hidden rounded-[1.4rem] border border-gold/20 bg-black/90 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
        <div className="mx-auto flex max-w-xl items-stretch">
          <MobileLink href="/platform" label="Explore" active={path === "/platform"} Icon={Globe2} />
          {activePageant ? <MobileLink href={`/platform/pageants/${activePageant.id}`} label="Pageant" active={path === `/platform/pageants/${activePageant.id}`} Icon={Trophy} /> : <MobileLink href="/" label="Home" active={path === "/"} Icon={Icons.Crown} />}
          {activePageant ? <MobileLink href={`/vote?pageant=${activePageant.id}`} label="Vote" active={path === "/vote"} Icon={Vote} /> : <MobileLink href="/tickets" label="Tickets" active={path === "/tickets"} Icon={Ticket} />}
          {isOrganizer && <MobileLink href="/manage" label="Manage" active={path.startsWith("/manage")} Icon={Icons.Lock} />}
          <MobileLink href="/account" label="Account" active={path === "/account"} Icon={Icons.Me} />
        </div>
      </nav>
    </div>
  );
}

function AccountMenu({ account, address, isAdmin, isOrganizer, stellarNetwork, disconnect, close, mobile = false }: {
  account: { display_name?: string | null } | null;
  address: string;
  isAdmin: boolean;
  isOrganizer: boolean;
  stellarNetwork: string;
  disconnect: () => void;
  close: () => void;
  mobile?: boolean;
}) {
  return (
    <>
      {!mobile && <button className="fixed inset-0 z-40 cursor-default" onClick={close} aria-label="Close account menu" />}
      <div className={`${mobile ? "w-[min(18rem,calc(100vw-2rem))]" : "absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))]"} rounded-2xl border border-line bg-[#0b0b0d]/[0.98] p-3 text-sm shadow-2xl`}>
        <div className="mb-2 rounded-xl border border-gold/10 bg-gold/10 px-3 py-3"><div className="font-semibold text-white">{account?.display_name || "CrownFi account"}</div><div className="mt-1 font-mono text-xs text-gold-soft/55">{short(address, 7)}</div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"><span className="rounded-full bg-black/30 px-2 py-1 text-gold-soft/60">{stellarNetwork}</span>{isAdmin && <span className="rounded-full bg-gold/20 px-2 py-1 text-gold-soft">Site admin</span>}{!isAdmin && isOrganizer && <span className="rounded-full bg-gold/20 px-2 py-1 text-gold-soft">Organizer</span>}</div></div>
        <Link href="/account" onClick={close} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-gold-soft/75 hover:bg-gold/10 hover:text-white"><Icons.Me size={15} /> Account and wallets</Link>
        {isOrganizer && <Link href="/manage" onClick={close} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-gold-soft/75 hover:bg-gold/10 hover:text-white"><Icons.Lock size={15} /> Control panel</Link>}
        <button onClick={() => { disconnect(); close(); }} className="mt-1 w-full rounded-lg px-3 py-2.5 text-left text-red-200/70 hover:bg-red-400/10 hover:text-red-100">Sign out</button>
      </div>
    </>
  );
}

function MobileLink({ href, label, active, Icon }: { href: string; label: string; active: boolean; Icon: LucideIcon }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-semibold ${active ? "bg-gold/[0.09] text-gold" : "text-gold-soft/50"}`}>
      <Icon size={19} strokeWidth={active ? 2.25 : 1.75} />
      <span>{label}</span>
    </Link>
  );
}
