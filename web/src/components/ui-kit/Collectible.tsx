"use client";
import type { ReactNode } from "react";
import { cn } from "./classNames";
import { Button } from "./Button";

export type CollectibleProps = {
  name: string;
  country: string;
  continent: string;
  height: string;
  edition?: string;
  id?: string;
  imageUrl?: string;
  onMint?: () => void;
};

export function NFTCollectibleCard({
  name,
  country,
  continent,
  height,
  edition = "EDITION 1 of 1",
  id = "ID:123456",
  imageUrl,
}: Omit<CollectibleProps, "onMint">) {
  return (
    <div className="relative mx-auto w-80 sm:w-96 aspect-[4/3] rounded-xl p-[3px] bg-gradient-to-br from-[#f3e5ab] via-[#d4af37] to-[#8a6d1f] shadow-[0_15px_50px_rgba(212,175,55,0.25),0_0_20px_rgba(212,175,55,0.1)] transition-transform duration-500 hover:scale-[1.02]">
      {/* Glossy Overlay */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/5 to-white/10 pointer-events-none z-10" />
      
      {/* Outer Card Body */}
      <div className="h-full w-full rounded-[10px] overflow-hidden bg-gradient-to-b from-cream to-[#f9f9f9] dark:from-[#111] dark:to-[#050505] p-3 flex flex-col justify-between relative border border-gold/40 dark:border-black">
        {/* Planet/Cosmic Background Effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.15),transparent_60%)]" />
        <div className="absolute -right-20 -top-20 w-52 h-52 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.08)_0%,transparent_70%)] pointer-events-none" />
        
        {/* Card Frame inner border */}
        <div className="absolute inset-1 border border-[#d4af37]/20 rounded-[8px] pointer-events-none" />

        {/* Content Top */}
        <div className="relative flex-1 flex gap-3 items-center z-10">
          {/* Portrait Image Placeholder or Real image */}
          <div className="relative w-1/2 aspect-[4/5] rounded-lg border border-[#d4af37]/35 overflow-hidden bg-gradient-to-b from-[#ffffff] to-cream dark:from-neutral-900 dark:to-neutral-950 flex items-center justify-center shadow-inner">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="object-cover w-full h-full" />
            ) : (
              <div className="text-center p-2">
                <div className="font-display text-2xl font-bold text-gold/80">{name.split(" ").map(n => n[0]).join("")}</div>
                <div className="text-[9px] uppercase tracking-widest text-gold-soft/40 mt-1">Collectible</div>
              </div>
            )}
            
            {/* Subtle card lighting reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
          </div>

          {/* Metadata overlay */}
          <div className="w-1/2 flex flex-col justify-center space-y-2 text-left pl-1">
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold text-ink/50 dark:text-gold-soft/50 uppercase tracking-wider block">Name:</span>
              <span className="font-display text-lg sm:text-xl font-bold text-black dark:text-white leading-tight drop-shadow-sm dark:drop-shadow-md block">
                {name}
              </span>
            </div>
            
            {/* Responsive tag plate */}
            <div className="bg-black/5 dark:bg-white/10 backdrop-blur-md border border-black/10 dark:border-white/15 rounded-lg p-2.5 space-y-1 shadow-lg">
              <div className="text-[10px] text-ink/80 dark:text-white/80 leading-none">
                <span className="font-semibold">Country:</span> {country}
              </div>
              <div className="text-[10px] text-ink/80 dark:text-white/80 leading-none">
                <span className="font-semibold">Continent:</span> {continent}
              </div>
              <div className="text-[10px] text-ink/80 dark:text-white/80 leading-none">
                <span className="font-semibold">Height:</span> {height}
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer info */}
        <div className="relative mt-2 border-t border-[#d4af37]/25 pt-2 flex items-center justify-between text-[8px] font-mono text-ink/60 dark:text-gold-soft/60 uppercase tracking-widest z-10">
          <span>{edition}</span>
          
          {/* Infinity Symbol Logo */}
          <div className="w-6 h-3 flex items-center justify-center border border-gold/30 rounded px-1 bg-black/60">
            <span className="text-[9px] font-sans text-gold leading-none">∞</span>
          </div>
          
          <span>{id}</span>
        </div>
      </div>
    </div>
  );
}

export function Pedestal() {
  return (
    <div className="relative w-72 sm:w-80 h-16 mx-auto -mt-6 z-0 flex flex-col items-center justify-start select-none pointer-events-none">
      {/* Pedestal Level 1 (Top) */}
      <div 
        className="w-[200px] h-[16px] rounded-full border border-gold/40 shadow-inner bg-gradient-to-b from-cream via-white to-cream dark:from-[#111] dark:via-[#222] dark:to-[#111] z-30" 
        style={{ transform: "perspective(300px) rotateX(60deg)" }} 
      />

      {/* Pedestal Level 2 (Middle) */}
      <div 
        className="w-[240px] h-[20px] rounded-full border border-gold/30 shadow-[0_-2px_10px_rgba(212,175,55,0.08)] bg-gradient-to-b from-[#f3f3f3] via-[#ffffff] to-[#f3f3f3] dark:from-[#0b0b0d] dark:via-[#1a1a1f] dark:to-[#0a0a0c] -mt-[11px] z-20"
        style={{ transform: "perspective(300px) rotateX(60deg)" }}
      />

      {/* Pedestal Level 3 (Bottom) */}
      <div 
        className="w-[280px] h-[24px] rounded-full border border-gold/20 shadow-2xl shadow-black/15 dark:shadow-[0_10px_30px_rgba(0,0,0,0.8),0_2px_15px_rgba(212,175,55,0.06)] bg-gradient-to-b from-[#e5e5e5] via-[#f9f9f9] to-[#e5e5e5] dark:from-[#050507] dark:via-[#121215] dark:to-[#040405] -mt-[14px] z-10"
        style={{ transform: "perspective(300px) rotateX(60deg)" }}
      />
      
      {/* Decorative Gold Floor Ring */}
      <div 
        className="absolute w-[320px] h-[30px] rounded-full border border-gold/5 -bottom-2 z-0"
        style={{ transform: "perspective(300px) rotateX(60deg)" }}
      />
    </div>
  );
}

export function NFTCollectibleWithPedestal({
  name,
  country,
  continent,
  height,
  edition,
  id,
  imageUrl,
  onMint,
}: CollectibleProps) {
  return (
    <div className="flex flex-col items-center py-6">
      {/* Card floats slightly */}
      <div className="animate-float">
        <NFTCollectibleCard
          name={name}
          country={country}
          continent={continent}
          height={height}
          edition={edition}
          id={id}
          imageUrl={imageUrl}
        />
      </div>
      
      {/* Pedestal */}
      <Pedestal />
      
      {/* Action Button */}
      <div className="mt-8 z-10">
        <Button onClick={onMint} variant="embossed" size="lg" className="w-48">
          Mint Here
        </Button>
      </div>

      <style jsx global>{`
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
