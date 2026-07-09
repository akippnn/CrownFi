import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";

export function PageSection({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8", className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHeader({ eyebrow, title, description, className }: { eyebrow?: string; title: string; description?: string; className?: string }) {
  return (
    <div className={cn("mb-6", className)}>
      {eyebrow && <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-ink">{eyebrow}</div>}
      <h2 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6172]">{description}</p>}
    </div>
  );
}

export function EmptyState({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-line bg-white/70 px-5 py-8 text-center", className)}>
      <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5f6172]">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
