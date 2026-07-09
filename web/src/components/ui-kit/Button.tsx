import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";
import type { Size } from "./types";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft disabled:pointer-events-none disabled:opacity-45";

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-gold to-gold-deep text-navy shadow-[0_10px_24px_-10px_rgba(184,145,47,0.55)] hover:brightness-[1.05] active:brightness-95",
  secondary:
    "border border-line bg-white text-ink shadow-[0_10px_26px_-18px_rgba(80,70,40,0.32)] hover:border-gold-soft hover:bg-cream",
  ghost: "border border-transparent text-[#3a3f52] hover:border-line hover:bg-cream",
  danger: "bg-ruby text-white shadow-[0_10px_24px_-14px_rgba(225,29,72,0.55)] hover:brightness-105 active:brightness-95",
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

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  size?: Size;
  variant?: ButtonVariant;
};

export function ButtonLink({ children, className, size = "md", variant = "primary", ...props }: ButtonLinkProps) {
  return (
    <a className={cn(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </a>
  );
}
