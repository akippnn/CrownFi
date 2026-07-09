import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";
import type { Emphasis, Tone } from "./types";

const tones: Record<Tone, Record<Emphasis, string>> = {
  neutral: {
    solid: "bg-ink text-white",
    soft: "bg-[#f1eee4] text-[#6b6552]",
    outline: "border-line text-[#5f6172]",
    ghost: "text-[#5f6172]",
  },
  gold: {
    solid: "bg-gold text-navy",
    soft: "bg-[#fbf2d0] text-gold-ink",
    outline: "border-gold-soft text-gold-ink",
    ghost: "text-gold-ink",
  },
  success: {
    solid: "bg-emerald text-ink",
    soft: "bg-emerald-soft text-emerald-ink",
    outline: "border-emerald text-emerald-ink",
    ghost: "text-emerald-ink",
  },
  danger: {
    solid: "bg-ruby text-white",
    soft: "bg-ruby-soft text-ruby",
    outline: "border-ruby text-ruby",
    ghost: "text-ruby",
  },
  info: {
    solid: "bg-navy text-white",
    soft: "bg-[#e8ecfa] text-navy",
    outline: "border-[#cbd5f6] text-navy",
    ghost: "text-navy",
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
