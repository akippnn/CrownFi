"use client";
import type { ElementType } from "react";
import { cn } from "./classNames";
import * as LucideIcons from "lucide-react";

export type FeatureCardProps = {
  title: string;
  description: string;
  iconName: "Shield" | "Globe" | "Gem" | "Crown";
  className?: string;
};

export function FeatureCard({ title, description, iconName, className }: FeatureCardProps) {
  // Dynamically resolve the Lucide icon from the module
  const IconComponent = LucideIcons[iconName] as ElementType;

  return (
    <div
      className={cn(
        "group rounded-2xl border border-gold/15 bg-white/60 dark:bg-black/40 p-6 shadow-xl shadow-black/5 dark:shadow-black/60 backdrop-blur-xl transition-all duration-300 hover:border-gold/45 hover:shadow-2xl hover:shadow-gold/10 dark:hover:shadow-gold/10 hover:-translate-y-0.5",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10 border border-gold/25 text-gold shadow-[0_4px_12px_rgba(212,175,55,0.15)] group-hover:bg-gold/20 group-hover:scale-105 transition-all duration-300">
        {IconComponent ? (
          <IconComponent size={22} strokeWidth={2} className="text-gold" />
        ) : (
          <span className="text-gold">✦</span>
        )}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink dark:text-white group-hover:text-gold-soft transition-colors duration-300">
        {title}
      </h3>
      <p className="mt-2 text-xs leading-5 text-ink/60 dark:text-gold-soft/50 group-hover:text-ink/80 dark:group-hover:text-gold-soft/75 transition-colors duration-300">
        {description}
      </p>
    </div>
  );
}

export function FeatureGrid({ items }: { items: Omit<FeatureCardProps, "className">[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <FeatureCard key={index} {...item} />
      ))}
    </div>
  );
}
