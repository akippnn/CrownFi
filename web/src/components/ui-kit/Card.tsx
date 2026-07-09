import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./classNames";

export function Card({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white shadow-[0_12px_34px_-20px_rgba(120,100,40,0.28)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5 p-5 pb-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode }) {
  return (
    <h3 className={cn("font-display text-xl font-semibold text-ink", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return (
    <p className={cn("text-sm leading-6 text-[#5f6172]", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("p-5 pt-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 border-t border-line p-5", className)} {...props}>
      {children}
    </div>
  );
}
