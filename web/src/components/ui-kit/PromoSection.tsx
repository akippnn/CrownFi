import { ReactNode } from "react";
import { ButtonLink } from "./Button";

type PromoSectionProps = {
  title: string;
  description: string;
  bgVarName: string; // e.g. "--stage-bg"
  ctaText: string;
  ctaHref: string;
  icon?: ReactNode;
};

export function PromoSection({
  title,
  description,
  bgVarName,
  ctaText,
  ctaHref,
  icon
}: PromoSectionProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-gold/25 bg-white/70 dark:bg-black/60 px-6 py-16 text-center sm:px-10 sm:py-24 shadow-2xl shadow-gold/5 dark:shadow-black/90">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40 dark:opacity-40 dark:mix-blend-screen pointer-events-none" 
        style={{ backgroundImage: `var(${bgVarName})` }} 
      />
      {/* Light mode white overlay */}
      <div className="absolute inset-0 bg-white/70 dark:hidden pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/60 to-transparent dark:from-black dark:via-black/40 dark:to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12)_0%,transparent_60%)] pointer-events-none" />
      
      <div className="relative z-10 space-y-6">
        <h2 className="mx-auto max-w-2xl font-display text-3xl sm:text-5xl font-bold leading-tight text-ink dark:text-white">
          {title}
        </h2>
        <p className="mx-auto max-w-xl text-xs sm:text-sm text-ink/65 dark:text-gold-soft/60 leading-relaxed font-medium">
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
