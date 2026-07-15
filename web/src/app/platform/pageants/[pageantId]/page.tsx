import Link from "next/link";
import { ArrowLeft, Award, CalendarDays, ChevronRight, Globe2, MapPin, Users } from "lucide-react";
import {
  findPlatformPageant,
  platformGet,
  type PlatformCategory,
  type PlatformContestant,
} from "@/lib/platform-api";

function formatDate(value?: string | null) {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function PlatformPageantPage({
  params,
}: {
  params: Promise<{ pageantId: string }>;
}) {
  const { pageantId } = await params;
  const found = await findPlatformPageant(pageantId);

  if (!found) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-gold/25 bg-black/25 px-6 py-14 text-center">
        <h1 className="font-display text-3xl font-semibold text-white">Pageant not found</h1>
        <p className="mt-3 text-sm leading-6 text-gold-soft/55">
          The platform API did not return this pageant. It may have been archived or the database may be unavailable.
        </p>
        <Link href="/platform" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-white">
          <ArrowLeft size={16} /> Back to platform pageants
        </Link>
      </div>
    );
  }

  const [categories, contestants] = await Promise.all([
    platformGet<PlatformCategory[]>(`/platform/pageants/${pageantId}/categories`, []),
    platformGet<PlatformContestant[]>(`/platform/pageants/${pageantId}/contestants`, []),
  ]);
  const { organization, pageant } = found;

  return (
    <div className="space-y-8">
      <Link href="/platform" className="inline-flex items-center gap-2 text-sm text-gold-soft/55 transition hover:text-gold">
        <ArrowLeft size={16} /> All platform pageants
      </Link>

      <section className="overflow-hidden rounded-[2rem] border border-gold/20 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.2),transparent_42%),rgba(8,8,10,0.86)] px-6 py-9 shadow-2xl sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft/50">
              <Globe2 size={14} /> {organization.name}
              <span aria-hidden="true">·</span>
              <span className="text-gold">{pageant.status}</span>
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold text-white sm:text-5xl">{pageant.name}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-gold-soft/60 sm:text-base">
              {pageant.description || "A CrownFi-powered pageant with persistent contestant and category data."}
            </p>
          </div>
          <div className="grid min-w-[220px] gap-3 rounded-2xl border border-line bg-black/30 p-4 text-sm text-gold-soft/65">
            <span className="flex items-start gap-2"><CalendarDays className="mt-0.5 shrink-0 text-gold" size={16} /> {formatDate(pageant.starts_at)}</span>
            <span className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0 text-gold" size={16} /> {pageant.venue_name || "Venue to be announced"}</span>
            <span className="flex items-start gap-2"><Users className="mt-0.5 shrink-0 text-gold" size={16} /> {contestants.length} contestants</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft/45">
              <Award size={14} /> Competition categories
            </div>
            <h2 className="mt-1 font-display text-2xl font-semibold text-white">How this pageant is organized</h2>
          </div>
          <span className="rounded-full border border-line bg-black/30 px-3 py-1 text-xs text-gold-soft/50">
            {categories.length} categories
          </span>
        </div>
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-sm text-gold-soft/45">
            No categories have been configured yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <span key={category.id} className="rounded-full border border-gold/20 bg-gold/[0.08] px-4 py-2 text-sm text-gold-soft">
                {category.name}
                <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-gold-soft/40">{category.status}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft/45">Official lineup</div>
            <h2 className="mt-1 font-display text-3xl font-semibold text-white">Meet the contestants</h2>
          </div>
          <p className="max-w-md text-right text-xs leading-5 text-gold-soft/40">
            Each profile can expose a different ordered set of biography, advocacy, gallery, support, and collectible sections.
          </p>
        </div>

        {contestants.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gold/20 bg-black/20 px-6 py-12 text-center text-sm text-gold-soft/45">
            No contestants have been added to this pageant yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contestants.map((contestant) => (
              <Link
                key={contestant.id}
                href={`/platform/pageants/${pageantId}/contestants/${contestant.id}`}
                className="group overflow-hidden rounded-3xl border border-line bg-black/30 transition hover:-translate-y-0.5 hover:border-gold/35"
              >
                <div className="grid aspect-[4/3] place-items-center bg-[radial-gradient(circle_at_50%_25%,rgba(212,175,55,0.28),transparent_50%),linear-gradient(145deg,#17130b,#09090b)]">
                  <span className="font-display text-6xl font-semibold text-gold/70">{initials(contestant.display_name)}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-soft/40">
                        {contestant.sash || contestant.country_representation || "Contestant"}
                      </div>
                      <h3 className="mt-1 font-display text-2xl font-semibold text-white group-hover:text-gold-soft">
                        {contestant.display_name}
                      </h3>
                    </div>
                    <ChevronRight className="mt-1 text-gold-soft/35 transition group-hover:translate-x-1 group-hover:text-gold" size={20} />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-gold-soft/45">
                    <span>{contestant.country_representation || contestant.country_code || "International"}</span>
                    {contestant.contestant_number && <span>#{contestant.contestant_number}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
