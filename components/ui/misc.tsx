"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-8 text-center", className)}>
      {icon && <span className="grid size-10 place-items-center rounded-lg bg-canvas-subtle text-fg-secondary [&_svg]:size-5">{icon}</span>}
      <p className={cn("text-h3 font-semibold text-fg-primary", icon ? "mt-3" : undefined)}>{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-meta text-fg-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

export function InlineBanner({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: "neutral" | "accent" | "warning" | "positive" | "info";
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-canvas-subtle text-fg-secondary",
    accent: "border-transparent bg-accent-soft text-fg-secondary",
    warning: "border-transparent bg-warning-soft text-fg-secondary",
    positive: "border-transparent bg-positive-soft text-fg-secondary",
    info: "border-transparent bg-info-soft text-fg-secondary",
  };
  const iconTone = { neutral: "text-fg-secondary", accent: "text-accent-text", warning: "text-warning", positive: "text-positive", info: "text-info" };
  return (
    <div role={tone === "warning" ? "alert" : "status"} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5", tones[tone], className)}>
      {icon && <span className={cn("shrink-0", iconTone[tone])}>{icon}</span>}
      <div className="min-w-0 flex-1 text-[13px] leading-5">
        <span className="font-medium text-fg-primary">{title}</span>
        {children && <span className="ml-1.5 text-fg-secondary">{children}</span>}
      </div>
      {action}
    </div>
  );
}

export function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex h-(--control-h-sm) min-w-0 items-center rounded-md border border-border bg-canvas-subtle", className)}>
      <code className="min-w-0 flex-1 truncate px-2.5 font-mono text-xs text-fg-primary" title={value}>
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
        className="flex h-full shrink-0 items-center gap-1.5 border-l border-border px-2.5 text-xs text-fg-secondary hover:bg-surface-hover hover:text-fg-primary"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="size-3.5 text-accent-text" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function KeyValueList({ items, className, columns = 1 }: { items: { label: ReactNode; value: ReactNode }[]; className?: string; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2.5", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 sm:block sm:border-b-0 sm:pb-0">
          <dt className="text-caption text-fg-muted">{item.label}</dt>
          <dd className="mt-0.5 min-w-0 truncate text-[13px] text-fg-primary tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, description, actions, meta, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        {meta && <div className="mb-1.5 flex flex-wrap items-center gap-2">{meta}</div>}
        {/* On phones the sticky header already names the page, so the heading stays for screen readers only. */}
        <h1 className="text-h1 font-semibold tracking-[-0.01em] text-fg-primary max-md:sr-only">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-meta text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, text, size = "md", tone = "neutral", className }: { name: string; text?: string; size?: "sm" | "md" | "lg"; tone?: "neutral" | "accent"; className?: string }) {
  const sizes = { sm: "size-6 text-[11px]", md: "size-8 text-[12px]", lg: "size-10 text-[13px]" };
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        tone === "accent" ? "bg-accent-soft text-accent-text" : "bg-canvas-subtle text-fg-secondary",
        sizes[size],
        className,
      )}
    >
      {text ?? initials(name)}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn("flex h-(--control-h) min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 transition-colors hover:border-fg-disabled has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/25", className)}>
      <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-fg-primary placeholder:text-fg-muted focus-visible:outline-none"
      />
    </div>
  );
}

export function StatTile({ label, value, sub, className, valueClassName }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; valueClassName?: string }) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-surface px-5 py-4", className)}>
      <p className="truncate text-[13px] leading-[18px] font-medium text-fg-muted">{label}</p>
      <p className={cn("mt-1.5 truncate text-value-m font-semibold tracking-[-0.01em] text-fg-primary tabular-nums", valueClassName)}>{value}</p>
      {sub && <div className="mt-1 truncate text-caption text-fg-secondary">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ value, label, tone = "accent", className }: { value: number; label: string; tone?: "accent" | "warning"; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} className={cn("h-1.5 overflow-hidden rounded-full bg-canvas-subtle", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone === "accent" ? "bg-accent" : "bg-warning")} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-caption font-semibold tabular-nums",
                state === "done" && "bg-positive-soft text-positive",
                state === "current" && "bg-accent text-accent-fg",
                state === "upcoming" && "bg-canvas-subtle text-fg-muted",
              )}
            >
              {state === "done" ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className={cn("text-[13px]", state === "upcoming" ? "text-fg-muted" : "text-fg-primary", state === "current" && "font-medium")}>{step}</span>
            {index < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-border-strong" />}
          </li>
        );
      })}
    </ol>
  );
}

/** C4 Kbd: a keyboard key hint. Use inside help text and menus; buttons take a `shortcut` prop instead. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-grid h-[22px] min-w-[22px] place-items-center rounded-xs border border-border-strong bg-surface px-1.5 font-mono text-caption leading-none text-fg-secondary", className)}>
      {children}
    </kbd>
  );
}
