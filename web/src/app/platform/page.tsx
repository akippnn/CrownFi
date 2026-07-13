import Link from "next/link";
import { Building2, CalendarDays, ChevronRight, Database, MapPin, Sparkles } from "lucide-react";
import { getPlatformPageantGroups } from "@/lib/platform-api";

function formatDate(value?: string | null) {
  if (!value) return "Schedule to be announced";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default async function PlatformDirectoryPage() {
  const groups = await getPlatformPageantGroups();
  const pageantCount = groups.reduce((total, group) => total + group.pageants.length, 0);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_45%),rgba(8,8,10,0.82)] px-6 py-10 shadow-2xl sm:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">
            <Database size={14} /> Live platform data
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
            Discover every CrownFi pageant from one platform.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-gold-soft/65 sm:text-base">
            These organizations, pageants, contestants, and sections are loaded from the persistent Rust and PostgreSQL platform API—not from hardcoded page components.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-gold-soft/75">
            <span className="rounded-full border border-line bg-black/30 px-3 py-1.5">{groups.length} organizations</span>
            <span className="rounded-full border border-line bg-black/30 px-3 py-1.5">{pageantCount} pageants</span>
            <span className="rounded-full border border-line bg-black/30 px-3 py-1.5">PostgreSQL-backed</span>
          </div>
        </div>
      </section>

      {groups.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-gold/25 bg-black/25 px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-gold/20 bg-gold/10 text-gold">
            <Sparkles size={24} />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold text-white">No platform pageants yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gold-soft/55">
            Create an organization and pageant through the Rust platform API, or run the explicit local demo seed. Database migrations themselves intentionally create no demo content.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {groups.map(({ organization, pageants }) => (
            <section key={organization.id} className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft/45">
                    <Building2 size={14} /> Organization
                  </div>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-white">{organization.name}</h2>
                </div>
                <span className="rounded-full border border-line bg-black/30 px-3 py-1 text-xs text-gold-soft/55">
                  {pageants.length} {pageants.length === 1 ? "pageant" : "pageants"}
                </span>
              </div>

              {pageants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-sm text-gold-soft/45">
                  This organization has no published platform pageants yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {pageants.map((pageant) => (
                    <Link
                      key={pageant.id}
                      href={`/platform/pageants/${pageant.id}`}
                      className="group rounded-3xl border border-line bg-black/30 p-5 transition hover:-translate-y-0.5 hover:border-gold/35 hover:bg-gold/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="inline-flex rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-soft">
                            {pageant.status}
                          </span>
                          <h3 className="mt-3 font-display text-2xl font-semibold text-white transition group-hover:text-gold-soft">
                            {pageant.name}
                          </h3>
                        </div>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/20 text-gold transition group-hover:bg-gold group-hover:text-black">
                          <ChevronRight size={18} />
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-gold-soft/55">
                        {pageant.description || "A CrownFi-powered pageant experience."}
                      </p>
                      <div className="mt-5 grid gap-2 border-t border-line pt-4 text-xs text-gold-soft/45 sm:grid-cols-2">
                        <span className="flex items-center gap-2"><CalendarDays size={14} /> {formatDate(pageant.starts_at)}</span>
                        <span className="flex items-center gap-2"><MapPin size={14} /> {pageant.venue_name || "Venue TBA"}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
