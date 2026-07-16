"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Crown,
  Database,
  Globe2,
  Images,
  Plus,
  RefreshCw,
  Sprout,
  Users,
} from "lucide-react";
import { ManageNavigation } from "@/components/manage/ManageNavigation";
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
  Notice,
  PageHeader,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/ui-kit";
import {
  isManageModuleId,
  manageModules,
  type ManageModuleId,
  visibleManageModules,
} from "@/lib/crownfiModules";
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
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const canManageMembers = isAdmin || selectedOrganization?.role === "owner" || selectedOrganization?.role === "admin";
  const visibleModules = visibleManageModules({ isSiteAdmin: isAdmin, canManageMembers });
  const requestedModule = searchParams.get("module");
  const activeModule: ManageModuleId =
    isManageModuleId(requestedModule) && visibleModules.some((module) => module.id === requestedModule)
      ? requestedModule
      : "overview";

  function selectModule(module: ManageModuleId) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("module", module);
    router.replace(`/manage?${next.toString()}`, { scroll: false });
  }

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
      { pageant_id: pageantId, name: categoryForm.name, slug: categoryForm.slug },
      "category",
    );
    if (data) flash("Category saved. Lifecycle and segment membership continue in Milestone B.");
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
    const data = await mutate("/api/manage/seed-miss-stellarverse", { organizationId }, "seed");
    if (!data) return;
    flash("Miss Stellarverse reconciled. Contract and collectible records remain explicitly unverified fixtures.");
    await load();
    setPageantId(data.pageant_id);
  }

  async function grantMember(event: FormEvent) {
    event.preventDefault();
    const data = await mutate(
      "/api/manage/members",
      { organizationId, walletAddress: memberForm.walletAddress, network: "testnet", role: memberForm.role },
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

  if (!ready) {
    return <EmptyState title="Loading Manage" description="Checking your CrownFi account, roles, and organization access…" />;
  }
  if (setupRequired) {
    return (
      <EmptyState
        title="CrownFi still needs its first administrator"
        description="Finish the guarded setup before opening organizer and administrator tools."
        action={<ButtonLink href="/setup">Open first-run setup</ButtonLink>}
      />
    );
  }
  if (!account) {
    return (
      <EmptyState
        title="Sign in to Manage CrownFi"
        description="Use a verified Freighter wallet to load organization-scoped tools."
        action={<Button onClick={connect} disabled={connecting}>{connecting ? "Waiting for Freighter…" : "Sign in with Freighter"}</Button>}
      />
    );
  }
  if (!isOrganizer) {
    return (
      <EmptyState
        title="Public user account"
        description="This account has no organizer membership. A site or organization administrator can grant access after the wallet has signed in once."
        action={<ButtonLink href="/account" variant="secondary">Open account and linked wallets</ButtonLink>}
      />
    );
  }

  const activeDefinition = manageModules.find((module) => module.id === activeModule)!;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Role-aware management"
        title="Manage CrownFi"
        description="Work within one organization and pageant at a time. Platform foundations stay separate from Voting, Ticketing, Markets, and Collectibles so each milestone can ship safely."
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={busy === "load"} className="w-full sm:w-auto">
            <RefreshCw className={busy === "load" ? "animate-spin" : ""} size={15} /> Refresh data
          </Button>
        }
        meta={
          <>
            <Badge tone="gold">{selectedOrganization?.role === "editor" ? "Organizer" : selectedOrganization?.role || "Member"}</Badge>
            <Badge tone="neutral">Stellar Testnet</Badge>
            {isAdmin && <Badge tone="success">Site administrator</Badge>}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <SelectField
            id="manage-organization"
            label="Organization"
            value={organizationId}
            onChange={(event) => {
              const nextOrganizationId = event.target.value;
              setOrganizationId(nextOrganizationId);
              setPageantId(overview?.pageants.find((pageant) => pageant.organization_id === nextOrganizationId)?.id || "");
            }}
          >
            {(overview?.organizations ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </SelectField>
          <SelectField
            id="manage-pageant"
            label="Active pageant"
            value={pageantId}
            onChange={(event) => setPageantId(event.target.value)}
          >
            <option value="">No pageant selected</option>
            {pageants.map((pageant) => <option key={pageant.id} value={pageant.id}>{pageant.name}</option>)}
          </SelectField>
          <div className="rounded-2xl border border-line bg-black/25 px-4 py-3 text-xs leading-5 text-gold-soft/45">
            <strong className="block text-sm text-white">{selectedPageant?.name || "Organization context"}</strong>
            {selectedPageant ? `${selectedPageant.status} · ${selectedPageant.timezone}` : "Choose or create a pageant to unlock pageant-scoped tasks."}
          </div>
        </CardContent>
      </Card>

      {notice.text && <Notice tone={notice.error ? "danger" : "success"}>{notice.text}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-6">
        <ManageNavigation
          activeModule={activeModule}
          onSelect={selectModule}
          isSiteAdmin={isAdmin}
          canManageMembers={Boolean(canManageMembers)}
        />

        <main className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-soft/35">Milestone {activeDefinition.milestone} module</div>
              <h2 className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">{activeDefinition.label}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gold-soft/50">{activeDefinition.description}</p>
            </div>
            {activeDefinition.availability !== "available" && (
              <Badge tone={activeDefinition.availability === "preview" ? "gold" : "neutral"}>
                {activeDefinition.availability === "preview" ? "Foundation preview" : "Planned module"}
              </Badge>
            )}
          </div>

          {activeModule === "overview" && (
            <OverviewModule
              organization={selectedOrganization}
              pageant={selectedPageant}
              pageantCount={pageants.length}
              memberCount={members.length}
              site={site}
              modules={visibleModules}
              onSelect={selectModule}
            />
          )}

          {activeModule === "pageants" && (
            <PageantsModule
              organizationId={organizationId}
              pageants={pageants}
              pageantId={pageantId}
              setPageantId={setPageantId}
              pageantForm={pageantForm}
              setPageantForm={setPageantForm}
              createPageant={createPageant}
              seedReference={seedReference}
              busy={busy}
            />
          )}

          {activeModule === "contestants" && (
            <ContestantsModule
              pageant={selectedPageant}
              form={contestantForm}
              setForm={setContestantForm}
              onSubmit={createContestant}
              busy={busy}
            />
          )}

          {activeModule === "categories" && (
            <CategoriesModule
              pageant={selectedPageant}
              form={categoryForm}
              setForm={setCategoryForm}
              onSubmit={createCategory}
              busy={busy}
            />
          )}

          {activeModule === "people" && canManageMembers && (
            <PeopleModule
              organization={selectedOrganization}
              members={members}
              form={memberForm}
              setForm={setMemberForm}
              onSubmit={grantMember}
              busy={busy}
            />
          )}

          {activeModule === "site" && isAdmin && site && (
            <SiteModule
              overview={overview}
              site={site}
              form={siteForm}
              setForm={setSiteForm}
              onSubmit={saveSite}
              busy={busy}
            />
          )}

          {["media", "voting", "tickets", "markets", "collectibles"].includes(activeModule) && (
            <ModuleBoundary moduleId={activeModule} organization={selectedOrganization} pageant={selectedPageant} />
          )}
        </main>
      </div>

      <div className="rounded-2xl border border-line bg-black/30 px-4 py-3 text-xs text-gold-soft/40">
        Signed in as {account.display_name} · {address}
      </div>
    </div>
  );
}

function OverviewModule({
  organization,
  pageant,
  pageantCount,
  memberCount,
  site,
  modules,
  onSelect,
}: {
  organization: Organization | null;
  pageant: Pageant | null;
  pageantCount: number;
  memberCount: number;
  site: SiteSettings | null;
  modules: ReturnType<typeof visibleManageModules>;
  onSelect: (module: ManageModuleId) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Organization", organization?.name || "Not selected", organization?.status || "Choose context"],
          ["Pageants", String(pageantCount), pageant ? `Managing ${pageant.name}` : "Create or select one"],
          ["Known members", String(memberCount), "Organization-scoped access"],
          ["Integrations", String(site?.integrations.length ?? 0), "Masked browser metadata only"],
        ].map(([label, value, copy]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold-soft/35">{label}</div>
              <div className="mt-2 truncate font-display text-2xl font-semibold text-white">{value}</div>
              <p className="mt-1 text-xs leading-5 text-gold-soft/45">{copy}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose the next task</CardTitle>
          <CardDescription>Each capability owns its own workspace instead of adding another form to one long page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.filter((module) => module.id !== "overview").map((module) => (
            <button
              key={module.id}
              type="button"
              onClick={() => onSelect(module.id)}
              className="rounded-2xl border border-line bg-black/25 p-4 text-left transition hover:border-gold/35 hover:bg-gold/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-white">{module.shortLabel}</div>
                <Badge tone={module.availability === "available" ? "success" : module.availability === "preview" ? "gold" : "neutral"}>
                  {module.availability === "available" ? "Available" : `M${module.milestone}`}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-gold-soft/45">{module.description}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {!pageant && <Notice tone="gold" title="Select a pageant">Pageant-scoped modules remain intentionally unavailable until a pageant context is selected.</Notice>}
    </div>
  );
}

function PageantsModule({
  organizationId,
  pageants,
  pageantId,
  setPageantId,
  pageantForm,
  setPageantForm,
  createPageant,
  seedReference,
  busy,
}: {
  organizationId: string;
  pageants: Pageant[];
  pageantId: string;
  setPageantId: (value: string) => void;
  pageantForm: { name: string; slug: string; description: string; venueName: string };
  setPageantForm: React.Dispatch<React.SetStateAction<{ name: string; slug: string; description: string; venueName: string }>>;
  createPageant: (event: FormEvent) => void;
  seedReference: () => void;
  busy: string;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Pageant list</CardTitle>
          <CardDescription>Choose which persistent pageant the other modules should manage.</CardDescription>
        </CardHeader>
        <CardContent>
          {pageants.length === 0 ? (
            <EmptyState title="No pageants yet" description="Create the first pageant draft for this organization." />
          ) : (
            <div className="space-y-2">
              {pageants.map((pageant) => (
                <button
                  key={pageant.id}
                  type="button"
                  onClick={() => setPageantId(pageant.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${pageantId === pageant.id ? "border-gold/50 bg-gold/10" : "border-line bg-black/25 hover:border-gold/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{pageant.name}</div>
                      <div className="mt-1 text-xs text-gold-soft/40">/{pageant.slug} · {pageant.venue_name || "Venue TBA"}</div>
                    </div>
                    <Badge tone={pageantId === pageant.id ? "gold" : "neutral"}>{pageant.status}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" className="mt-4 w-full" onClick={seedReference} disabled={!organizationId || busy === "seed"}>
            <Sprout size={16} /> {busy === "seed" ? "Reconciling reference data…" : "Seed Miss Stellarverse reference"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create a pageant draft</CardTitle>
          <CardDescription>Lifecycle editing, publication, and scheduling remain separate actions instead of being implied at creation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createPageant} className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="pageant-name"
              label="Pageant name"
              value={pageantForm.name}
              onChange={(event) => setPageantForm((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))}
              required
            />
            <TextField
              id="pageant-slug"
              label="Slug"
              value={pageantForm.slug}
              onChange={(event) => setPageantForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
              required
            />
            <TextField id="pageant-venue" label="Venue" value={pageantForm.venueName} onChange={(event) => setPageantForm((current) => ({ ...current, venueName: event.target.value }))} />
            <TextareaField id="pageant-description" label="Description" value={pageantForm.description} onChange={(event) => setPageantForm((current) => ({ ...current, description: event.target.value }))} className="min-h-24" />
            <Button type="submit" disabled={!organizationId || busy === "pageant"} className="w-full sm:col-span-2">
              <Plus size={16} /> {busy === "pageant" ? "Creating draft…" : "Create durable pageant draft"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Notice tone="gold" className="xl:col-span-2">
        <Database className="mr-1 inline" size={16} /> The deterministic reference seed never claims contract deployment, minting, payment, ownership, market settlement, or Explorer evidence.
      </Notice>
    </div>
  );
}

function ContestantsModule({
  pageant,
  form,
  setForm,
  onSubmit,
  busy,
}: {
  pageant: Pageant | null;
  form: { displayName: string; countryCode: string; sash: string; contestantNumber: string };
  setForm: React.Dispatch<React.SetStateAction<{ displayName: string; countryCode: string; sash: string; contestantNumber: string }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  if (!pageant) return <EmptyState title="Select a pageant first" description="Contestants are always created inside an explicit pageant context." />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a contestant</CardTitle>
        <CardDescription>Selected pageant: {pageant.name}. Portraits, galleries, ordering, visibility, and dynamic sections remain separate Milestone B tasks.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <TextField id="contestant-display-name" label="Display name" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} required className="sm:col-span-2" />
          <TextField id="contestant-country-code" label="Country code" value={form.countryCode} onChange={(event) => setForm((current) => ({ ...current, countryCode: event.target.value.toUpperCase().slice(0, 2) }))} required />
          <TextField id="contestant-sash" label="Sash" value={form.sash} onChange={(event) => setForm((current) => ({ ...current, sash: event.target.value.toUpperCase() }))} required />
          <TextField id="contestant-number" label="Contestant number" type="number" value={form.contestantNumber} onChange={(event) => setForm((current) => ({ ...current, contestantNumber: event.target.value }))} className="sm:col-span-2" />
          <Button type="submit" disabled={busy === "contestant"} className="w-full sm:col-span-2">
            {busy === "contestant" ? "Adding contestant…" : "Add contestant"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoriesModule({
  pageant,
  form,
  setForm,
  onSubmit,
  busy,
}: {
  pageant: Pageant | null;
  form: { name: string; slug: string };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; slug: string }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  if (!pageant) return <EmptyState title="Select a pageant first" description="Categories and outfit segments are pageant-scoped." />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a category</CardTitle>
        <CardDescription>Selected pageant: {pageant.name}. Assignment, ordering, and visibility controls will build on this record.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <TextField id="category-name" label="Category name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, slug: slugify(event.target.value) }))} required />
          <TextField id="category-slug" label="Slug" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: slugify(event.target.value) }))} required />
          <Button type="submit" disabled={busy === "category"} className="w-full sm:col-span-2">
            {busy === "category" ? "Saving category…" : "Save category"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PeopleModule({
  organization,
  members,
  form,
  setForm,
  onSubmit,
  busy,
}: {
  organization: Organization | null;
  members: Member[];
  form: { walletAddress: string; role: string };
  setForm: React.Dispatch<React.SetStateAction<{ walletAddress: string; role: string }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  if (!organization) return <EmptyState title="Select an organization first" description="Memberships are organization-scoped." />;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Grant organization access</CardTitle>
          <CardDescription>The target wallet must sign in once first. Organizer access maps to the organization editor role and never grants site administration.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
            <TextField id="member-wallet" label="Verified wallet address" value={form.walletAddress} onChange={(event) => setForm((current) => ({ ...current, walletAddress: event.target.value.toUpperCase() }))} required />
            <SelectField id="member-role" label="Role" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
              <option value="editor">Organizer</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Organization admin</option>
            </SelectField>
            <Button type="submit" disabled={busy === "member"} className="w-full self-end sm:w-auto">Grant access</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current members</CardTitle>
          <CardDescription>{organization.name} roles are evaluated server-side on every protected request.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState title="No members returned" description="Only authorized organization owners and administrators may read this list." />
          ) : (
            <div className="divide-y divide-line rounded-2xl border border-line">
              {members.map((member) => (
                <div key={member.user_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{member.display_name}</div>
                    <div className="mt-1 truncate font-mono text-xs text-gold-soft/40">{member.primary_wallet || "No primary wallet"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="gold">{member.role === "editor" ? "organizer" : member.role}</Badge>
                    <Badge tone={member.status === "active" ? "success" : "neutral"}>{member.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SiteModule({
  overview,
  site,
  form,
  setForm,
  onSubmit,
  busy,
}: {
  overview: Overview | null;
  site: SiteSettings;
  form: { siteName: string; defaultPageantId: string; selector: boolean };
  setForm: React.Dispatch<React.SetStateAction<{ siteName: string; defaultPageantId: string; selector: boolean }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Hosted pageant and public context</CardTitle>
          <CardDescription>Control the public selector without rebuilding the frontend. Mainnet remains disabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="site-name" label="Site name" value={form.siteName} onChange={(event) => setForm((current) => ({ ...current, siteName: event.target.value }))} required />
            <SelectField id="default-pageant" label="Default hosted pageant" value={form.defaultPageantId} onChange={(event) => setForm((current) => ({ ...current, defaultPageantId: event.target.value }))}>
              <option value="">No default pageant</option>
              {(overview?.pageants ?? []).filter((pageant) => ["published", "active"].includes(pageant.status)).map((pageant) => <option key={pageant.id} value={pageant.id}>{pageant.name}</option>)}
            </SelectField>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-sm text-gold-soft/65">
            <input type="checkbox" checked={form.selector} onChange={(event) => setForm((current) => ({ ...current, selector: event.target.checked }))} className="mt-1 accent-[#d4af37]" />
            <span><strong className="block text-white">Enable public pageant selector</strong>Visitors may choose among published pageants while deep links remain pageant-specific.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Notice tone="success" title="Stellar Testnet">Enabled for the current build.</Notice>
            <Notice tone="neutral" title="Stellar Mainnet" className="opacity-55">Unavailable until the deployment and persisted production-readiness gates are explicitly enabled.</Notice>
          </div>
          <Button type="submit" disabled={busy === "site"} className="w-full sm:w-auto">Save site settings</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integration status</CardTitle>
          <CardDescription>Only masked metadata reaches the browser; protected values are never echoed.</CardDescription>
        </CardHeader>
        <CardContent>
          {site.integrations.length === 0 ? (
            <EmptyState title="No optional integrations saved" description="R2 remains unavailable until the deployment configuration is complete and validated." />
          ) : (
            <div className="grid gap-3">
              {site.integrations.map((integration) => (
                <div key={integration.provider} className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-white">{integration.provider}</div>
                    <div className="mt-1 text-xs text-gold-soft/40">Ending in {integration.value_suffix || "••••"}</div>
                  </div>
                  <Badge tone={integration.validation_status === "valid" ? "success" : "neutral"}>{integration.validation_status.replaceAll("_", " ")}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

function ModuleBoundary({ moduleId, organization, pageant }: { moduleId: ManageModuleId; organization: Organization | null; pageant: Pageant | null }) {
  const module = manageModules.find((item) => item.id === moduleId)!;
  const isMedia = moduleId === "media";
  return (
    <Card>
      <CardContent className="py-10 text-center sm:py-14">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">
          {isMedia ? <Images size={25} /> : moduleId === "markets" ? <Globe2 size={25} /> : <Crown size={25} />}
        </span>
        <Badge tone={module.availability === "preview" ? "gold" : "neutral"} className="mt-5">Milestone {module.milestone}</Badge>
        <h3 className="mt-4 font-display text-3xl font-semibold text-white">{module.label}</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gold-soft/50">{module.description}</p>
        <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-line bg-black/25 p-4 text-left text-sm leading-6 text-gold-soft/50">
          <strong className="text-white">Current context</strong><br />
          Organization: {organization?.name || "not selected"}<br />
          Pageant: {pageant?.name || "not selected"}
        </div>
        {isMedia && (
          <Notice tone="gold" className="mx-auto mt-5 max-w-xl text-left">
            The R2 API foundation exists, but the automatic browser upload, Media Library, and asset picker are not represented as complete until the real Cloudflare flow passes.
          </Notice>
        )}
      </CardContent>
    </Card>
  );
}
