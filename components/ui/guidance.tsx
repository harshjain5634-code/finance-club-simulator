"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "./controls";
import { cn } from "@/lib/utils";

/** One short line of contextual help, used instead of tutorials. */
export function HelpText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed text-fg-muted", className)}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Small info icon with a tooltip for unfamiliar controls. */
export function InfoTip({ content, label = "More information", className }: { content: ReactNode; label?: string; className?: string }) {
  return (
    <Tooltip content={content}>
      <button type="button" aria-label={label} className={cn("inline-grid size-4 place-items-center rounded-full text-fg-muted hover:text-fg-secondary", className)}>
        <Info className="size-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}

/** Explains why something is unavailable and what happens next. Replaces disabled forms and blank areas. */
export function StatePanel({
  icon,
  eyebrow,
  title,
  description,
  action,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "warning" | "accent";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", size === "md" ? "px-6 py-10" : "px-4 py-6", className)}>
      {icon && (
        <span
          className={cn(
            "grid place-items-center rounded-full border",
            size === "md" ? "size-12" : "size-9",
            tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : tone === "accent" ? "border-accent/30 bg-accent/10 text-accent-text" : "border-border bg-surface-raised text-fg-secondary",
          )}
        >
          {icon}
        </span>
      )}
      {eyebrow && <p className={cn("mt-4 text-[11px] font-semibold tracking-[0.14em] uppercase", tone === "warning" ? "text-warning" : "text-fg-muted")}>{eyebrow}</p>}
      <p className={cn("font-semibold text-fg-primary", eyebrow ? "mt-1" : icon ? "mt-3.5" : "", size === "md" ? "text-base" : "text-[14px]")}>{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-secondary">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
