import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./classNames";
import { ChevronDown } from "lucide-react";

type FieldChromeProps = {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  children: ReactNode;
};

function FieldChrome({ id, label, helper, error, children }: FieldChromeProps) {
  const hint = error ?? helper;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5 text-left">
      <label className="block text-sm font-medium text-gold-soft" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p className={cn("text-xs leading-5", error ? "text-ruby" : "text-gold-soft/45")} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export function TextField({ id, label, helper, error, className, ...props }: TextFieldProps) {
  const hintId = error || helper ? `${id}-hint` : undefined;
  return (
    <FieldChrome error={error} helper={helper} id={id} label={label}>
      <input
        aria-describedby={hintId}
        aria-invalid={Boolean(error)}
        className={cn(
          "w-full rounded-2xl border bg-black/60 px-4 py-2.5 text-sm text-white placeholder:text-gold-soft/30 outline-none transition-all duration-300 ease-in-out focus:rounded-xl focus:border-gold focus:ring-2 focus:ring-gold/20",
          error ? "border-ruby" : "border-gold/20",
          className,
        )}
        id={id}
        {...props}
      />
    </FieldChrome>
  );
}

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export function SelectField({ id, label, helper, error, className, children, ...props }: SelectFieldProps) {
  const hintId = error || helper ? `${id}-hint` : undefined;
  return (
    <FieldChrome error={error} helper={helper} id={id} label={label}>
      <div className="relative w-full">
        <select
          aria-describedby={hintId}
          aria-invalid={Boolean(error)}
          className={cn(
            "w-full appearance-none rounded-2xl border bg-black/60 pl-4 pr-10 py-2.5 text-sm text-white outline-none transition-all duration-300 ease-in-out focus:rounded-xl focus:border-gold focus:ring-2 focus:ring-gold/20",
            error ? "border-ruby" : "border-gold/20",
            className,
          )}
          id={id}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-gold-soft">
          <ChevronDown size={16} strokeWidth={2.5} />
        </div>
      </div>
    </FieldChrome>
  );
}
