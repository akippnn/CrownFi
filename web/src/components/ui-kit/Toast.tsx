"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "./classNames";

export function Toast({ msg, tone = "ok" }: { msg: string; tone?: "ok" | "err" }) {
  if (!msg) return null;
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <div
      aria-live="polite"
      role={tone === "err" ? "alert" : "status"}
      className={cn(
        "fixed inset-x-4 bottom-24 z-[110] mx-auto flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-max sm:max-w-lg sm:-translate-x-1/2",
        tone === "ok"
          ? "border-emerald/30 bg-[#0d241c]/95 text-emerald-ink"
          : "border-ruby/30 bg-[#2b1017]/95 text-red-100",
      )}
    >
      <Icon className="mt-0.5 shrink-0" size={18} />
      <span>{msg}</span>
    </div>
  );
}
