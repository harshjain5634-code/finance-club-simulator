"use client";

import type { ReactNode } from "react";
import { Select as RadixSelect } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean };

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
};

/** Radix Select: keyboard accessible, portal-rendered, styled with our tokens. */
export function Select({ value, onValueChange, options, placeholder = "Select…", id, disabled, className, size = "md", ...rest }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-label={rest["aria-label"]}
        className={cn(
          "inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-canvas px-2.5 text-left text-[13px] text-fg-primary transition-colors hover:border-border-strong focus-visible:border-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-fg-muted",
          size === "sm" ? "h-7 text-xs" : "h-8",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon>
          <ChevronDown className="size-3.5 text-fg-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-xl shadow-black/40 animate-fade-in"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-[13px] text-fg-primary outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-surface-hover"
              >
                <div className="min-w-0">
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.hint && <div className="truncate text-[11px] text-fg-muted">{option.hint}</div>}
                </div>
                <RadixSelect.ItemIndicator className="absolute right-2.5">
                  <Check className="size-3.5 text-accent-text" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
