"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Crown,
  Database,
  Globe2,
  Plus,
  RefreshCw,
  Sprout,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useSession } from "@/session/SessionProvider";

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
};

type Pageant = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  timezone: string;
  venue_name?: string | null;
};

type Overview = {
  is_site_admin: boolean;
  organizations: Organization[];
  pageants: Pageant[];
};

type SiteSettings = {
  settings: {
    site_name: string;
    stellar_network: "testnet" | "public";
    mainnet_enabled: boolean;
    default_pageant_id?: string | null;
    pageant_selector_enabled: boolean;
  };
  mainnet_available: boolean;
  integrations: Array<{
    provider: string;
    value_suffix?: string | null;
    validation_status: string;
  }>;
};

type Member = {
  user_id: string;
  display_name: string;
  email?: string | null;
  role: string;
  status: string;
  primary_wallet?: string | null;
};

type Tab = "pageants" | "people" | "site";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function json(response: Response) {
  return response.json().catch(() => ({}));
}

export default function ManagePage() {
  const {
    account,
    address,
    connect,
    isAdmin,
    isOrganizer,
    setupRequired,
    connecting,
    ready,
    refresh: refreshSession,
  } = useSession();
  const [tab, setTab] = useState<Tab>("pageants");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [pageantId, setPageantId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>({ text: "" });
  const [pageantForm, setPageantForm] = useState({ name: "", slug: "", description: "", venueName: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "People's Choice", slug: "peoples-choice" });
  const [contestantForm, setContestantForm] = useState({ displayName: "", countryCode: "PH", sash: "PH", contestantNumber: "" });
  const [memberForm, setMemberForm] = useState({ walletAddress: "", role: "editor" });
  const [siteForm, setSiteForm] = useState({ siteName: "CrownFi", defaultPageantId: "", selector: false });

  const selectedOrganization = useMemo(
    () => overview?.organizations.find((item) => item.id === organizationId) ?? null,
    [overview, organizationId],
  );
  const pageants = useMemo(
    () => overview?.pageants.filter((item) => item.organization_id === organizationId) ?? [],
    [overview, organizationId],
  );
  const selectedPageant = pageants.find((item) => item.id === pageantId) ?? null;
  const canManageMembers =
    isAdmin || selectedOrganization?.role === "owner" || selectedOrganization?.role === "admin";

  async function load() {
    if (!account) return;
    setBusy("load");
    setNotice({ text: "" });
    try {
      const overviewResponse = await fetch("/api/manage/overview", { cache: "no-store" });
      const overviewData = await json(overviewResponse);
      if (!overviewResponse.ok) throw new Error(overviewData.error || "manage_overview_failed");
      setOverview(overviewData);
      const firstOrganization = organizationId || overviewData.organizations?.[0]?.id || "";
      setOrganizationId(firstOrganization);
      const firstPageant =
        pageantId || overviewData.pageants?.find((item: Pageant) => item.organization_id === firstOrganization)?.id || "";
      setPageantId(firstPageant);

      if (isAdmin) {
        const siteResponse = await fetch("/api/manage/site-settings", { cache: "no-store" });
        const siteData = await json(siteResponse);
        if (siteResponse.ok) {
          setSite(siteData);
          setSiteForm({
            siteName: siteData.settings.site_name,
            defaultPageantId: siteData.settings.default_pageant_id || "",
            selector: Boolean(siteData.settings.pageant_selector_enabled),
          });
        }
      }
    } catch (error) {
      setNotice({ text: String((error as Error).message || error), error: true });
    } finally {
      setBusy("");
    }
  }

  async function loadMembers(nextOrganizationId = organizationId) {
    if (!nextOrganizationId || !canManageMembers) {
      setMembers([]);
      return;
    }
    const response = await fetch(`/api/manage/members?organizationId=${encodeURIComponent(nextOrganizationId)}`, { cache: "no-store" });
    const data = await json(response);
    setMembers(response.ok && Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    if (account && isOrganizer) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, isOrganizer]);

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, canManageMembers]);

  function flash(text: string, error = false) {
    setNotice({ text, error });
  }

  async function mutate(path: string, body: unknown, key: string) {
    setBusy(key);
    setNotice({ text: "" });
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await json(response);
      if (!response.ok) throw new Error(data.error || "request_failed");
      return data;
    } catch (error) {
      flash(String((error as Error).message || error), true);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function createPageant(event: FormEvent) {
    event.preventDefault();
    const data = await mutate(
      "/api/manage/pageants",
      {
        organization_id: organizationId,
        name: pageantForm.name,
        slug: pageantForm.slug,
        description: pageantForm.description || null,
        venue_name: pageantForm.venueName || null,
        timezone: "Asia/Manila",
      },
      "pageant",
    );
    if (!data) return;
    flash("Pageant created as a durable draft.");
    setPageantForm({ name: "", slug: "", description: "", venueName: "" });
    await load();
    setPageantId(data.id);
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    const data = await mutate(
      "/api/manage/categories",
      {
        pageant_id: pageantId,
        name: categoryForm.name,
        slug: categoryForm.slug,
      },
      "category",
    );
    if (data) flash("Category saved. Lifecycle controls remain a later voting slice.");
  }

  async function createContestant(event: FormEvent) {
    event.preventDefault();
    const data = await mutate(
      "/api/manage/contestants",
      {
        pageant_id: pageantId,
        display_name: contestantForm.displayName,
        country_code: contestantForm.countryCode,
        sash: contestantForm.sash,
        contestant_number: contestantForm.contestantNumber ? Number(contestantForm.contestantNumber) : null,
        country_representation: contestantForm.countryCode,
      },
      "contestant",
    );
    if (!data) return;
    flash("Contestant added and persisted.");
    setContestantForm({ displayName: "", countryCode: "PH", sash: "PH", contestantNumber: "" });
  }

  async function seedReference() {
    const data = await mutate(
      "/api/manage/seed-miss-stellarverse",
      { organizationId },
      "seed",
    );
    if (!data) return;
    flash("Miss Stellarverse reconciled. Contract and collectible records remain explicitly unverified fixtures.");
    await load();
    setPageantId(data.pageant_id);
  }

  async function grantMember(event: FormEvent) {
    event.preventDefault();
    const data = await mutate(
      "/api/manage/members",
      {
        organizationId,
        walletAddress: memberForm.walletAddress,
        network: "testnet",
        role: memberForm.role,
      },
      "member",
    );
    if (!data) return;
    flash(memberForm.role === "editor" ? "Organizer access granted." : "Organization access updated.");
    setMemberForm({ walletAddress: "", role: "editor" });
    await loadMembers();
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    setBusy("site");
    const response = await fetch("/api/manage/site-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site_name: siteForm.siteName,
        stellar_network: "testnet",
        default_pageant_id: siteForm.defaultPageantId || null,
        clear_default_pageant: !siteForm.defaultPageantId,
        pageant_selector_enabled: siteForm.selector,
      }),
    });
    const data = await json(response);
    setBusy("");
    if (!response.ok) {
      flash(data.error || "site_settings_failed", true);
      return;
    }
    setSite(data);
    flash("Site settings saved. The public context will use the selected published pageant.");
    await refreshSession();
  }

  if (!ready) return <Panel>Loading Manage…</Panel>;
  if (setupRequired) {
    return (
      <Panel>
        <Crown className="mx-auto text-gold" size={28} />
        <h1 className="mt-4 text-center font-display text-3xl font-semibold text-white">CrownFi still needs its first administrator</h1>
        <p className="mt-3 text-center text-sm text-gold-soft/55">Finish the guarded setup before opening organizer and administrator tools.</p>
        <Link href="/setup" className="mx-auto mt-6 block w-fit rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black">Open first-run setup</Link>
      </Panel>
    );
  }
  if (!account) {
    return (
      <Panel>
        <ShieldCheck className="mx-auto text-gold" size={28} />
        <h1 className="mt-4 text-center font-display text-3xl font-semibold text-white">Sign in to Manage CrownFi</h1>
        <button onClick={connect} disabled={connecting} className="mx-auto mt-6 block rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black">
          {connecting ? "Waiting for Freighter…" : "Sign in with Freighter"}
        </button>
      </Panel>
    );
  }
  if (!isOrganizer) {
    return (
      <Panel>
        <Users className="mx-auto text-gold" size={28} />
        <h1 className="mt-4 text-center font-display text-3xl font-semibold text-white">Public user account</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-gold-soft/55">
          This account has no organizer membership. A site or organization administrator can grant organizer access after this wallet has signed in once.
        </p>
        <Link href="/account" className="mx-auto mt-6 block w-fit rounded-xl border border-gold/30 px-5 py-3 text-sm font-semibold text-gold-soft">Open account and linked wallets</Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-gold/25 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_45%),rgba(7,7,9,0.96)] p-7 sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft/45">Role-aware workspace</div>
            <h1 className="mt-2 font-display text-4xl font-semibold text-white">Manage CrownFi</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gold-soft/55">
              Configure durable pageant records as an organizer. Site administrators also control hosted-pageant context, network readiness, and organization access.
            </p>
          </div>
          <button onClick={load} disabled={busy === "load"} className="rounded-xl border border-gold/25 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold-soft">
            <RefreshCw className={`mr-2 inline ${busy === "load" ? "animate-spin" : ""}`} size={15} /> Refresh
          </button>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-line bg-black/35 p-2">
        <TabButton active={tab === "pageants"} onClick={() => setTab("pageants")} icon={<Building2 size={16} />}>Organizer studio</TabButton>
        {canManageMembers && <TabButton active={tab === "people"} onClick={() => setTab("people")} icon={<UserPlus size={16} />}>People and roles</TabButton>}
        {isAdmin && <TabButton active={tab === "site"} onClick={() => setTab("site")} icon={<Settings2 size={16} />}>Site settings</TabButton>}
      </nav>

      {notice.text && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.error ? "border-red-400/25 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-line bg-black/35 p-4">
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-gold-soft/40">
            Organization
            <select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setPageantId(""); }} className="rounded-xl border border-line bg-black px-3 py-2.5 text-sm normal-case tracking-normal text-white">
              {overview?.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
          <div className="mt-5 space-y-2">
            {pageants.map((pageant) => (
              <button key={pageant.id} onClick={() => setPageantId(pageant.id)} className={`w-full rounded-xl px-3 py-3 text-left text-sm ${pageantId === pageant.id ? "bg-gold text-black" : "bg-white/[0.03] text-gold-soft/65 hover:bg-gold/10"}`}>
                <span className="block font-semibold">{pageant.name}</span>
                <span className="mt-1 block text-[10px] uppercase tracking-[0.13em] opacity-65">{pageant.status}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          {tab === "pageants" && (
            <>
              <section className="rounded-3xl border border-line bg-black/35 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-white">Pageants</h2>
                    <p className="mt-1 text-sm text-gold-soft/50">Create durable drafts or reconcile the deterministic browser-test reference pageant.</p>
                  </div>
                  <button onClick={seedReference} disabled={!organizationId || busy === "seed"} className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold-soft disabled:opacity-45">
                    <Sprout className="mr-2 inline" size={16} /> {busy === "seed" ? "Reconciling…" : "Seed Miss Stellarverse"}
                  </button>
                </div>
                <form onSubmit={createPageant} className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Input label="Pageant name" value={pageantForm.name} onChange={(value) => setPageantForm((current) => ({ ...current, name: value, slug: current.slug || slugify(value) }))} required />
                  <Input label="Slug" value={pageantForm.slug} onChange={(value) => setPageantForm((current) => ({ ...current, slug: slugify(value) }))} required />
                  <Input label="Venue" value={pageantForm.venueName} onChange={(value) => setPageantForm((current) => ({ ...current, venueName: value }))} />
                  <Input label="Description" value={pageantForm.description} onChange={(value) => setPageantForm((current) => ({ ...current, description: value }))} />
                  <button disabled={!organizationId || busy === "pageant"} className="rounded-xl bg-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-45 sm:col-span-2">
                    <Plus className="mr-2 inline" size={16} /> Create durable pageant draft
                  </button>
                </form>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <form onSubmit={createCategory} className="rounded-3xl border border-line bg-black/35 p-6">
                  <h2 className="font-display text-2xl font-semibold text-white">Category</h2>
                  <p className="mt-1 text-sm text-gold-soft/50">Selected pageant: {selectedPageant?.name || "none"}</p>
                  <div className="mt-5 grid gap-4">
                    <Input label="Category name" value={categoryForm.name} onChange={(value) => setCategoryForm((current) => ({ ...current, name: value, slug: slugify(value) }))} required />
                    <Input label="Slug" value={categoryForm.slug} onChange={(value) => setCategoryForm((current) => ({ ...current, slug: slugify(value) }))} required />
                    <button disabled={!pageantId || busy === "category"} className="rounded-xl bg-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-45">Save category</button>
                  </div>
                </form>

                <form onSubmit={createContestant} className="rounded-3xl border border-line bg-black/35 p-6">
                  <h2 className="font-display text-2xl font-semibold text-white">Contestant</h2>
                  <p className="mt-1 text-sm text-gold-soft/50">Adds a persisted contestant to the selected pageant.</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Input label="Display name" value={contestantForm.displayName} onChange={(value) => setContestantForm((current) => ({ ...current, displayName: value }))} required className="sm:col-span-2" />
                    <Input label="Country code" value={contestantForm.countryCode} onChange={(value) => setContestantForm((current) => ({ ...current, countryCode: value.toUpperCase().slice(0, 2) }))} required />
                    <Input label="Sash" value={contestantForm.sash} onChange={(value) => setContestantForm((current) => ({ ...current, sash: value.toUpperCase() }))} required />
                    <Input label="Contestant number" type="number" value={contestantForm.contestantNumber} onChange={(value) => setContestantForm((current) => ({ ...current, contestantNumber: value }))} className="sm:col-span-2" />
                    <button disabled={!pageantId || busy === "contestant"} className="rounded-xl bg-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-45 sm:col-span-2">Add contestant</button>
                  </div>
                </form>
              </section>

              <section className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-100/70">
                <Database className="mr-2 inline text-amber-200" size={17} />
                Miss Stellarverse seeds pageant, contestants, a draft ticket product, and collectible definitions idempotently. It does not claim contract deployment, minting, payment, ownership, market settlement, or Explorer evidence.
              </section>
            </>
          )}

          {tab === "people" && canManageMembers && (
            <section className="rounded-3xl border border-line bg-black/35 p-6">
              <h2 className="font-display text-2xl font-semibold text-white">Organization access</h2>
              <p className="mt-2 text-sm leading-6 text-gold-soft/50">
                The target wallet must first sign in once as a public user. Granting “Organizer” maps to the existing organization editor role and never grants site-level settings access.
              </p>
              <form onSubmit={grantMember} className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                <Input label="Verified wallet address" value={memberForm.walletAddress} onChange={(value) => setMemberForm((current) => ({ ...current, walletAddress: value.toUpperCase() }))} required />
                <label className="grid gap-2 text-sm text-gold-soft/65">
                  <span>Role</span>
                  <select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))} className="rounded-xl border border-line bg-black px-3 py-2.5 text-white">
                    <option value="editor">Organizer</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Organization admin</option>
                  </select>
                </label>
                <button disabled={!organizationId || busy === "member"} className="self-end rounded-xl bg-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-45">Grant</button>
              </form>
              <div className="mt-6 divide-y divide-line rounded-2xl border border-line">
                {members.map((member) => (
                  <div key={member.user_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-white">{member.display_name}</div>
                      <div className="mt-1 font-mono text-xs text-gold-soft/40">{member.primary_wallet || "No primary wallet"}</div>
                    </div>
                    <span className="w-fit rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold capitalize text-gold-soft">{member.role === "editor" ? "organizer" : member.role}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "site" && isAdmin && site && (
            <form onSubmit={saveSite} className="space-y-6">
              <section className="rounded-3xl border border-line bg-black/35 p-6">
                <div className="flex items-center gap-3">
                  <Globe2 className="text-gold" size={22} />
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-white">Hosted pageant and network</h2>
                    <p className="text-sm text-gold-soft/50">Controls public context without rebuilding the frontend.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Input label="Site name" value={siteForm.siteName} onChange={(value) => setSiteForm((current) => ({ ...current, siteName: value }))} required />
                  <label className="grid gap-2 text-sm text-gold-soft/65">
                    <span>Default hosted pageant</span>
                    <select value={siteForm.defaultPageantId} onChange={(event) => setSiteForm((current) => ({ ...current, defaultPageantId: event.target.value }))} className="rounded-xl border border-line bg-black px-3 py-2.5 text-white">
                      <option value="">No default pageant</option>
                      {overview?.pageants.filter((pageant) => ["published", "active"].includes(pageant.status)).map((pageant) => <option key={pageant.id} value={pageant.id}>{pageant.name}</option>)}
                    </select>
                  </label>
                </div>
                <label className="mt-5 flex items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-sm text-gold-soft/65">
                  <input type="checkbox" checked={siteForm.selector} onChange={(event) => setSiteForm((current) => ({ ...current, selector: event.target.checked }))} className="mt-1 accent-[#d4af37]" />
                  <span><strong className="block text-white">Enable public pageant selector</strong>Visitors may choose among published pageants while deep links remain pageant-specific.</span>
                </label>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-gold/35 bg-gold/10 p-4">
                    <CheckCircle2 className="mr-2 inline text-gold" size={17} /> <strong className="text-white">Stellar Testnet</strong>
                    <p className="mt-2 text-xs leading-5 text-gold-soft/55">Enabled for the current build.</p>
                  </div>
                  <div className="cursor-not-allowed rounded-2xl border border-line bg-white/[0.02] p-4 opacity-40">
                    <Globe2 className="mr-2 inline" size={17} /> <strong className="text-white">Stellar Mainnet</strong>
                    <p className="mt-2 text-xs leading-5 text-gold-soft/55">Grayed out. Requires a future deployment flag and persisted production-readiness gate.</p>
                  </div>
                </div>
                <button disabled={busy === "site"} className="mt-6 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black disabled:opacity-45">Save site settings</button>
              </section>

              <section className="rounded-3xl border border-line bg-black/35 p-6">
                <h2 className="font-display text-2xl font-semibold text-white">Integration status</h2>
                <p className="mt-2 text-sm text-gold-soft/50">Only masked metadata is returned to the browser; protected values are never echoed.</p>
                <div className="mt-5 grid gap-3">
                  {site.integrations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-gold-soft/45">No optional integrations saved.</div>
                  ) : site.integrations.map((integration) => (
                    <div key={integration.provider} className="flex items-center justify-between gap-4 rounded-2xl border border-line p-4">
                      <div>
                        <div className="font-semibold text-white">{integration.provider}</div>
                        <div className="mt-1 text-xs text-gold-soft/40">Ending in {integration.value_suffix || "••••"}</div>
                      </div>
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gold-soft/55">{integration.validation_status.replaceAll("_", " ")}</span>
                    </div>
                  ))}
                </div>
              </section>
            </form>
          )}
        </main>
      </div>

      <div className="rounded-2xl border border-line bg-black/30 px-4 py-3 text-xs text-gold-soft/40">
        Signed in as {account.display_name} · {address}
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="mx-auto max-w-2xl rounded-[2rem] border border-gold/25 bg-black/40 p-8 sm:p-12">{children}</section>;
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${active ? "bg-gold text-black" : "text-gold-soft/60 hover:bg-gold/10 hover:text-white"}`}>{icon}{children}</button>;
}

function Input({ label, value, onChange, type = "text", required = false, className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; className?: string }) {
  return (
    <label className={`grid gap-2 text-sm text-gold-soft/65 ${className}`}>
      <span>{label}</span>
      <input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-line bg-black/55 px-3 py-2.5 text-white outline-none focus:border-gold/60" />
    </label>
  );
}
