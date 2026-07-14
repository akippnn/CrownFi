import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, DatabaseZap, Layers3, PlusCircle, UserRoundPlus } from "lucide-react";
import {
  getPlatformPageantGroups,
  platformGet,
  type PlatformContestant,
  type PlatformPageant,
} from "@/lib/platform-api";
import { organizerReviewConfig } from "@/lib/platform-admin";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-line bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-gold-soft/25 focus:border-gold/45";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#f3e5ab] via-gold to-[#b8912f] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

function Field({
  label,
  name,
  required,
  placeholder,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  defaultValue?: string | number;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
      {label}
      <input
        className={inputClass}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  required,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
      {label}
      <select className={inputClass} name={name} required={required} defaultValue="">
        <option value="" disabled>
          {options.length > 0 ? "Select one" : "No records available"}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-black/25 p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold/20 bg-gold/10 text-gold">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-gold-soft/45">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

const statusLabels: Record<string, string> = {
  organization_created: "Organization and owner membership created.",
  pageant_created: "Pageant created and persisted.",
  category_created: "Category created and persisted.",
  contestant_created: "Contestant participation created and persisted.",
  section_created: "Contestant section created and persisted.",
};

export default async function OrganizerReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const status = typeof query.status === "string" ? query.status : null;
  const error = typeof query.error === "string" ? query.error : null;
  const createdActorId = typeof query.actor_user_id === "string" ? query.actor_user_id : null;
  const createdOrganizationId = typeof query.organization_id === "string" ? query.organization_id : null;
  const config = organizerReviewConfig();
  const groups = config.enabled ? await getPlatformPageantGroups() : [];
  const pageants = groups.flatMap((group) =>
    group.pageants.map((pageant) => ({ organization: group.organization, pageant })),
  );
  const contestantGroups = config.enabled
    ? await Promise.all(
        pageants.map(async ({ pageant }) => ({
          pageant,
          contestants: await platformGet<PlatformContestant[]>(
            `/platform/pageants/${pageant.id}/contestants`,
            [],
          ),
        })),
      )
    : [];
  const contestants = contestantGroups.flatMap(({ pageant, contestants: items }) =>
    items.map((contestant) => ({ pageant, contestant })),
  );

  const organizationOptions = groups.map(({ organization }) => ({
    value: organization.id,
    label: organization.name,
  }));
  const pageantOptions = pageants.map(({ organization, pageant }) => ({
    value: pageant.id,
    label: `${organization.name} — ${pageant.name}`,
  }));
  const contestantOptions = contestants.map(({ pageant, contestant }) => ({
    value: contestant.id,
    label: `${pageant.name} — ${contestant.display_name}`,
  }));

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_45%),rgba(8,8,10,0.82)] px-6 py-10 shadow-2xl sm:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">
            <DatabaseZap size={14} /> Milestone B review console
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
            Create persistent pageant data without editing source code.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-gold-soft/60 sm:text-base">
            These forms call the Rust platform API from the Next.js server. The transitional administrator token stays server-side, while PostgreSQL membership checks still determine whether the configured actor may write to an organization.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-gold-soft/55">
            <span className="rounded-full border border-line bg-black/30 px-3 py-1.5">Review mode: {config.enabled ? "enabled" : "disabled"}</span>
            <span className="rounded-full border border-line bg-black/30 px-3 py-1.5">Actor: {config.actorUserId ?? "not configured"}</span>
          </div>
        </div>
      </section>

      {!config.enabled ? (
        <section className="rounded-3xl border border-dashed border-gold/25 bg-black/25 px-6 py-12 text-center">
          <AlertTriangle className="mx-auto text-gold" size={30} />
          <h2 className="mt-4 font-display text-2xl font-semibold text-white">Organizer review writes are disabled</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gold-soft/50">
            Set <code>CROWNFI_ORGANIZER_REVIEW_ENABLED=true</code> and a valid <code>CROWNFI_ORGANIZER_ACTOR_USER_ID</code> only in a controlled local or Testnet review environment. This console is not the final authentication boundary and must remain disabled in staging and production.
          </p>
        </section>
      ) : (
        <>
          {status && statusLabels[status] && (
            <div className="rounded-2xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">
              {statusLabels[status]}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">
              Request failed: <code>{error}</code>
            </div>
          )}
          {createdActorId && (
            <div className="rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-4 text-sm leading-6 text-gold-soft/65">
              Bootstrap created actor <code>{createdActorId}</code>
              {createdOrganizationId ? <> and organization <code>{createdOrganizationId}</code></> : null}. Set the actor ID as <code>CROWNFI_ORGANIZER_ACTOR_USER_ID</code> and restart the web service before using the organization-scoped forms as that owner.
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <FormCard
              title="Bootstrap an organization"
              description="Creates one user, organization, and owner membership atomically. This remains an administrator-assisted review flow."
              icon={Building2}
            >
              <form action="/api/organizer/review" method="post" className="space-y-4">
                <input type="hidden" name="intent" value="bootstrap" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Owner display name" name="display_name" required placeholder="CrownFi Organizer" />
                  <Field label="Owner email" name="email" type="email" placeholder="organizer@example.com" />
                </div>
                <Field label="Organization name" name="organization_name" required placeholder="CrownFi Events" />
                <Field label="Organization slug" name="organization_slug" required placeholder="crownfi-events" />
                <button className={buttonClass} type="submit"><PlusCircle size={16} /> Create organization</button>
              </form>
            </FormCard>

            <FormCard
              title="Create a pageant"
              description="Writes a pageant under an organization where the configured actor has an active owner, admin, or editor membership."
              icon={Layers3}
            >
              <form action="/api/organizer/review" method="post" className="space-y-4">
                <input type="hidden" name="intent" value="pageant" />
                <SelectField label="Organization" name="organization_id" required options={organizationOptions} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Pageant name" name="name" required placeholder="CrownFi International 2027" />
                  <Field label="Pageant slug" name="slug" required placeholder="crownfi-international-2027" />
                </div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
                  Description
                  <textarea className={`${inputClass} min-h-24`} name="description" placeholder="Public pageant description" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Timezone" name="timezone" defaultValue="Asia/Manila" />
                  <Field label="Venue" name="venue_name" placeholder="CrownFi Grand Stage" />
                </div>
                <button className={buttonClass} type="submit" disabled={organizationOptions.length === 0}><PlusCircle size={16} /> Create pageant</button>
              </form>
            </FormCard>

            <FormCard
              title="Create a category"
              description="Adds an ordered category to an existing persistent pageant."
              icon={Layers3}
            >
              <form action="/api/organizer/review" method="post" className="space-y-4">
                <input type="hidden" name="intent" value="category" />
                <SelectField label="Pageant" name="pageant_id" required options={pageantOptions} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Category name" name="name" required placeholder="Fan Choice" />
                  <Field label="Category slug" name="slug" required placeholder="fan-choice" />
                </div>
                <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
                  Description
                  <textarea className={`${inputClass} min-h-20`} name="description" />
                </label>
                <button className={buttonClass} type="submit" disabled={pageantOptions.length === 0}><PlusCircle size={16} /> Create category</button>
              </form>
            </FormCard>

            <FormCard
              title="Add a contestant"
              description="Creates a canonical contestant and a pageant-specific participation record in one transaction."
              icon={UserRoundPlus}
            >
              <form action="/api/organizer/review" method="post" className="space-y-4">
                <input type="hidden" name="intent" value="contestant" />
                <SelectField label="Pageant" name="pageant_id" required options={pageantOptions} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Display name" name="display_name" required placeholder="Ariella Santos" />
                  <Field label="Legal name" name="legal_name" placeholder="Optional" />
                </div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
                  Biography
                  <textarea className={`${inputClass} min-h-24`} name="biography" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Country code" name="country_code" placeholder="PH" />
                  <Field label="Representation" name="country_representation" placeholder="Philippines" />
                  <Field label="Sash" name="sash" placeholder="PHILIPPINES" />
                  <Field label="Contestant number" name="contestant_number" type="number" />
                  <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
                </div>
                <button className={buttonClass} type="submit" disabled={pageantOptions.length === 0}><UserRoundPlus size={16} /> Add contestant</button>
              </form>
            </FormCard>

            <FormCard
              title="Add a contestant section"
              description="Sets section kind, visibility, content, and ordering without changing the contestant page component."
              icon={Layers3}
            >
              <form action="/api/organizer/review" method="post" className="space-y-4">
                <input type="hidden" name="intent" value="section" />
                <SelectField label="Contestant" name="pageant_contestant_id" required options={contestantOptions} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
                    Section kind
                    <select className={inputClass} name="kind" required defaultValue="overview">
                      {[
                        "overview", "biography", "advocacy", "gallery", "achievements", "collectibles", "support", "sponsors", "social-links", "custom",
                      ].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                  </label>
                  <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
                  <Field label="Title" name="title" required placeholder="Advocacy" />
                  <Field label="Slug" name="slug" required placeholder="advocacy" />
                </div>
                <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-soft/55">
                  Section body
                  <textarea className={`${inputClass} min-h-24`} name="body" />
                </label>
                <label className="flex items-center gap-2 text-sm text-gold-soft/65">
                  <input name="is_visible" type="checkbox" defaultChecked className="h-4 w-4 accent-[#d4af37]" />
                  Visible on the contestant profile
                </label>
                <button className={buttonClass} type="submit" disabled={contestantOptions.length === 0}><PlusCircle size={16} /> Add section</button>
              </form>
            </FormCard>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Link href="/platform" className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-white">
          Review persistent public pages <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
