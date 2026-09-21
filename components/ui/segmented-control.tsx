"use client";

import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = T | { value: T; label: string; disabled?: boolean; hint?: string };

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
};

export function SegmentedControl<T extends string>({ options, value, onChange, label, size = "sm", className }: SegmentedControlProps<T>) {
  return (
    // max-w-full + overflow-x-auto: long option sets stay reachable on narrow screens instead of being clipped.
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full items-center overflow-x-auto rounded-md border border-border bg-canvas p-0.5", className)}>
      {options.map((option) => {
        const item = typeof option === "string" ? { value: option, label: option, disabled: false, hint: undefined } : option;
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={item.disabled}
            title={item.hint}
            onClick={() => onChange(item.value)}
            className={cn(
              "shrink-0 rounded font-medium tabular-nums whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-6 min-w-8 px-2 text-[11px]" : "h-7 min-w-10 px-3 text-xs",
              selected
                ? "bg-surface-hover text-fg-primary shadow-[inset_0_0_0_1px_var(--color-border-strong)]"
                : "text-fg-muted hover:text-fg-primary",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
