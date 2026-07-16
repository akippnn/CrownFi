"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Crown, MapPin, Ticket, UsersRound } from "lucide-react";
import {
  AboutSection,
  Badge,
  ButtonLink,
  Card,
  CardContent,
  EmptyState,
  FooterSection,
  HeroSection,
  NFTCollectibleWithPedestal,
  OrnatePortrait,
  PromoSection,
  SectionHeader,
  ThreeDCarousel,
} from "@/components/ui-kit";
import {
  normalizePageantHomeWidgets,
  type PageantHomeWidget,
  type PageantHomeWidgetId,
} from "@/lib/pageantHome";

export type PageantHomePageant = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  starts_at?: string | null;
  venue_name?: string | null;
};

export type PageantHomeCategory = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
};

export type PageantHomeContestant = {
  id: string;
  display_name: string;
  biography?: string | null;
  country_code?: string | null;
  country_representation?: string | null;
  sash?: string | null;
  contestant_number?: number | null;
  portrait_url?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Schedule to be announced";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch {
    return "Schedule to be announced";
  }
}

function country(contestant: PageantHomeContestant) {
  return contestant.country_representation || contestant.country_code || "International";
}

function sash(contestant: PageantHomeContestant) {
  return contestant.sash || contestant.country_code || "CF";
}

function WidgetFrame({ id, children }: { id: PageantHomeWidgetId; children: React.ReactNode }) {
  return <div data-pageant-widget={id}>{children}</div>;
}

export function PageantHomeExperience({
  pageant,
  organizationName,
  contestants,
  categories,
  widgets,
  preview = false,
}: {
  pageant: PageantHomePageant;
  organizationName: string;
  contestants: PageantHomeContestant[];
  categories: PageantHomeCategory[];
  widgets?: PageantHomeWidget[];
  preview?: boolean;
}) {
  const router = useRouter();
  const layout = useMemo(() => normalizePageantHomeWidgets(widgets), [widgets]);
  const [activeContestantId, setActiveContestantId] = useState(contestants[0]?.id ?? "");
  const activeContestant = contestants.find((contestant) => contestant.id === activeContestantId) ?? contestants[0] ?? null;

  const features = [
    { title: "Transparent voting", description: "Fast vote intake with independently verifiable result checkpoints.", iconName: "Shield" as const },
    { title: "Verified access", description: "Tickets and event passes remain tied to a clear ownership record.", iconName: "Globe" as const },
    { title: "Official collectibles", description: "Organizer-issued digital keepsakes support the contestant experience.", iconName: "Gem" as const },
    { title: "Organizer controlled", description: "The pageant team controls content, categories, visibility, and presentation.", iconName: "Crown" as const },
  ];

  const renderWidget = (widget: PageantHomeWidget) => {
    const settings = widget.settings;
    switch (widget.id) {
      case "hero":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <HeroSection
              eyebrow={settings.eyebrow || organizationName}
              title={settings.title || pageant.name}
              italicTitle="Live"
              subtitle={settings.subtitle || "VOTE · ATTEND · SUPPORT · VERIFY"}
              description={settings.description || pageant.description || `The official digital home of ${pageant.name}.`}
              bgVarName="--hero-bg"
              ctaText={settings.ctaText || "Cast your vote"}
              ctaHref={`/vote?pageant=${pageant.id}`}
              icon={<Crown size={18} strokeWidth={2} />}
            />
            <div className="mx-auto -mt-6 grid max-w-4xl gap-3 px-4 sm:grid-cols-3">
              <Card className="bg-black/75">
                <CardContent className="flex items-start gap-3 pt-5">
                  <CalendarDays className="mt-0.5 shrink-0 text-gold" size={18} />
                  <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Schedule</div><div className="mt-1 text-sm text-white">{formatDate(pageant.starts_at)}</div></div>
                </CardContent>
              </Card>
              <Card className="bg-black/75">
                <CardContent className="flex items-start gap-3 pt-5">
                  <MapPin className="mt-0.5 shrink-0 text-gold" size={18} />
                  <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Venue</div><div className="mt-1 text-sm text-white">{pageant.venue_name || "Venue to be announced"}</div></div>
                </CardContent>
              </Card>
              <Card className="bg-black/75">
                <CardContent className="flex items-start gap-3 pt-5">
                  <UsersRound className="mt-0.5 shrink-0 text-gold" size={18} />
                  <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-soft/35">Delegates</div><div className="mt-1 text-sm text-white">{contestants.length} official contestants</div></div>
                </CardContent>
              </Card>
            </div>
          </WidgetFrame>
        );

      case "delegates":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <section id="contestants" className="scroll-mt-24 space-y-7">
              <SectionHeader
                eyebrow={settings.eyebrow || "Official lineup"}
                title={settings.title || "Meet the delegates"}
                description={settings.description || "Explore the contestants representing this pageant."}
                className="text-center"
              />
              {contestants.length === 0 ? (
                <EmptyState title="No delegates are published" description="The organizer has not published contestants for this pageant yet." />
              ) : (
                <ThreeDCarousel
                  items={contestants}
                  onActiveChange={(contestant) => setActiveContestantId(contestant.id)}
                  renderItem={(contestant, isActive) => (
                    <div className="w-[280px]">
                      <OrnatePortrait
                        id={contestant.id}
                        name={contestant.display_name}
                        country={country(contestant)}
                        sash={sash(contestant)}
                        imageUrl={contestant.portrait_url || undefined}
                        onVote={preview ? undefined : () => {
                          if (isActive) router.push(`/vote?pageant=${pageant.id}&candidate=${contestant.id}`);
                        }}
                      />
                    </div>
                  )}
                />
              )}
            </section>
          </WidgetFrame>
        );

      case "categories":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <section id="categories" className="scroll-mt-24 space-y-5 rounded-3xl border border-line bg-black/30 p-6 sm:p-9">
              <SectionHeader
                eyebrow={settings.eyebrow || "Competition format"}
                title={settings.title || "Pageant categories"}
                description={settings.description || "Organizer-defined categories shape the voting and contestant experience."}
              />
              {categories.length === 0 ? (
                <EmptyState title="No categories are published" description="Categories will appear here after the organizer configures them." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => (
                    <Card key={category.id} className="h-full">
                      <CardContent className="pt-5">
                        <Badge tone="gold">{category.status}</Badge>
                        <h3 className="mt-3 font-display text-xl font-semibold text-white">{category.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-gold-soft/50">{category.description || "An official competition category for this pageant."}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </WidgetFrame>
        );

      case "collectible":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <section className="relative overflow-hidden rounded-3xl border border-gold/25 bg-black/40 p-7 sm:p-11">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(212,175,55,0.1),transparent_60%)] pointer-events-none" />
              <div className="relative grid items-center gap-8 md:grid-cols-2">
                <div>
                  <div className="eyebrow">{settings.eyebrow || "Featured collectible"}</div>
                  <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
                    {settings.title || (activeContestant ? `Support ${activeContestant.display_name}` : "Support the delegates")}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-gold-soft/60">
                    {settings.description || "Collect an official digital keepsake and follow the ownership record through CrownFi."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Badge tone="gold">Official pageant issue</Badge>
                    <Badge tone="neutral">Stellar Testnet</Badge>
                  </div>
                  <ButtonLink className="mt-6" href={`/contestants?pageant=${pageant.id}${activeContestant ? `&candidate=${activeContestant.id}` : ""}`} variant="secondary">
                    {settings.ctaText || "View collectibles"}
                  </ButtonLink>
                </div>
                {activeContestant ? (
                  <NFTCollectibleWithPedestal
                    name={activeContestant.display_name}
                    country={country(activeContestant)}
                    continent="Official delegate"
                    height={activeContestant.contestant_number ? `Contestant #${activeContestant.contestant_number}` : "CrownFi edition"}
                    edition={`EDITION 1 of ${Math.max(10, contestants.length * 10)}`}
                    id={`ID:${activeContestant.id.slice(0, 8).toUpperCase()}`}
                    imageUrl={activeContestant.portrait_url || undefined}
                    onMint={preview ? undefined : () => router.push(`/contestants?pageant=${pageant.id}&candidate=${activeContestant.id}`)}
                  />
                ) : (
                  <EmptyState title="No featured delegate" description="Publish at least one contestant to activate this widget." />
                )}
              </div>
            </section>
          </WidgetFrame>
        );

      case "tickets":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <PromoSection
              title={settings.title || "Reserved seating and verified passes"}
              description={settings.description || "Choose a ticket tier and receive a verifiable CrownFi event pass."}
              bgVarName="--stage-bg"
              ctaText={settings.ctaText || "Browse tickets"}
              ctaHref={`/tickets?pageant=${pageant.id}`}
              icon={<Ticket size={18} strokeWidth={2} />}
            />
          </WidgetFrame>
        );

      case "about":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <AboutSection
              eyebrow={settings.eyebrow || "Pageant overview"}
              title={settings.title || `About ${pageant.name}`}
              logoSrc="/assets/brand/crownfi_logo_crown-chain_gold_transparent_reclean.webp"
              description1={settings.description || pageant.description || `${pageant.name} is presented by ${organizationName} through CrownFi.`}
              description2="CrownFi provides the shared voting, ticketing, collectible, and verification experience while the organizer remains responsible for pageant content and operations."
              ctaText={settings.ctaText || "Explore all pageants"}
              ctaHref="/platform"
              features={features}
            />
          </WidgetFrame>
        );

      case "footer":
        return (
          <WidgetFrame id={widget.id} key={widget.id}>
            <FooterSection
              logoSrc="/assets/brand/crownfi_logo_crown-chain_gold_transparent_reclean.webp"
              brandName={pageant.name}
              tagline={`Presented by ${organizationName} on CrownFi.`}
              links={[
                { label: "Pageant home", href: `/platform/pageants/${pageant.id}` },
                { label: "Contestants", href: `/platform/pageants/${pageant.id}#contestants` },
                { label: "Vote", href: `/vote?pageant=${pageant.id}` },
                { label: "Tickets", href: `/tickets?pageant=${pageant.id}` },
                { label: "All pageants", href: "/platform" },
              ]}
            />
          </WidgetFrame>
        );
    }
  };

  return (
    <div className="space-y-14 pb-8 sm:space-y-16">
      {layout.filter((widget) => widget.enabled).map(renderWidget)}
    </div>
  );
}
