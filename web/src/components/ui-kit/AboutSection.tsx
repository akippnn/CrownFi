import { FeatureGrid } from "./FeatureCard";
import { ButtonLink } from "./Button";

type AboutSectionProps = {
  eyebrow: string;
  title: string;
  logoSrc: string;
  description1: string;
  description2: string;
  ctaText: string;
  ctaHref: string;
  features: Array<{ title: string; description: string; iconName: "Shield" | "Globe" | "Gem" | "Crown" }>;
};

export function AboutSection({
  eyebrow,
  title,
  logoSrc,
  description1,
  description2,
  ctaText,
  ctaHref,
  features
}: AboutSectionProps) {
  return (
    <section className="rounded-3xl border border-gold/15 bg-white/40 dark:bg-black/40 p-8 sm:p-12 shadow-[0_15px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.8)] backdrop-blur-md">
      <div className="grid md:grid-cols-3 gap-8 items-center">
        {/* Logo - borderless transparent image */}
        <div className="md:col-span-1 flex justify-center">
          <div className="relative group max-w-[240px] flex justify-center">
            <img 
              src={logoSrc} 
              alt="Brand Logo" 
              className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        </div>
        
        {/* Content */}
        <div className="md:col-span-2 text-left space-y-4">
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="font-display text-3xl font-bold text-ink dark:text-white">{title}</h2>
          <p className="text-xs sm:text-sm text-ink/80 dark:text-gold-soft/75 leading-relaxed">
            {description1}
          </p>
          <p className="text-xs sm:text-sm text-ink/65 dark:text-gold-soft/50 leading-relaxed">
            {description2}
          </p>
          <div className="pt-2">
            <ButtonLink href={ctaHref} variant="secondary">{ctaText}</ButtonLink>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="mt-12 pt-10 border-t border-gold/10">
        <FeatureGrid items={features} />
      </div>
    </section>
  );
}
