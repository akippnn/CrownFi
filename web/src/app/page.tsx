"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Button,
  ButtonLink,
  FeatureGrid,
  OrnatePortrait,
  SectionHeader,
  ThreeDCarousel,
  HeroSection,
  AboutSection,
  PromoSection,
  FooterSection,
  NFTCollectibleWithPedestal
} from "@/components/ui-kit";
import { getJson } from "@/lib/api";
import * as Lucide from "lucide-react";

type Contestant = { id: string; name: string; country: string; sash: string; portraitUrl?: string };

// Helper to map country sash to candidate asset portraits in WebP format
const getPortraitPath = (sash: string) => {
  const map: Record<string, string> = {
    ph: "/assets/candidates/candidate_philippines_portrait_silver-gown.webp",
    jp: "/assets/candidates/candidate_japan_portrait_yellow-gown.webp",
    vn: "/assets/candidates/candidate_vietnam_portrait_silver-gown.webp",
    cn: "/assets/candidates/candidate_china_portrait_yellow-gown_outdoor.webp",
    sg: "/assets/candidates/candidate_singapore_portrait_silver-gown.webp",
    kr: "/assets/candidates/candidate_south-korea_portrait_yellow-gown.webp",
    th: "/assets/candidates/candidate_thailand_portrait_silver-gown_profile.webp",
    id: "/assets/candidates/candidate_indonesia_portrait_gold-gown.webp",
    in: "/assets/candidates/candidate_india_portrait_gold-gown_stage.webp",
    my: "/assets/candidates/candidate_malaysia_portrait_gold-gown.webp",
  };
  return map[sash.toLowerCase()] || `/portraits/${sash.toLowerCase()}.webp`;
};

export default function Home() {
  const [delegates, setDelegates] = useState<Contestant[]>([]);
  const [activeDelegate, setActiveDelegate] = useState<Contestant | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getJson<Contestant[]>("/api/contestants", []).then((cs) => {
      // Place Philippines first, then sort alphabetically by name
      const sorted = [...cs].sort((a, b) => {
        if (a.sash.toUpperCase() === "PH") return -1;
        if (b.sash.toUpperCase() === "PH") return 1;
        return a.name.localeCompare(b.name);
      });
      setDelegates(sorted);
      if (sorted.length > 0) setActiveDelegate(sorted[0]);
    });
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.75;
      scrollRef.current.scrollTo({
        left: direction === "left" ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: "smooth"
      });
    }
  };

  const featureItems = [
    { title: "Transparent Voting", description: "Secure and tamper-proof voting system running off-chain with cryptographic seals.", iconName: "Shield" as const },
    { title: "Global Access", description: "Open to pageants and fans worldwide, bridging communities on-chain.", iconName: "Globe" as const },
    { title: "Fair & Secure Platform", description: "Built on blockchain for trust and integrity, preventing double voting and manipulation.", iconName: "Gem" as const },
    { title: "Empowering Queens", description: "Supporting dreams and inspiring the world. Direct-to-contestant funding mechanics.", iconName: "Crown" as const },
  ];

  return (
    <div className="space-y-16 pb-12">
      {/* 1. Hero Section */}
      <HeroSection
        eyebrow="CrownFi Pageant Platform"
        title="CrownFi"
        italicTitle="App"
        subtitle="THE ULTIMATE BLOCKCHAIN-POWERED PLATFORM FOR PAGEANTS"
        description="Cast your vote securely, purchase verified seats, and collect limited memorabilia to fund the pageant queens you love."
        bgVarName="--hero-bg"
        ctaText="Buy Tickets"
        ctaHref="/tickets"
        icon={<Lucide.Ticket size={18} strokeWidth={2} />}
      />

      {/* 2. Meet the Delegates Snap Carousel */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <div className="eyebrow">Delegate Roster</div>
          <SectionHeader 
            title="Meet the Delegates"
            description="Vote for the NEXT Queen onchain! Help your favorite candidate advance to the next level using your power to vote!"
            className="text-center mx-auto"
          />
        </div>
        
        {delegates.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gold/15 rounded-2xl bg-black/25">
            <Lucide.Users size={32} className="mx-auto text-gold-soft/30 animate-pulse mb-3" />
            <p className="text-sm text-gold-soft/50">Loading candidate list...</p>
          </div>
        ) : (
          <ThreeDCarousel
            items={delegates}
            onActiveChange={(item) => setActiveDelegate(item)}
            renderItem={(d, isActive) => (
              <div className="w-[280px]">
                <OrnatePortrait
                  id={d.id}
                  name={d.name}
                  country={d.country}
                  sash={d.sash}
                  imageUrl={d.portraitUrl || getPortraitPath(d.sash)}
                  onVote={() => {
                    if (isActive) {
                      window.location.href = `/vote?candidate=${d.id}`;
                    }
                  }}
                />
              </div>
            )}
          />
        )}
      </section>

      {/* 3. Exclusive Drop Section */}
      <section className="relative rounded-3xl border border-gold/25 bg-white/40 dark:bg-black/40 p-8 sm:p-12 overflow-hidden shadow-xl shadow-black/5 dark:shadow-[0_15px_40px_rgba(0,0,0,0.8)] backdrop-blur-md">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(212,175,55,0.08),transparent_60%)] pointer-events-none" />
        <div className="absolute -left-20 -top-20 w-80 h-80 rounded-full bg-gold/5 blur-[80px] pointer-events-none" />
        
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-gold tracking-widest uppercase bg-gold/10 px-2 py-0.5 rounded border border-gold/15">
              Exclusive drop
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-ink dark:text-white leading-tight transition-all duration-300">
              Support {activeDelegate ? activeDelegate.name.split(' ')[0] : "Queen"}
            </h2>
            <p className="text-xs sm:text-sm text-ink/75 dark:text-gold-soft/60 leading-6">
              Every official candidate portrait has been transformed into an exclusive NFT-inspired digital collectible. Mint your favorite queen on Stellar and own a timeless piece of digital history.
            </p>
            <p className="text-xs text-ink/55 dark:text-gold-soft/45 leading-6">
              Your support directly helps fund her pageant journey, empower her advocacies, and bring her dreams to life.
            </p>
            
            <div className="pt-2 border-t border-gold/15 flex gap-8 transition-all duration-300">
              <div>
                <div className="text-[10px] text-ink/55 dark:text-gold-soft/50 uppercase tracking-widest">Network</div>
                <div className="text-xs font-semibold text-ink dark:text-white mt-0.5 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${activeDelegate?.sash.toUpperCase() === 'PH' ? 'bg-emerald' : 'bg-blue-400'}`}></span>
                  {activeDelegate?.sash.toUpperCase() === 'PH' ? 'Stellar Public' : 'Stellar Testnet'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-ink/55 dark:text-gold-soft/50 uppercase tracking-widest">Price</div>
                <div className="text-xs font-semibold text-ink dark:text-white mt-0.5">
                  {activeDelegate ? (activeDelegate.name.length * 8.5).toFixed(2) : "10.00"} XLM
                </div>
              </div>
            </div>
          </div>
          
          {/* Collectible with pedestal */}
          <div className="transition-opacity duration-300">
            {activeDelegate && (
              <NFTCollectibleWithPedestal
                name={activeDelegate.name}
                country={activeDelegate.country}
                continent={["Asia", "Europe", "Americas", "Africa"][activeDelegate.name.length % 4]}
                height={`5'${activeDelegate.name.length % 12 + 2}"`}
                edition={`EDITION 1 of ${activeDelegate.name.length * 10}`}
                id={`ID:${activeDelegate.id.toUpperCase()}`}
                imageUrl={activeDelegate.portraitUrl || getPortraitPath(activeDelegate.sash)}
                onMint={() => window.location.href = `/vote?candidate=${activeDelegate.id}`}
              />
            )}
          </div>
        </div>
      </section>

      {/* 4. Ticketing Stage Section (Reserved Seating) */}
      <PromoSection
        title="Reserved Seating & VIP Passes"
        description="Secure your seat at the grand finale runway. All tickets are cryptographically issued on the Stellar network to prevent scalping and ensure ticket transfer authenticity."
        bgVarName="--stage-bg"
        ctaText="Buy Tickets"
        ctaHref="/tickets"
        icon={<Lucide.Ticket size={18} strokeWidth={2} />}
      />

      {/* 5. About Section */}
      <AboutSection
        eyebrow="Platform Overview"
        title="About CrownFi"
        logoSrc="/assets/brand/crownfi_logo_crown-chain_gold_transparent_reclean.webp"
        description1="CrownFi is the next-generation platform empowering beauty pageants with blockchain technology. We ensure transparency, fairness, and global accessibility for contestants, fans, and organizers alike."
        description2="By utilizing the Stellar network as our trust layer, we secure ticketing authenticity, candidate memorabilia tallies, and fan loyalty rewards on-chain while keeping vote tallies fast and scalable."
        ctaText="Host a Pageant"
        ctaHref="/organize"
        features={featureItems}
      />

      {/* 6. Footer */}
      <FooterSection
        logoSrc="/assets/brand/crownfi_logo_crown-chain_gold_transparent_reclean.webp"
        brandName="CrownFi"
        tagline="The ultimate blockchain-powered platform for beauty pageants. Empowering queens. Inspiring the world."
        links={[
          { label: "Home", href: "/" },
          { label: "Vote", href: "/vote" },
          { label: "Tickets", href: "/tickets" },
          { label: "Collectibles", href: "/contestants" },
          { label: "Organize", href: "/organize" },
        ]}
        onSubscribe={(email) => {
          alert(`Subscribed ${email} to the newsletter!`);
        }}
      />
    </div>
  );
}
