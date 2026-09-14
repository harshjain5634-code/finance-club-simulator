"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("flex items-center gap-1 overflow-x-auto border-b border-border px-4", className)} {...props} />;
}

export function TabsTrigger({ className, count, children, ...props }: ComponentProps<typeof RadixTabs.Trigger> & { count?: ReactNode }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px flex h-10 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg-primary data-[state=active]:border-accent data-[state=active]:text-fg-primary",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] leading-none text-fg-secondary tabular-nums">{count}</span>
      )}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
