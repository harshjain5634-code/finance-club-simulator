import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * C4 Status Badge. accent = live/current, warning = attention/frozen, positive/negative = money only,
 * info = neutral-but-notable (e.g. "Important" news). Always pair colour with a text label.
 */
export type BadgeTone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info" | "outline" | "solid" | "solid-accent" | "solid-warning";

const tones: Record<BadgeTone, string> = {
  neutral: "border border-border bg-surface-hover text-fg-secondary",
  accent: "bg-accent-soft text-accent-text",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  outline: "border border-border-strong text-fg-secondary",
  solid: "bg-fg-primary text-fg-inverse",
  "solid-accent": "bg-accent text-accent-fg",
  "solid-warning": "bg-warning text-warning-fg",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-caption leading-none font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
