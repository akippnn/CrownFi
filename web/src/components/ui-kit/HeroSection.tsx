import { ReactNode } from "react";
import { ButtonLink } from "./Button";

type HeroSectionProps = {
  eyebrow: string;
  title: string;
  italicTitle: string;
  subtitle: string;
  description: string;
  bgVarName: string; // e.g. "--hero-bg"
  ctaText: string;
  ctaHref: string;
  icon?: ReactNode;
};

export function HeroSection({
  eyebrow,
  title,
  italicTitle,
  subtitle,
  description,
  bgVarName,
  ctaText,
  ctaHref,
  icon
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-gold/25 bg-cream/50 dark:bg-black/60 px-6 py-16 text-center sm:px-10 sm:py-24 shadow-2xl shadow-gold/5 dark:shadow-black/90">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40 dark:opacity-25 dark:mix-blend-screen pointer-events-none" 
        style={{ backgroundImage: `var(${bgVarName})` }} 
      />
      {/* Light mode white overlay */}
      <div className="absolute inset-0 bg-white/70 dark:hidden pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/60 to-transparent dark:from-black dark:via-black/30 dark:to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.12),transparent_60%)] pointer-events-none" />
      
      <div className="relative z-10 space-y-6">
        <div className="eyebrow text-gold mb-2">{eyebrow}</div>
        
        <h1 className="mx-auto max-w-4xl font-display text-4xl sm:text-6xl font-bold leading-[1.1] text-ink dark:text-white">
          {title} <span className="text-gold font-serif font-normal italic">{italicTitle}</span>
          <span className="block mt-4 bg-gradient-to-b from-[#f3e5ab] via-gold to-[#b8912f] bg-clip-text text-transparent text-sm sm:text-lg font-semibold uppercase tracking-[0.22em]">
            {subtitle}
          </span>
        </h1>
        
        <p className="mx-auto max-w-2xl text-xs sm:text-sm text-ink/65 dark:text-gold-soft/60 leading-6 font-medium">
          {description}
        </p>
        
        <div className="pt-4 flex justify-center">
          <ButtonLink href={ctaHref} variant="embossed" size="lg">
            {icon}
            <span>{ctaText}</span>
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
