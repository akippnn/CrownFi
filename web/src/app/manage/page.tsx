"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Crown,
  Database,
  ExternalLink,
  Globe2,
  Images,
  Plus,
  RefreshCw,
  Sprout,
  Users,
} from "lucide-react";
import { ManageNavigation } from "@/components/manage/ManageNavigation";
import { PageantHomeEditor } from "@/components/manage/PageantHomeEditor";
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
  starts_at?: string | null;
  ends_at?: string | null;
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
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function json(response: Response) {
  return response.json().catch(() => ({}));
}

export default function ManagePage() {
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
  const [contestants, setContestants] = useState<any[]>([]);

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
  const visibleModules = visibleManageModules({ isSiteAdmin: isAdmin, canManageMembers: Boolean(canManageMembers) });
  const requestedModule = searchParams.get("module");
  const activeModule: ManageModuleId =
    isManageModuleId(requestedModule) && visibleModules.some((module) => module.id === requestedModule)
      ? requestedModule
      : "overview";
  const activeDefinition = manageModules.find((module) => module.id === activeModule)!;

  async function load() {
    if (!account) return;
    setBusy("load");
    setNotice({ text: "" });
    try {
      const overviewResponse = await fetch("/api/manage/overview", { cache: "no-store" });
      const overviewData = await json(overviewResponse);
      if (!overviewResponse.ok) throw new Error(overviewData.error || "manage_overview_failed");
      setOverview(overviewData);
      const nextOrganization = organizationId || overviewData.organizations?.[0]?.id || "";
      const organizationChanged = nextOrganization !== organizationId;
      setOrganizationId(nextOrganization);
      const availablePageants = overviewData.pageants?.filter((item: Pageant) => item.organization_id === nextOrganization) || [];
      const currentStillValid = !organizationChanged && availablePageants.some((item: Pageant) => item.id === pageantId);
      setPageantId(currentStillValid ? pageantId : availablePageants[0]?.id || "");

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

  async function loadContestants(pId = pageantId) {
    if (!pId) {
      setContestants([]);
      return;
    }
    const response = await fetch(`/api/manage/contestants?pageantId=${encodeURIComponent(pId)}`, { cache: "no-store" });
    const data = await json(response);
    setContestants(response.ok && Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    if (account && isOrganizer) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, isOrganizer]);

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, canManageMembers]);

  useEffect(() => {
    loadContestants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageantId]);

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
    if (data) flash("Category saved for the selected pageant.");
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
    await loadContestants();
  }

  async function seedReference() {
    const data = await mutate("/api/manage/seed-miss-stellarverse", { organizationId }, "seed");
    if (!data) return;
    flash("Miss Stellarverse reference data reconciled.");
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
    flash("Organization access updated.");
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
    flash("Site settings saved.");
    await refreshSession();
  }

  if (!ready) return <Gate title="Loading control panel" description="Checking CrownFi roles and organization access…" />;
  if (setupRequired) return <Gate title="First administrator required" description="Complete guarded setup before opening the control panel." action={<ButtonLink href="/setup">Open setup</ButtonLink>} />;
  if (!account) return <Gate title="Sign in to CrownFi Control" description="Use a verified Freighter wallet to load organization-scoped tools." action={<Button onClick={connect} disabled={connecting}>{connecting ? "Waiting for Freighter…" : "Sign in with Freighter"}</Button>} />;
  if (!isOrganizer) return <Gate title="Organizer access required" description="A site or organization administrator must grant this account an organizer role." action={<ButtonLink href="/account" variant="secondary">Open account</ButtonLink>} />;

  const publicPageantHref = selectedPageant ? `/platform/pageants/${selectedPageant.id}` : "/platform";

  return (
    <div className="min-h-screen bg-[#070708]">
      <header className="sticky top-0 z-50 border-b border-line bg-[#08080a]/95 backdrop-blur-xl">
        <div className="flex flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <div className="flex items-center justify-between gap-4 lg:w-[260px] lg:shrink-0">
            <Link href="/" className="flex items-center gap-3">
              <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.webp" alt="" className="h-9 w-9" />
              <span><span className="block font-display text-lg font-semibold text-gold">CrownFi Control</span><span className="block text-[10px] uppercase tracking-[0.14em] text-gold-soft/35">Organizer workspace</span></span>
            </Link>
            <ButtonLink href={publicPageantHref} variant="ghost" size="sm" className="lg:hidden"><ArrowLeft size={15} /> Exit</ButtonLink>
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(190px,0.7fr)_minmax(240px,1fr)]">
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
            <SelectField id="manage-pageant" label="Active pageant" value={pageantId} onChange={(event) => setPageantId(event.target.value)}>
              <option value="">Organization-wide workspace</option>
              {pageants.map((pageant) => <option key={pageant.id} value={pageant.id}>{pageant.name} · {pageant.status}</option>)}
            </SelectField>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Badge tone="gold">{selectedOrganization?.role === "editor" ? "Organizer" : selectedOrganization?.role || "Member"}</Badge>
            {isAdmin && <Badge tone="success">Site admin</Badge>}
            <Button variant="secondary" size="sm" onClick={load} disabled={busy === "load"}><RefreshCw className={busy === "load" ? "animate-spin" : ""} size={15} /> Refresh</Button>
            <ButtonLink href={publicPageantHref} variant="secondary" size="sm" className="hidden lg:inline-flex"><ArrowLeft size={15} /> Exit control panel</ButtonLink>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
        <ManageNavigation activeModule={activeModule} isSiteAdmin={isAdmin} canManageMembers={Boolean(canManageMembers)} />

        <main className="min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
          <PageHeader
            eyebrow={`Milestone ${activeDefinition.milestone} workspace`}
            title={activeDefinition.label}
            description={activeDefinition.description}
            actions={selectedPageant && <ButtonLink href={`/platform/pageants/${selectedPageant.id}`} target="_blank" variant="ghost" size="sm">Open public page <ExternalLink size={14} /></ButtonLink>}
            meta={<><Badge tone="neutral">Stellar Testnet</Badge>{selectedPageant && <Badge tone="gold">{selectedPageant.name}</Badge>}{activeDefinition.availability !== "available" && <Badge tone="neutral">{activeDefinition.availability}</Badge>}</>}
          />

          {notice.text && <Notice tone={notice.error ? "danger" : "success"}>{notice.text}</Notice>}

          {activeModule === "overview" && <OverviewModule organization={selectedOrganization} pageant={selectedPageant} pageantCount={pageants.length} memberCount={members.length} site={site} modules={visibleModules} />}
          {activeModule === "home" && (selectedPageant ? <PageantHomeEditor pageant={selectedPageant} organizationName={selectedOrganization?.name || "CrownFi organizer"} /> : <EmptyState title="Select a pageant" description="The pageant home editor needs an active pageant context." />)}
          {activeModule === "pageants" && <PageantsModule organizationId={organizationId} pageants={pageants} pageantId={pageantId} setPageantId={setPageantId} pageantForm={pageantForm} setPageantForm={setPageantForm} createPageant={createPageant} seedReference={seedReference} busy={busy} mutate={mutate} load={load} flash={flash} />}
          {activeModule === "contestants" && (
            <ContestantsModule
              pageant={selectedPageant}
              contestants={contestants}
              loadContestants={loadContestants}
              form={contestantForm}
              setForm={setContestantForm}
              onSubmit={createContestant}
              busy={busy}
              mutate={mutate}
              organizationId={organizationId}
            />
          )}
          {activeModule === "categories" && <CategoriesModule pageant={selectedPageant} form={categoryForm} setForm={setCategoryForm} onSubmit={createCategory} busy={busy} />}
          {activeModule === "people" && canManageMembers && <PeopleModule organization={selectedOrganization} members={members} form={memberForm} setForm={setMemberForm} onSubmit={grantMember} busy={busy} />}
          {activeModule === "site" && isAdmin && site && <SiteModule overview={overview} site={site} form={siteForm} setForm={setSiteForm} onSubmit={saveSite} busy={busy} />}
          {["media", "voting", "tickets", "markets", "collectibles"].includes(activeModule) && <ModuleBoundary moduleId={activeModule} organization={selectedOrganization} pageant={selectedPageant} />}

          <div className="rounded-2xl border border-line bg-black/30 px-4 py-3 text-xs text-gold-soft/40">Signed in as {account.display_name} · {address}</div>
        </main>
      </div>
    </div>
  );
}

function Gate({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-5"><EmptyState className="w-full max-w-xl" title={title} description={description} action={action} /></div>;
}

function OverviewModule({ organization, pageant, pageantCount, memberCount, site, modules }: {
  organization: Organization | null;
  pageant: Pageant | null;
  pageantCount: number;
  memberCount: number;
  site: SiteSettings | null;
  modules: ReturnType<typeof visibleManageModules>;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Organization", organization?.name || "Not selected", organization?.status || "Choose context"],
          ["Pageants", String(pageantCount), pageant ? `Managing ${pageant.name}` : "Create or select one"],
          ["Known members", String(memberCount), "Organization-scoped access"],
          ["Integrations", String(site?.integrations.length ?? 0), "Protected deployment services"],
        ].map(([label, value, copy]) => <Card key={label}><CardContent className="pt-5"><div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold-soft/35">{label}</div><div className="mt-2 truncate font-display text-2xl font-semibold text-white">{value}</div><p className="mt-1 text-xs leading-5 text-gold-soft/45">{copy}</p></CardContent></Card>)}
      </div>
      <Card>
        <CardHeader><CardTitle>Choose the next task</CardTitle><CardDescription>Each capability owns a complete workspace instead of extending one long form.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.filter((module) => module.id !== "overview").map((module) => <Link key={module.id} href={`/manage?module=${module.id}`} className="rounded-2xl border border-line bg-black/25 p-4 transition hover:border-gold/35 hover:bg-gold/[0.06]"><div className="flex items-start justify-between gap-3"><div className="font-semibold text-white">{module.shortLabel}</div><Badge tone={module.availability === "available" ? "success" : module.availability === "preview" ? "gold" : "neutral"}>{module.availability === "available" ? "Available" : `M${module.milestone}`}</Badge></div><p className="mt-2 line-clamp-3 text-xs leading-5 text-gold-soft/45">{module.description}</p></Link>)}
        </CardContent>
      </Card>
      {!pageant && <Notice tone="gold" title="Select a pageant">Pageant-scoped modules remain unavailable until a pageant context is selected.</Notice>}
    </div>
  );
}

function EditPageantCard({
  pageant,
  mutate,
  load,
  busy,
  flash,
}: {
  pageant: Pageant;
  mutate: (path: string, body: unknown, key: string) => Promise<any>;
  load: () => Promise<void>;
  busy: string;
  flash: (text: string, error?: boolean) => void;
}) {
  const [form, setForm] = useState({
    name: pageant.name || "",
    slug: pageant.slug || "",
    description: pageant.description || "",
    venueName: pageant.venue_name || "",
    status: pageant.status || "",
  });

  useEffect(() => {
    setForm({
      name: pageant.name || "",
      slug: pageant.slug || "",
      description: pageant.description || "",
      venueName: pageant.venue_name || "",
      status: pageant.status || "",
    });
  }, [pageant]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const data = await mutate(
      "/api/manage/pageants",
      {
        pageant_id: pageant.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        venue_name: form.venueName,
        status: form.status,
      },
      `pageant-edit-${pageant.id}`,
    );
    if (data) {
      flash("Pageant details updated successfully.");
      await load();
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to archive/delete ${pageant.name}?`)) return;
    try {
      const response = await fetch(`/api/manage/pageants/${pageant.id}`, { method: "DELETE" });
      if (response.ok) {
        flash("Pageant deleted/archived successfully.");
        await load();
      } else {
        flash("Failed to delete pageant.", true);
      }
    } catch (err) {
      flash("Error deleting pageant.", true);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modify Pageant</CardTitle>
        <CardDescription>Update identity, settings, or archive this pageant.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSave}>
          <TextField
            id="edit-pageant-name"
            label="Pageant name"
            value={form.name}
            onChange={(e) => setForm((curr) => ({ ...curr, name: e.target.value, slug: curr.slug || slugify(e.target.value) }))}
            required
          />
          <TextField
            id="edit-pageant-slug"
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm((curr) => ({ ...curr, slug: slugify(e.target.value) }))}
            required
          />
          <TextField
            id="edit-pageant-venue"
            label="Venue"
            value={form.venueName}
            onChange={(e) => setForm((curr) => ({ ...curr, venueName: e.target.value }))}
          />
          <SelectField
            id="edit-pageant-status"
            label="Status"
            value={form.status}
            onChange={(e) => setForm((curr) => ({ ...curr, status: e.target.value }))}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </SelectField>
          <TextareaField
            id="edit-pageant-description"
            label="Description"
            value={form.description}
            onChange={(e) => setForm((curr) => ({ ...curr, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={busy === `pageant-edit-${pageant.id}`}>
              Save Changes
            </Button>
            <Button type="button" variant="secondary" className="hover:border-red-500/40 hover:text-red-400" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
  mutate,
  load,
  flash,
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
  mutate: (path: string, body: unknown, key: string) => Promise<any>;
  load: () => Promise<void>;
  flash: (text: string, error?: boolean) => void;
}) {
  const selectedPageant = pageants.find((p) => p.id === pageantId);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Pageant portfolio</CardTitle>
          <CardDescription>Selecting a pageant changes the editor context and public-navigation preview.</CardDescription>
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
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    pageantId === pageant.id ? "border-gold/50 bg-gold/10" : "border-line bg-black/25 hover:border-gold/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{pageant.name}</div>
                      <div className="mt-1 text-xs text-gold-soft/40">
                        /{pageant.slug} · {pageant.venue_name || "Venue TBA"}
                      </div>
                    </div>
                    <Badge tone={pageantId === pageant.id ? "gold" : "neutral"}>{pageant.status}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" className="mt-4 w-full" onClick={seedReference} disabled={!organizationId || busy === "seed"}>
            <Sprout size={16} /> {busy === "seed" ? "Reconciling…" : "Seed Miss Stellarverse reference"}
          </Button>
        </CardContent>
      </Card>
      
      {selectedPageant ? (
        <EditPageantCard pageant={selectedPageant} mutate={mutate} load={load} busy={busy} flash={flash} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create a pageant draft</CardTitle>
            <CardDescription>Start with identity and venue. Publishing, schedules, and lifecycle controls remain explicit later steps.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createPageant}>
              <TextField
                id="pageant-name"
                label="Pageant name"
                value={pageantForm.name}
                onChange={(event) =>
                  setPageantForm((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))
                }
                required
              />
              <TextField
                id="pageant-slug"
                label="Slug"
                value={pageantForm.slug}
                onChange={(event) => setPageantForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                required
              />
              <TextField
                id="pageant-venue"
                label="Venue"
                value={pageantForm.venueName}
                onChange={(event) => setPageantForm((current) => ({ ...current, venueName: event.target.value }))}
              />
              <TextareaField
                id="pageant-description"
                label="Description"
                value={pageantForm.description}
                onChange={(event) => setPageantForm((current) => ({ ...current, description: event.target.value }))}
              />
              <Button type="submit" disabled={!organizationId || busy === "pageant"}>
                <Plus size={16} /> {busy === "pageant" ? "Creating…" : "Create pageant"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContestantItem({
  contestant,
  loadContestants,
  mutate,
  organizationId,
}: {
  contestant: any;
  loadContestants: () => Promise<void>;
  mutate: (path: string, body: unknown, key: string) => Promise<any>;
  organizationId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: contestant.display_name || "",
    biography: contestant.biography || "",
    countryCode: contestant.country_code || "",
    sash: contestant.sash || "",
    contestantNumber: contestant.contestant_number?.toString() || "",
  });
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    const data = await mutate(
      "/api/manage/contestants",
      {
        pageant_contestant_id: contestant.id,
        display_name: editForm.displayName,
        biography: editForm.biography,
        country_code: editForm.countryCode,
        sash: editForm.sash,
        contestant_number: editForm.contestantNumber ? Number(editForm.contestantNumber) : null,
        country_representation: editForm.countryCode,
      },
      `contestant-edit-${contestant.id}`,
    );
    if (data) {
      setIsEditing(false);
      await loadContestants();
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to remove ${contestant.display_name}?`)) return;
    try {
      const response = await fetch(`/api/manage/contestants/${contestant.id}`, { method: "DELETE" });
      if (response.ok) {
        await loadContestants();
      } else {
        alert("Failed to delete contestant.");
      }
    } catch (err) {
      alert("Error deleting contestant.");
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const presignResponse = await fetch("/api/manage/contestants/upload-portrait", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "presign",
          organizationId,
          originalFilename: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256,
        }),
      });
      const presignData = await presignResponse.json();
      if (!presignResponse.ok) throw new Error(presignData.error || "failed_to_get_upload_url");

      const { id: mediaAssetId, upload } = presignData;

      const headers = new Headers();
      headers.set("content-type", file.type);
      headers.set("x-amz-meta-sha256", sha256);
      if (upload.headers) {
        for (const [key, value] of Object.entries(upload.headers)) {
          headers.set(key, value as string);
        }
      }
      const uploadResponse = await fetch(upload.url, {
        method: "PUT",
        body: file,
        headers,
      });
      if (!uploadResponse.ok) throw new Error("failed_to_upload_to_storage");

      const completeResponse = await fetch("/api/manage/contestants/upload-portrait", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "complete",
          mediaAssetId,
          pageantContestantId: contestant.id,
        }),
      });
      const completeData = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completeData.error || "failed_to_complete_upload");

      alert("Portrait uploaded successfully!");
      await loadContestants();
    } catch (error) {
      alert(`Upload failed: ${String((error as Error).message || error)}`);
    } finally {
      setUploading(false);
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-gold/30 bg-black/45 p-4 space-y-3">
        <TextField id={`edit-name-${contestant.id}`} label="Display name" value={editForm.displayName} onChange={(e) => setEditForm(curr => ({ ...curr, displayName: e.target.value }))} required />
        <TextField id={`edit-number-${contestant.id}`} label="Contestant number" type="number" min="1" value={editForm.contestantNumber} onChange={(e) => setEditForm(curr => ({ ...curr, contestantNumber: e.target.value }))} />
        <TextField id={`edit-country-${contestant.id}`} label="Country code" value={editForm.countryCode} onChange={(e) => setEditForm(curr => ({ ...curr, countryCode: e.target.value.toUpperCase().slice(0, 2) }))} required />
        <TextField id={`edit-sash-${contestant.id}`} label="Sash" value={editForm.sash} onChange={(e) => setEditForm(curr => ({ ...curr, sash: e.target.value.toUpperCase() }))} required />
        <TextareaField id={`edit-bio-${contestant.id}`} label="Biography" value={editForm.biography} onChange={(e) => setEditForm(curr => ({ ...curr, biography: e.target.value }))} />
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} size="sm">Save</Button>
          <Button onClick={() => setIsEditing(false)} variant="secondary" size="sm">Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-black/25 p-4 transition hover:border-gold/20">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-line bg-black/40 flex items-center justify-center text-gold font-bold">
          {contestant.portrait_url ? (
            <img src={contestant.portrait_url} alt="" className="h-full w-full object-cover" />
          ) : (
            contestant.display_name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <div className="font-semibold text-white">{contestant.display_name}</div>
          <div className="text-xs text-gold-soft/40">
            #{contestant.contestant_number || "?"} · {contestant.sash} · {contestant.country_representation}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="cursor-pointer inline-flex items-center justify-center rounded-xl border border-line bg-black/35 px-3 py-1.5 text-xs text-gold-soft/75 transition hover:border-gold/30 hover:text-white">
          {uploading ? "Uploading…" : "Upload Portrait"}
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
        <Button onClick={() => setIsEditing(true)} variant="secondary" size="sm">Edit</Button>
        <Button onClick={handleDelete} variant="secondary" size="sm" className="hover:border-red-500/40 hover:text-red-400">Delete</Button>
      </div>
    </div>
  );
}

function ContestantsModule({
  pageant,
  contestants,
  loadContestants,
  form,
  setForm,
  onSubmit,
  busy,
  mutate,
  organizationId,
}: {
  pageant: Pageant | null;
  contestants: any[];
  loadContestants: () => Promise<void>;
  form: { displayName: string; countryCode: string; sash: string; contestantNumber: string };
  setForm: React.Dispatch<React.SetStateAction<{ displayName: string; countryCode: string; sash: string; contestantNumber: string }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
  mutate: (path: string, body: unknown, key: string) => Promise<any>;
  organizationId: string;
}) {
  if (!pageant) return <EmptyState title="Select a pageant" description="Contestants are always scoped to one pageant." />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Official Lineup</CardTitle>
          <CardDescription>
            Contestants currently competing in {pageant.name}. Expose profiles, edit metadata, and upload portrait assets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contestants.length === 0 ? (
            <EmptyState title="No contestants yet" description="Add the first contestant for this pageant." />
          ) : (
            <div className="space-y-3">
              {contestants.map((c) => (
                <ContestantItem
                  key={c.id}
                  contestant={c}
                  loadContestants={loadContestants}
                  mutate={mutate}
                  organizationId={organizationId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a contestant</CardTitle>
          <CardDescription>
            The contestant becomes available to the public widget renderer after publication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <TextField
              id="contestant-name"
              label="Display name"
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              required
            />
            <TextField
              id="contestant-number"
              label="Contestant number"
              type="number"
              min="1"
              value={form.contestantNumber}
              onChange={(event) => setForm((current) => ({ ...current, contestantNumber: event.target.value }))}
            />
            <TextField
              id="contestant-country"
              label="Country code"
              value={form.countryCode}
              onChange={(event) => setForm((current) => ({ ...current, countryCode: event.target.value.toUpperCase().slice(0, 2) }))}
              required
            />
            <TextField
              id="contestant-sash"
              label="Sash"
              value={form.sash}
              onChange={(event) => setForm((current) => ({ ...current, sash: event.target.value.toUpperCase() }))}
              required
            />
            <Button type="submit" className="w-full" disabled={busy === "contestant"}>
              <Users size={16} /> {busy === "contestant" ? "Adding…" : "Add to lineup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoriesModule({ pageant, form, setForm, onSubmit, busy }: {
  pageant: Pageant | null;
  form: { name: string; slug: string };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; slug: string }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  if (!pageant) return <EmptyState title="Select a pageant" description="Categories are always scoped to one pageant." />;
  return <Card><CardHeader><CardTitle>Create a category</CardTitle><CardDescription>Categories feed the public home widget and later voting configuration.</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}><TextField id="category-name" label="Category name" value={form.name} onChange={(event) => setForm({ name: event.target.value, slug: slugify(event.target.value) })} required /><TextField id="category-slug" label="Slug" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: slugify(event.target.value) }))} required /><div className="sm:col-span-2"><Button type="submit" disabled={busy === "category"}><Plus size={16} /> {busy === "category" ? "Saving…" : "Save category"}</Button></div></form></CardContent></Card>;
}

function PeopleModule({ organization, members, form, setForm, onSubmit, busy }: {
  organization: Organization | null;
  members: Member[];
  form: { walletAddress: string; role: string };
  setForm: React.Dispatch<React.SetStateAction<{ walletAddress: string; role: string }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]"><Card><CardHeader><CardTitle>{organization?.name || "Organization"} members</CardTitle><CardDescription>Roles remain organization-scoped unless the account is a site administrator.</CardDescription></CardHeader><CardContent>{members.length === 0 ? <EmptyState title="No members returned" description="Members appear after their wallet has signed in and access is granted." /> : <div className="space-y-2">{members.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-black/25 p-4"><div><div className="font-semibold text-white">{member.display_name}</div><div className="mt-1 text-xs text-gold-soft/40">{member.primary_wallet || member.email || member.user_id}</div></div><Badge tone={member.status === "active" ? "success" : "neutral"}>{member.role}</Badge></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle>Grant access</CardTitle><CardDescription>The wallet must have signed in at least once.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={onSubmit}><TextField id="member-wallet" label="Stellar wallet address" value={form.walletAddress} onChange={(event) => setForm((current) => ({ ...current, walletAddress: event.target.value }))} required /><SelectField id="member-role" label="Organization role" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}><option value="editor">Organizer/editor</option><option value="viewer">Viewer/auditor</option><option value="admin">Organization admin</option></SelectField><Button type="submit" disabled={busy === "member"}><Users size={16} /> {busy === "member" ? "Updating…" : "Grant access"}</Button></form></CardContent></Card></div>;
}

function SiteModule({ overview, site, form, setForm, onSubmit, busy }: {
  overview: Overview | null;
  site: SiteSettings;
  form: { siteName: string; defaultPageantId: string; selector: boolean };
  setForm: React.Dispatch<React.SetStateAction<{ siteName: string; defaultPageantId: string; selector: boolean }>>;
  onSubmit: (event: FormEvent) => void;
  busy: string;
}) {
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"><Card><CardHeader><CardTitle>Hosted site context</CardTitle><CardDescription>The public shell uses these settings only after the selected pageant exists and is available.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={onSubmit}><TextField id="site-name" label="Site name" value={form.siteName} onChange={(event) => setForm((current) => ({ ...current, siteName: event.target.value }))} required /><SelectField id="default-pageant" label="Default pageant" value={form.defaultPageantId} onChange={(event) => setForm((current) => ({ ...current, defaultPageantId: event.target.value }))}><option value="">No default pageant</option>{(overview?.pageants ?? []).map((pageant) => <option key={pageant.id} value={pageant.id}>{pageant.name}</option>)}</SelectField><label className="flex items-start gap-3 rounded-2xl border border-line bg-black/25 p-4"><input type="checkbox" checked={form.selector} onChange={(event) => setForm((current) => ({ ...current, selector: event.target.checked }))} className="mt-1 h-4 w-4 accent-[#d4af37]" /><span><span className="block text-sm font-semibold text-white">Allow public pageant switching</span><span className="mt-1 block text-xs leading-5 text-gold-soft/40">The unified navbar exposes the hierarchical pageant chooser when multiple pageants exist.</span></span></label><Button type="submit" disabled={busy === "site"}>{busy === "site" ? "Saving…" : "Save site settings"}</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Deployment readiness</CardTitle><CardDescription>Secrets remain server-side. The browser only sees masked provider status.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-2xl border border-line bg-black/25 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-white">Stellar network</span><Badge tone="gold">Testnet</Badge></div><p className="mt-2 text-xs text-gold-soft/40">Mainnet is disabled by deployment and persisted readiness gates.</p></div>{site.integrations.length === 0 ? <EmptyState title="No integrations reported" description="Configure R2 and other runtime providers through protected deployment settings." /> : site.integrations.map((integration) => <div key={integration.provider} className="rounded-2xl border border-line bg-black/25 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-white">{integration.provider}</span><Badge tone={integration.validation_status === "valid" ? "success" : "gold"}>{integration.validation_status}</Badge></div>{integration.value_suffix && <p className="mt-2 font-mono text-xs text-gold-soft/40">…{integration.value_suffix}</p>}</div>)}</CardContent></Card></div>;
}

function ModuleBoundary({ moduleId, organization, pageant }: { moduleId: string; organization: Organization | null; pageant: Pageant | null }) {
  const definition = manageModules.find((module) => module.id === moduleId)!;
  const icon = moduleId === "media" ? <Images size={25} /> : moduleId === "markets" ? <Globe2 size={25} /> : <Database size={25} />;
  return <Card className="border-gold/20"><CardContent className="py-10 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">{icon}</span><Badge tone={definition.availability === "preview" ? "gold" : "neutral"} className="mt-5">Milestone {definition.milestone} · {definition.availability}</Badge><h3 className="mt-4 font-display text-3xl font-semibold text-white">{definition.label}</h3><p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-gold-soft/50">{definition.description}</p><div className="mx-auto mt-6 grid max-w-xl gap-3 text-left sm:grid-cols-2"><div className="rounded-2xl border border-line bg-black/25 p-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Organization</div><div className="mt-2 text-sm font-semibold text-white">{organization?.name || "Not selected"}</div></div><div className="rounded-2xl border border-line bg-black/25 p-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Pageant</div><div className="mt-2 text-sm font-semibold text-white">{pageant?.name || "Not selected"}</div></div></div><Notice className="mx-auto mt-6 max-w-2xl text-left" tone="gold" title="Truthful boundary">This control panel reserves the complete workspace without presenting unfinished fixture actions as production-ready controls.</Notice></CardContent></Card>;
}
