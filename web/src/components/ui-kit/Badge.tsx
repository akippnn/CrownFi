import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";
import type { Emphasis, Tone } from "./types";

const tones: Record<Tone, Record<Emphasis, string>> = {
  neutral: {
    solid: "bg-white text-black",
    soft: "bg-white/10 text-white/80",
    outline: "border-line text-white/70",
    ghost: "text-white/70",
  },
  gold: {
    solid: "bg-gold text-black",
    soft: "bg-gold/15 text-gold-soft",
    outline: "border-gold/25 text-gold-soft",
    ghost: "text-gold-soft",
  },
  success: {
    solid: "bg-emerald text-black",
    soft: "bg-emerald-soft text-emerald-ink",
    outline: "border-emerald/30 text-emerald-ink",
    ghost: "text-emerald-ink",
  },
  danger: {
    solid: "bg-ruby text-white",
    soft: "bg-ruby-soft text-ruby",
    outline: "border-ruby/30 text-ruby",
    ghost: "text-ruby",
  },
  info: {
    solid: "bg-gold-deep text-black",
    soft: "bg-white/5 text-gold-soft",
    outline: "border-line text-gold-soft",
    ghost: "text-gold-soft",
  },
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: Tone;
  emphasis?: Emphasis;
};

export function Badge({ children, className, tone = "neutral", emphasis = "soft", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold leading-none",
        tones[tone][emphasis],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: "open" | "closed" | "pending" | "mock" | "anchored"; className?: string }) {
  const map = {
    open: { tone: "success" as const, label: "Voting open" },
    closed: { tone: "neutral" as const, label: "Voting closed" },
    pending: { tone: "gold" as const, label: "Pending" },
    mock: { tone: "info" as const, label: "Local demo mode" },
    anchored: { tone: "success" as const, label: "Anchored to Stellar Testnet" },
  }[status];

  return (
    <Badge className={className} tone={map.tone} emphasis="soft">
      {map.label}
    </Badge>
  );
}
