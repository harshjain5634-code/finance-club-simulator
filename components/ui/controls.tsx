"use client";

import type { ReactNode } from "react";
import { Checkbox as RadixCheckbox, Switch as RadixSwitch, Tooltip as RadixTooltip } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label: string;
}) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full border border-border-strong bg-surface-hover transition-colors data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-45"
    >
      <RadixSwitch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-fg-secondary transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </RadixSwitch.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <RadixCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      disabled={disabled}
      aria-label={label}
      className="grid size-4 shrink-0 place-items-center rounded border border-border-strong bg-canvas transition-colors data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent-strong disabled:opacity-45"
    >
      <RadixCheckbox.Indicator>
        <Check className="size-3 text-white" strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RadixTooltip.Root delayDuration={250}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-[70] max-w-64 rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs text-fg-primary shadow-lg shadow-black/40 animate-fade-in",
          )}
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
