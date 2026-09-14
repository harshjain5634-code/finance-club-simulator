import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "positive" | "negative" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-hover text-fg-muted",
  accent: "bg-accent/12 text-accent",
  positive: "bg-positive/10 text-positive",
  negative: "bg-negative/10 text-negative",
  outline: "border border-line-strong text-fg-muted",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] leading-none font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
