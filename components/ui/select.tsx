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
  // C4 shows the selected option's hint on the trigger too (e.g. "last ₹860.00", "#1 · online"),
  // so the useful detail is visible without opening the menu.
  const selected = options.find((option) => option.value === value);
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-label={rest["aria-label"]}
        className={cn(
          "inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 text-left text-[14px] text-fg-primary transition-colors hover:border-fg-disabled focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-fg-muted",
          size === "sm" ? "h-(--control-h-sm) text-[13px]" : "h-(--control-h)",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        {selected?.hint && <span className="ml-auto max-w-[45%] shrink-0 truncate text-caption text-fg-muted">{selected.hint}</span>}
        <RadixSelect.Icon>
          <ChevronDown className="size-4 text-fg-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-popover animate-fade-in"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-[14px] text-fg-primary outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-surface-hover data-[state=checked]:bg-accent-soft"
              >
                <div className="min-w-0">
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.hint && <div className="truncate text-caption text-fg-muted">{option.hint}</div>}
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
