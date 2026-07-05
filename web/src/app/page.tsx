"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SpotlightCarousel, Slide } from "@/components/Carousel";
import { CountUp, Marquee } from "@/components/ui";
import { flag } from "@/lib/format";
import { getJson } from "@/lib/api";

type Stats = { votes: number; tickets: number; collectiblesSold: number; contestants: number };

export default function Home() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getJson<any[]>("/api/contestants", []).then((cs) =>
      setSlides(cs.map((c: any) => ({ id: c.id, name: c.name, country: c.country, sash: c.sash })))
    );
    getJson<Stats | null>("/api/stats", null).then(setStats);
  }, []);

  const steps = [
    { n: "01", title: "Vote in a heartbeat", body: "Cast your vote instantly. Intake and de-duplication run off-chain, so the platform never buckles when millions rush in.", tag: "off-chain" },
    { n: "02", title: "Anchored to Stellar", body: "When a round closes, the tally is sealed into a Merkle root and anchored on Stellar. Tamper-evident, forever.", tag: "on-chain" },
    { n: "03", title: "Verify your receipt", body: "Get a cryptographic receipt proving your vote is in the official count. No trust required, and no identity exposed.", tag: "on-chain" },
  ];

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#e7e2d3] px-6 py-16 text-center sm:px-10 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(212,175,55,0.22),transparent_60%)]" />
        <div className="relative">
          <h1 className="mx-auto max-w-3xl font-display text-5xl font-semibold leading-[1.05] text-[#23252f] sm:text-7xl">
            Crown your queen.<br /><span className="bg-gradient-to-b text-[#b8912f]">On-chain.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[#5a5c6b]">
            The all-in-one home for pageant voting, fair ticketing, and collectibles that fund the contestants you love.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/vote" className="btn-gold">Cast your vote</Link>
            <Link href="/verify" className="btn-ghost">Verify a vote</Link>
          </div>
        </div>
      </section>

      {/* Signature carousel */}
      <section>
        <div className="mb-6 text-center">
          <div className="eyebrow mb-2">This season's court</div>
          <h2 className="font-display text-3xl font-semibold text-[#23252f] sm:text-4xl">Meet the contestants</h2>
        </div>
        <SpotlightCarousel slides={slides} cta="Vote" />
        <div className="mt-6 text-center">
          <Link href="/contestants" className="btn-ghost">Explore collectibles</Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Votes cast", value: stats?.votes ?? 0 },
          { label: "Tickets minted", value: stats?.tickets ?? 0 },
          { label: "Collectibles sold", value: stats?.collectiblesSold ?? 0 },
          { label: "Contestants", value: stats?.contestants ?? 0 },
        ].map((s) => (
          <div key={s.label} className="glass p-5 text-center">
            <div className="font-display text-4xl font-semibold text-[#b8912f]"><CountUp to={s.value} /></div>
            <div className="mt-1 text-xs uppercase tracking-wider text-[#7a7768]">{s.label}</div>
          </div>
        ))}
      </section>

      {/* How it works (a real sequence, so numbering earns its place) */}
      <section>
        <div className="mb-6 text-center">
          <div className="eyebrow mb-2">Why it holds up</div>
          <h2 className="font-display text-3xl font-semibold text-[#23252f] sm:text-4xl">Fast to vote. Impossible to fake.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="glass glass-hover p-6">
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl text-[#b8912f]/70">{s.n}</span>
                <span className={s.tag === "on-chain" ? "tag-on" : "tag-off"}>{s.tag}</span>
              </div>
              <h3 className="mt-3 font-display text-xl text-[#23252f]">{s.title}</h3>
              <p className="mt-2 text-sm text-[#5f6172]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Marquee of the field */}
      <section className="glass">
        <Marquee items={slides.length ? slides.map((s) => `${flag(s.sash)}  ${s.country}`) : ["Philippines", "Mexico", "Brazil", "Japan", "Stellar"]} />
      </section>
    </div>
  );
}
