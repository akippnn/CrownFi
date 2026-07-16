import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, CircleAlert, Info, Sparkles } from "lucide-react";
import { cn } from "./classNames";
import type { Tone } from "./types";

const chrome: Record<Tone, string> = {
  neutral: "border-line bg-white/[0.03] text-gold-soft/65",
  gold: "border-gold/25 bg-gold/[0.08] text-gold-soft/70",
  success: "border-emerald/30 bg-emerald/10 text-emerald-ink",
  danger: "border-ruby/30 bg-ruby/10 text-ruby",
  info: "border-line bg-black/30 text-gold-soft/60",
};

const icons = {
  neutral: Info,
  gold: Sparkles,
  success: CheckCircle2,
  danger: AlertCircle,
  info: CircleAlert,
} satisfies Record<Tone, typeof Info>;

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
};

export function Notice({ tone = "neutral", title, icon, children, className, ...props }: NoticeProps) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-6", chrome[tone], className)}
      {...props}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icon ?? <Icon size={18} />}</span>
      <div className="min-w-0">
        {title && <div className="font-semibold text-white">{title}</div>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
