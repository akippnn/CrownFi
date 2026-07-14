import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BookOpenText,
  ExternalLink,
  Gift,
  HeartHandshake,
  Images,
  Medal,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import {
  findPlatformPageant,
  platformGet,
  type PlatformContestant,
  type PlatformContestantMedia,
  type PlatformContestantSection,
} from "@/lib/platform-api";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function sectionIcon(kind: string) {
  switch (kind) {
    case "biography": return BookOpenText;
    case "advocacy": return HeartHandshake;
    case "gallery": return Images;
    case "achievements": return Medal;
    case "collectibles": return Gift;
    case "support": return Star;
    case "sponsors": return Users;
    default: return Sparkles;
  }
}

function settingText(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function SectionBody({
  section,
  gallery,
}: {
  section: PlatformContestantSection;
  gallery: PlatformContestantMedia[];
}) {
  const body = settingText(section.settings_json, "body") ?? settingText(section.settings_json, "description");
  const link = settingText(section.settings_json, "url");
  const label = settingText(section.settings_json, "label") ?? "Learn more";

  if (section.kind === "gallery") {
    return gallery.length > 0 ? (
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {gallery.map((item) => (
          <figure key={item.attachment_id} className="overflow-hidden rounded-2xl border border-line bg-black/30">
            {item.asset.delivery_url ? (
              <img
                src={item.asset.delivery_url}
                alt={item.asset.alt_text || item.caption || "Contestant gallery image"}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[4/3] place-items-center text-gold-soft/35"><Images size={32} /></div>
            )}
            {(item.caption || item.asset.alt_text) && (
              <figcaption className="px-4 py-3 text-xs leading-5 text-gold-soft/50">
                {item.caption || item.asset.alt_text}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    ) : (
      <p className="mt-3 text-sm leading-6 text-gold-soft/45">Gallery images have not been published yet.</p>
    );
  }

  if (section.kind === "collectibles") {
    return (
      <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/[0.06] p-4 text-sm leading-6 text-gold-soft/60">
        Contestant collectibles will appear here when the Stellar eCommerce catalogue is enabled. Collectibles never increase voting power.
      </div>
    );
  }

  if (section.kind === "support") {
    return (
      <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/[0.06] p-4 text-sm leading-6 text-gold-soft/60">
        {body || "Verified contestant-support options will appear here after payout policy and commerce reconciliation are enabled."}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <p className="whitespace-pre-wrap text-sm leading-7 text-gold-soft/60">
        {body || "This section is enabled for the contestant, but its content has not been published yet."}
      </p>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-white">
          {label} <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

export default async function PlatformContestantPage({
  params,
}: {
  params: Promise<{ pageantId: string; pageantContestantId: string }>;
}) {
  const { pageantId, pageantContestantId } = await params;
  const [found, contestants, sections, media] = await Promise.all([
    findPlatformPageant(pageantId),
    platformGet<PlatformContestant[]>(`/platform/pageants/${pageantId}/contestants`, []),
    platformGet<PlatformContestantSection[]>(
      `/platform/pageant-contestants/${pageantContestantId}/sections`,
      [],
    ),
    platformGet<PlatformContestantMedia[]>(
      `/platform/pageant-contestants/${pageantContestantId}/media`,
      [],
    ),
  ]);
  const contestant = contestants.find((item) => item.id === pageantContestantId);

  if (!found || !contestant) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-gold/25 bg-black/25 px-6 py-14 text-center">
        <h1 className="font-display text-3xl font-semibold text-white">Contestant not found</h1>
        <p className="mt-3 text-sm leading-6 text-gold-soft/55">
          This contestant is not part of the selected pageant or is no longer publicly available.
        </p>
        <Link href={`/platform/pageants/${pageantId}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-white">
          <ArrowLeft size={16} /> Back to pageant
        </Link>
      </div>
    );
  }

  const visibleSections = sections
    .filter((section) => section.is_visible)
    .sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title));
  const portrait = media.find((item) => item.role === "portrait" && item.asset.delivery_url);
  const gallery = media.filter((item) => item.role === "gallery" || item.role === "section");

  return (
    <div className="space-y-8">
      <Link
        href={`/platform/pageants/${pageantId}`}
        className="inline-flex items-center gap-2 text-sm text-gold-soft/55 transition hover:text-gold"
      >
        <ArrowLeft size={16} /> {found.pageant.name}
      </Link>

      <section className="overflow-hidden rounded-[2rem] border border-gold/20 bg-black/35 shadow-2xl">
        <div className="grid md:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <div className="relative min-h-[340px] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(212,175,55,0.28),transparent_48%),linear-gradient(145deg,#17130b,#09090b)]">
            {portrait?.asset.delivery_url ? (
              <img
                src={portrait.asset.delivery_url}
                alt={portrait.asset.alt_text || portrait.caption || contestant.display_name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <span className="font-display text-8xl font-semibold text-gold/65">{initials(contestant.display_name)}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 to-transparent" />
            <div className="absolute bottom-5 left-5 rounded-full border border-gold/25 bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-soft backdrop-blur">
              {contestant.sash || contestant.country_representation || "Contestant"}
            </div>
          </div>

          <div className="flex flex-col justify-center px-6 py-9 sm:px-10">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft/45">
              <Award size={14} /> {found.organization.name}
              <span aria-hidden="true">·</span>
              {found.pageant.name}
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold text-white sm:text-5xl">{contestant.display_name}</h1>
            <p className="mt-3 text-sm text-gold-soft/55">
              {contestant.country_representation || contestant.country_code || "International contestant"}
              {contestant.contestant_number ? ` · Contestant #${contestant.contestant_number}` : ""}
            </p>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-gold-soft/65 sm:text-base">
              {contestant.biography || "The contestant biography has not been published yet."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {visibleSections.map((section) => (
                <a key={section.id} href={`#${section.slug}`} className="rounded-full border border-line bg-black/25 px-3 py-1.5 text-xs text-gold-soft/55 transition hover:border-gold/30 hover:text-gold">
                  {section.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {visibleSections.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-gold/20 bg-black/20 px-6 py-12 text-center">
          <h2 className="font-display text-2xl font-semibold text-white">Profile sections are being prepared</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gold-soft/45">
            Organizers can enable and reorder sections independently for each pageant contestant without changing the web application code.
          </p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {visibleSections.map((section) => {
            const Icon = sectionIcon(section.kind);
            const wide = section.kind === "gallery";
            return (
              <section
                id={section.slug}
                key={section.id}
                className={`scroll-mt-24 rounded-3xl border border-line bg-black/25 p-6 ${wide ? "lg:col-span-2" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-gold/20 bg-gold/10 text-gold">
                    <Icon size={18} />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-gold-soft/35">{section.kind}</div>
                    <h2 className="font-display text-2xl font-semibold text-white">{section.title}</h2>
                  </div>
                </div>
                <SectionBody section={section} gallery={gallery} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
