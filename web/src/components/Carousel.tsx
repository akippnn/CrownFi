"use client";
import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";
import { Portrait } from "./Portrait";
import { flag } from "@/lib/format";

export type Slide = { id: string; name: string; country: string; sash: string };

// The signature element: a pageant "spotlight" carousel. The centered card is lit and raised,
// neighbors dim, evoking a stage spotlight sweeping across contestants. Auto-advances, and is
// swipeable via scroll-snap on touch. Respects reduced-motion.
export function SpotlightCarousel({
  slides,
  onSelect,
  selectedId,
  cta = "Select",
}: {
  slides: Slide[];
  onSelect?: (id: string) => void;
  selectedId?: string;
  cta?: string;
}) {
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (!slides.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (!paused.current) setActive((a) => (a + 1) % slides.length);
    }, 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  if (!slides.length) return <div className="glass p-8 text-center text-[#7a7768]">No contestants yet.</div>;

  const go = (d: number) => setActive((a) => (a + d + slides.length) % slides.length);

  return (
    <div
      className="relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        {slides.map((s, i) => {
          const offset = i - active;
          const norm = ((offset + slides.length + Math.floor(slides.length / 2)) % slides.length) - Math.floor(slides.length / 2);
          const isCenter = i === active;
          // Show center + immediate neighbors; hide the rest on small screens.
          const hideOnMobile = Math.abs(norm) > 1;
          return (
            <button
              key={s.id}
              onClick={() => (isCenter ? onSelect?.(s.id) : setActive(i))}
              aria-label={isCenter ? `${cta} ${s.name}` : `Focus ${s.name}`}
              className={[
                "shrink-0 transition-all duration-500 ease-out",
                isCenter ? "w-52 sm:w-64" : "w-28 opacity-45 sm:w-40",
                hideOnMobile ? "hidden sm:block" : "",
              ].join(" ")}
              style={{ transform: `scale(${isCenter ? 1 : 0.86})` }}
            >
              <div className={`glass overflow-hidden p-2 ${isCenter ? "shadow-spot" : ""} ${selectedId === s.id ? "ring-2 ring-gold" : ""}`}>
                <Portrait id={s.id} name={s.name} sash={s.sash} />
                <div className="px-1 pb-1 pt-3 text-center">
                  <div className="truncate font-display text-lg font-semibold text-[#23252f]">{s.name}</div>
                  <div className="text-xs text-[#6f6c5f]">{flag(s.sash)} {s.country}</div>
                  {isCenter && (
                    <span className="mt-2 inline-block rounded-full bg-gradient-to-b from-gold to-gold-deep px-3 py-1 text-xs font-semibold text-ink">
                      {selectedId === s.id ? "Selected" : cta}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button onClick={() => go(-1)} className="btn-ghost h-9 w-9 !px-0" aria-label="Previous"><Icons.Prev size={16} strokeWidth={2} /></button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Go to ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-gold" : "w-1.5 bg-white/25"}`}
            />
          ))}
        </div>
        <button onClick={() => go(1)} className="btn-ghost h-9 w-9 !px-0" aria-label="Next"><Icons.Next size={16} strokeWidth={2} /></button>
      </div>
    </div>
  );
}