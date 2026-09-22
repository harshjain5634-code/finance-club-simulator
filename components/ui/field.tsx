import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClasses =
  "h-(--control-h) w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-[14px] text-fg-primary tabular-nums placeholder:text-fg-muted transition-colors duration-150 hover:border-fg-disabled focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:bg-canvas-subtle disabled:text-fg-disabled aria-invalid:border-negative aria-invalid:focus-visible:ring-negative/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClasses, "h-auto min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}

type FieldProps = {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
  aside?: ReactNode;
};

export function Field({ label, htmlFor, hint, error, required, className, children, aside }: FieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] leading-[18px] font-medium text-fg-primary">
          {label}
          {required && <span className="ml-0.5 text-warning" aria-hidden>*</span>}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="text-caption text-negative" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-fg-muted">{hint}</p>
      )}
    </div>
  );
}

export function FormSection({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4 border-b border-border py-5 last:border-b-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8", className)}>
      <div>
        <h3 className="text-h3 font-semibold text-fg-primary">{title}</h3>
        {description && <p className="mt-1 text-caption text-fg-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
