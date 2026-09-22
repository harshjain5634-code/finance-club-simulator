"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("flex items-center gap-5 overflow-x-auto overflow-y-hidden border-b border-border px-(--panel-p)", className)} {...props} />;
}

export function TabsTrigger({ className, count, children, ...props }: ComponentProps<typeof RadixTabs.Trigger> & { count?: ReactNode }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "group relative -mb-px flex h-11 items-center gap-2 border-b-2 border-transparent px-1 text-[14px] whitespace-nowrap text-fg-muted transition-colors hover:text-fg-primary data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-fg-primary",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-xs bg-canvas-subtle px-1.5 py-0.5 text-caption leading-none font-medium text-fg-muted tabular-nums group-data-[state=active]:bg-accent-soft group-data-[state=active]:text-accent-text">{count}</span>
      )}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
