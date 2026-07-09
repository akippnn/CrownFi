"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Button,
  FeatureGrid,
  OrnatePortrait,
  SectionHeader
} from "@/components/ui-kit";
import { getJson } from "@/lib/api";
import * as Lucide from "lucide-react";

type Contestant = { id: string; name: string; country: string; sash: string; portraitUrl?: string };

// Helper to map country sash to candidate asset portraits
const getPortraitPath = (sash: string) => {
  const map: Record<string, string> = {
    ph: "/assets/candidates/candidate_philippines_portrait_silver-gown.png",
    jp: "/assets/candidates/candidate_japan_portrait_yellow-gown.png",
    vn: "/assets/candidates/candidate_vietnam_portrait_silver-gown.png",
    mx: "/assets/candidates/candidate_china_portrait_yellow-gown_outdoor.png",
    br: "/assets/candidates/candidate_singapore_portrait_silver-gown.png",
    fr: "/assets/candidates/candidate_south-korea_portrait_yellow-gown.png",
    th: "/assets/candidates/candidate_thailand_portrait_silver-gown_profile.png",
    id: "/assets/candidates/candidate_indonesia_portrait_gold-gown.png",
    in: "/assets/candidates/candidate_india_portrait_gold-gown_stage.png",
    my: "/assets/candidates/candidate_malaysia_portrait_gold-gown.png",
  };
  return map[sash.toLowerCase()] || `/portraits/${sash.toLowerCase()}.png`;
};

export default function Home() {
  const [delegates, setDelegates] = useState<Contestant[]>([]);

  useEffect(() => {
    getJson<Contestant[]>("/api/contestants", []).then((cs) => {
      setDelegates(cs);
    });
  }, []);

  const featureItems = [
    { title: "Transparent Voting", description: "Secure and tamper-proof voting system running off-chain with cryptographic seals.", iconName: "Shield" as const },
    { title: "Global Access", description: "Open to pageants and fans worldwide, bridging communities on-chain.", iconName: "Globe" as const },
    { title: "Fair & Secure Platform", description: "Built on blockchain for trust and integrity, preventing double voting and manipulation.", iconName: "Gem" as const },
    { title: "Empowering Queens", description: "Supporting dreams and inspiring the world. Direct-to-contestant funding mechanics.", iconName: "Crown" as const },
  ];

  return (
    <div className="space-y-16 pb-12">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-gold/20 bg-black/70 px-6 py-16 text-center sm:px-10 sm:py-24 shadow-[0_20px_50px_rgba(0,0,0,0.9)]">
        {/* Background image & gradient overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-35 mix-blend-screen pointer-events-none" 
          style={{ backgroundImage: "url('/assets/rewards/crown-token_two-hands_gold-ribbons.png')" }} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.18)_0%,transparent_60%)] pointer-events-none" />
        
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3.5 py-1.5 text-xs font-semibold text-gold-soft uppercase tracking-wider backdrop-blur-md">
            <Lucide.Sparkles size={12} className="text-gold" />
            <span>The Ultimate Pageant Hub</span>
          </div>
          
          <h1 className="mx-auto max-w-4xl font-display text-4xl sm:text-6xl font-bold leading-[1.1] text-white">
            CrownFi App
            <span className="block mt-2 bg-gradient-to-b from-[#f3e5ab] via-gold to-[#b8912f] bg-clip-text text-transparent">
              THE ULTIMATE BLOCKCHAIN-POWERED PLATFORM FOR PAGEANTS
            </span>
          </h1>
          
          <p className="mx-auto max-w-2xl text-xs sm:text-sm text-gold-soft/60 leading-6 font-medium">
            Cast your vote securely, purchase verified seats, and collect limited memorabilia to fund the pageant queens you love.
          </p>
          
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <Link href="/vote" passHref legacyBehavior>
              <Button variant="primary" size="lg">
                <Lucide.Vote size={18} strokeWidth={2} />
                <span>Cast your vote</span>
              </Button>
            </Link>
            <Link href="/tickets" passHref legacyBehavior>
              <Button variant="embossed" size="lg">
                <Lucide.Ticket size={18} strokeWidth={2} />
                <span>Buy Tickets</span>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. About Section */}
      <section className="rounded-3xl border border-gold/15 bg-black/40 p-8 sm:p-12 shadow-[0_15px_40px_rgba(0,0,0,0.8)] backdrop-blur-md">
        <div className="grid md:grid-cols-3 gap-8 items-center">
          {/* Logo on pedestal */}
          <div className="md:col-span-1 flex justify-center">
            <div className="relative group p-4 border border-gold/15 rounded-2xl bg-black/50 overflow-hidden shadow-inner max-w-[240px]">
              <img 
                src="/assets/brand/crownfi_logo_crown-chain_gold.png" 
                alt="CrownFi Logo" 
                className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
            </div>
          </div>
          
          {/* Content */}
          <div className="md:col-span-2 text-left space-y-4">
            <div className="eyebrow">Platform Overview</div>
            <h2 className="font-display text-3xl font-bold text-white">About CrownFi</h2>
            <p className="text-xs sm:text-sm text-gold-soft/75 leading-relaxed">
              CrownFi is the next-generation platform empowering beauty pageants with blockchain technology. We ensure transparency, fairness, and global accessibility for contestants, fans, and organizers alike.
            </p>
            <p className="text-xs sm:text-sm text-gold-soft/50 leading-relaxed">
              By utilizing the Stellar network as our trust layer, we secure ticketing authenticity, candidate memorabilia tallies, and fan loyalty rewards on-chain while keeping vote tallies fast and scalable.
            </p>
            <div className="pt-2">
              <Link href="/organize" passHref legacyBehavior>
                <Button variant="secondary">Host a Pageant</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-12 pt-10 border-t border-gold/10">
          <FeatureGrid items={featureItems} />
        </div>
      </section>

      {/* 3. Ticketing Stage Section */}
      <section className="relative overflow-hidden rounded-3xl border border-gold/20 bg-[#09090b] px-6 py-16 text-center sm:px-10 sm:py-24 shadow-[0_20px_50px_rgba(0,0,0,0.9)]">
        {/* Background image & gradient overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-screen pointer-events-none" 
          style={{ backgroundImage: "url('/assets/ticketing/venue_golden_pageant_stage_wide.png')" }} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12)_0%,transparent_60%)] pointer-events-none" />
        
        <div className="relative z-10 space-y-6">
          <h2 className="mx-auto max-w-2xl font-display text-3xl sm:text-5xl font-bold leading-tight text-white">
            Reserved Seating & VIP Passes
          </h2>
          <p className="mx-auto max-w-xl text-xs sm:text-sm text-gold-soft/60 leading-relaxed font-medium">
            Secure your seat at the grand finale runway. All tickets are cryptographically issued on the Stellar network to prevent scalping and ensure ticket transfer authenticity.
          </p>
          <div className="pt-4 flex justify-center">
            <Link href="/tickets" passHref legacyBehavior>
              <Button variant="embossed">
                <Lucide.Ticket size={18} strokeWidth={2} />
                <span>Buy Tickets</span>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Meet the Delegates Grid */}
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
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-6">
            {delegates.map((d) => (
              <OrnatePortrait
                key={d.id}
                id={d.id}
                name={d.name}
                country={d.country}
                sash={d.sash}
                imageUrl={getPortraitPath(d.sash)}
                onVote={() => {
                  window.location.href = `/vote?candidate=${d.id}`;
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. Footer */}
      <footer className="border-t border-gold/15 bg-black/90 pt-12 pb-6 px-4 rounded-3xl overflow-hidden relative">
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_at_bottom,rgba(212,175,55,0.06),transparent_60%)] pointer-events-none" />
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10">
          {/* Logo / Brand */}
          <div className="space-y-4 text-left">
            <div className="flex items-center gap-2">
              <img src="/assets/brand/crownfi_log_crown-chain_gold_transparency-fixed.png" alt="CrownFi Logo" className="h-6 w-6 object-contain" />
              <span className="font-display text-xl font-semibold tracking-wide text-gold">CrownFi</span>
            </div>
            <p className="text-[11px] leading-5 text-gold-soft/45">
              The ultimate blockchain-powered platform for beauty pageants. Empowering queens. Inspiring the world.
            </p>
            <div className="text-[10px] text-gold-soft/30 mt-4">
              © 2026 CrownFi. All rights reserved.
            </div>
          </div>

          {/* Quick Links */}
          <div className="text-left">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4 font-display">Quick Links</h4>
            <ul className="space-y-2 text-[11px] text-gold-soft/60">
              <li><Link href="/" className="hover:text-gold transition">Home</Link></li>
              <li><Link href="/vote" className="hover:text-gold transition">Vote</Link></li>
              <li><Link href="/tickets" className="hover:text-gold transition">Tickets</Link></li>
              <li><Link href="/contestants" className="hover:text-gold transition">Collectibles</Link></li>
              <li><Link href="/organize" className="hover:text-gold transition">Organize</Link></li>
            </ul>
          </div>

          {/* Follow Us */}
          <div className="text-left">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4 font-display">Follow Us</h4>
            <div className="flex gap-4">
              <a href="#" className="h-8 w-8 rounded-full border border-gold/20 flex items-center justify-center text-gold-soft/60 hover:text-gold hover:border-gold transition bg-black/40">
                <Lucide.Twitter size={14} />
              </a>
              <a href="#" className="h-8 w-8 rounded-full border border-gold/20 flex items-center justify-center text-gold-soft/60 hover:text-gold hover:border-gold transition bg-black/40">
                <Lucide.Disc size={14} />
              </a>
              <a href="#" className="h-8 w-8 rounded-full border border-gold/20 flex items-center justify-center text-gold-soft/60 hover:text-gold hover:border-gold transition bg-black/40">
                <Lucide.Instagram size={14} />
              </a>
              <a href="#" className="h-8 w-8 rounded-full border border-gold/20 flex items-center justify-center text-gold-soft/60 hover:text-gold hover:border-gold transition bg-black/40">
                <Lucide.Send size={14} />
              </a>
            </div>
          </div>

          {/* Newsletter */}
          <div className="space-y-4 text-left">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold font-display">Newsletter</h4>
            <p className="text-[11px] text-gold-soft/50 leading-relaxed">
              Stay updated with our latest news and events.
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="w-full rounded-full border border-gold/20 bg-black/60 px-4 py-2 text-xs text-white placeholder-gold-soft/30 outline-none focus:border-gold"
              />
              <Button variant="primary" size="sm" className="w-full uppercase tracking-wider font-bold">
                Subscribe
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-gold/10 pt-4 flex flex-col md:flex-row justify-between text-[9px] text-gold-soft/30 gap-2">
          <div>
            Platform secured via Stellar onchain verification tallies.
          </div>
          <div className="flex gap-4">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <span>|</span>
            <a href="#" className="hover:underline">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
