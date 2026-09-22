import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "positive" | "negative" | "warning" | "outline" | "solid";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-hover text-fg-secondary",
  accent: "bg-accent/12 text-accent-text",
  positive: "bg-positive/10 text-positive",
  negative: "bg-negative/10 text-negative",
  warning: "bg-warning/12 text-warning",
  outline: "border border-border-strong text-fg-secondary",
  solid: "bg-fg-primary text-canvas",
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
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] leading-none font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
