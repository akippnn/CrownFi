"use client";
import { cn } from "./classNames";
import { Button } from "./Button";
import { flag, gradientFromId, initials } from "@/lib/format";

export type OrnatePortraitProps = {
  id: string;
  name: string;
  country: string;
  sash: string;
  imageUrl?: string;
  onVote?: () => void;
  className?: string;
};

export function OrnatePortrait({
  id,
  name,
  country,
  sash,
  imageUrl,
  onVote,
  className,
}: OrnatePortraitProps) {
  const gradientBg = gradientFromId(id);

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-gold/45 dark:border-gold/20 bg-white dark:bg-[#0c0c0e] p-3 text-center shadow-lg shadow-black/5 dark:shadow-none transition-all duration-300 hover:border-gold hover:shadow-[0_8px_30px_rgba(212,175,55,0.18)]",
        className
      )}
    >
      {/* Ornate Gold Frame Corner Highlights */}
      {/* Top Left */}
      <span className="absolute left-1.5 top-1.5 z-20 w-4 h-4 border-l-2 border-t-2 border-gold pointer-events-none rounded-tl-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      <span className="absolute left-2.5 top-2.5 z-20 w-1.5 h-1.5 border-l border-t border-gold pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-300" />
      
      {/* Top Right */}
      <span className="absolute right-1.5 top-1.5 z-20 w-4 h-4 border-r-2 border-t-2 border-gold pointer-events-none rounded-tr-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      <span className="absolute right-2.5 top-2.5 z-20 w-1.5 h-1.5 border-r border-t border-gold pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-300" />

      {/* Bottom Left */}
      <span className="absolute left-1.5 bottom-1.5 z-20 w-4 h-4 border-l-2 border-b-2 border-gold pointer-events-none rounded-bl-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      <span className="absolute left-2.5 bottom-2.5 z-20 w-1.5 h-1.5 border-l border-b border-gold pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-300" />

      {/* Bottom Right */}
      <span className="absolute right-1.5 bottom-1.5 z-20 w-4 h-4 border-r-2 border-b-2 border-gold pointer-events-none rounded-br-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      <span className="absolute right-2.5 bottom-2.5 z-20 w-1.5 h-1.5 border-r border-b border-gold pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-300" />

      {/* Image container */}
      <div 
        className="relative w-full aspect-[4/5] overflow-hidden rounded-lg border border-gold/10 group-hover:border-gold/30 transition-colors duration-300"
        style={{ background: gradientBg }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Crown watermark in backdrop */}
            <div className="absolute opacity-5 text-gold text-7xl select-none font-sans">♛</div>
            <span className="font-display text-4xl font-semibold text-gold/35 group-hover:text-gold/50 transition-colors duration-300 drop-shadow">
              {initials(name)}
            </span>
          </div>
        )}
        
        {/* Soft dark vignetting */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
        
        {/* Country Flag Badge inside image */}
        <div className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-sm leading-none backdrop-blur border border-gold/15 text-white flex items-center gap-1 shadow">
          <span>{flag(sash)}</span>
          <span className="text-[9px] font-semibold tracking-wider uppercase text-gold-soft">{sash}</span>
        </div>
      </div>

      {/* Profile Details Container */}
      <div className="mt-3.5 px-1 pb-1">
        {/* Name in elegant display font */}
        <h4 className="truncate font-display text-base font-semibold text-ink dark:text-white group-hover:text-gold transition-colors duration-300 leading-tight">
          {name}
        </h4>
        
        {/* Country text */}
        <p className="text-[11px] uppercase tracking-wider text-ink/50 dark:text-gold-soft/50 font-medium mt-1 mb-3.5">
          {country}
        </p>

        {/* Action button */}
        <Button
          onClick={onVote}
          variant="secondary"
          className="w-full"
        >
          Vote
        </Button>
      </div>
    </div>
  );
}
