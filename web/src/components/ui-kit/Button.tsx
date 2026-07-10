import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link, { type LinkProps } from "next/link";
import { cn } from "./classNames";
import type { Size } from "./types";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "embossed";

const base =
  "inline-flex items-center justify-center gap-2.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft disabled:pointer-events-none disabled:opacity-45";

const sizes: Record<Size, string> = {
  sm: "h-[36px] px-4 text-xs font-display font-semibold rounded-xl",
  md: "h-[44px] px-6 text-sm font-display font-semibold rounded-2xl",
  lg: "h-[52px] px-8 text-base font-display font-bold rounded-2xl",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "btn-gold hover:text-black active:scale-95 transition-all duration-150",
  secondary:
    "btn-ghost active:scale-95 transition-all duration-150",
  ghost:
    "border border-transparent text-gold-soft/80 hover:text-gold hover:bg-white/5 active:scale-95 transition-all duration-150",
  danger:
    "bg-ruby text-white border border-transparent shadow-[0_4px_15px_rgba(244,63,94,0.25)] hover:brightness-105 active:scale-95 transition-all duration-150",
  embossed:
    "btn-skeuomorphic-gold hover:text-white active:scale-95 transition-all duration-150",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: Size;
  variant?: ButtonVariant;
};

export function Button({ children, className, size = "md", variant = "primary", type = "button", ...props }: ButtonProps) {
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} type={type} {...props}>
      {children}
    </button>
  );
}

export type ButtonLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  size?: Size;
  variant?: ButtonVariant;
};

export function ButtonLink({ children, className, size = "md", variant = "primary", ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
