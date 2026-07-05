"use client";
import { useEffect, useRef, useState } from "react";

export function SectionHeading({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h2 className="font-display text-3xl font-semibold text-[#23252f] sm:text-4xl">{title}</h2>
      {sub && <p className="mt-2 max-w-2xl text-sm text-[#5f6172]">{sub}</p>}
    </div>
  );
}

export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(to); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !done.current) {
        done.current = true;
        const start = performance.now();
        const dur = 1200;
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{n.toLocaleString()}{suffix}</span>;
}

export function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-3 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-8">
        {doubled.map((s, i) => (
          <span key={i} className="whitespace-nowrap text-sm text-[#8a8779]">{s}</span>
        ))}
      </div>
    </div>
  );
}

export function Toast({ msg, tone = "ok" }: { msg: string; tone?: "ok" | "err" }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-floatUp rounded-full px-4 py-2 text-sm shadow-glass sm:bottom-8 ${tone === "ok" ? "bg-emerald text-ink" : "bg-ruby text-white"}`}>
      {msg}
    </div>
  );
}
