"use client";

import type { ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

type DialogContentProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
  tone?: "default" | "warning";
  className?: string;
  onOpenAutoFocus?: (event: Event) => void;
};

const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function DialogContent({ title, description, children, footer, size = "md", icon, tone = "default", className, onOpenAutoFocus }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <RadixDialog.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-dialog animate-pop-in focus:outline-none",
          widths[size],
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-3">
          {icon && (
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-md [&_svg]:size-5",
                tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-text",
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <RadixDialog.Title className="text-h2 font-semibold text-fg-primary">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-meta text-fg-secondary">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">Dialog</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close className="-mt-1 -mr-2 grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg-primary" aria-label="Close">
            <X className="size-4" />
          </RadixDialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">{footer}</footer>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

type DrawerContentProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
};

/** Right-hand side sheet for detail panels and editors. */
export function DrawerContent({ title, description, children, footer, width = "md" }: DrawerContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <RadixDialog.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-dialog animate-slide-in-right focus:outline-none",
          width === "md" ? "sm:max-w-lg" : "sm:max-w-2xl",
        )}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <RadixDialog.Title className="text-h2 font-semibold text-fg-primary">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-meta text-fg-secondary">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">Details panel</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close className="-mt-1 -mr-2 grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg-primary" aria-label="Close">
            <X className="size-4" />
          </RadixDialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">{footer}</footer>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
