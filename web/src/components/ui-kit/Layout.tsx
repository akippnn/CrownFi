import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";

export function PageSection({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8", className)} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.75rem] border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_46%),rgba(8,8,10,0.9)] px-5 py-7 shadow-2xl sm:rounded-[2rem] sm:px-8 sm:py-9",
        className,
      )}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-soft/45">{eyebrow}</div>}
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-gold-soft/55 sm:text-base sm:leading-7">{description}</p>}
          {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  trailing,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">{eyebrow}</div>}
        <h2 className="text-balance font-display text-3xl font-semibold text-ink dark:text-white sm:text-4xl">{title}</h2>
        {description && <p className={cn("mt-2 max-w-2xl text-sm leading-6 text-ink/60 dark:text-gold-soft/60", className?.includes("text-center") && "mx-auto")}>{description}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-line bg-black/40 px-5 py-8 text-center", className)}>
      <h3 className="font-display text-xl font-semibold text-ink dark:text-white">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/50 dark:text-gold-soft/50">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
