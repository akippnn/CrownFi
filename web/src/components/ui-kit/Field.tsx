import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./classNames";

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
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p className={cn("text-xs leading-5", error ? "text-ruby" : "text-[#6f6c5f]")} id={hintId}>
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
          "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-[#9a968b] focus:border-gold-soft focus:ring-2 focus:ring-gold-soft/60",
          error ? "border-ruby" : "border-[#dcd6c6]",
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
      <select
        aria-describedby={hintId}
        aria-invalid={Boolean(error)}
        className={cn(
          "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-gold-soft focus:ring-2 focus:ring-gold-soft/60",
          error ? "border-ruby" : "border-[#dcd6c6]",
          className,
        )}
        id={id}
        {...props}
      >
        {children}
      </select>
    </FieldChrome>
  );
}
