"use client";

import { cn } from "@/lib/utils";

type SegmentedControlProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center rounded-md border border-line bg-canvas p-0.5", className)}
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              "h-6 min-w-8 rounded px-2 text-[11px] font-medium tabular-nums transition-colors duration-150",
              selected
                ? "bg-surface-hover text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
