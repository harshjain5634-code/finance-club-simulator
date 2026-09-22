"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { dismissToast, useToasts, type ToastTone } from "@/lib/toast";
import { cn } from "@/lib/utils";

const toneIcon: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: "bg-positive-soft text-positive" },
  error: { icon: CircleAlert, className: "bg-negative-soft text-negative" },
  warning: { icon: TriangleAlert, className: "bg-warning-soft text-warning" },
  info: { icon: Info, className: "bg-info-soft text-info" },
};

export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => {
        const { icon: Icon, className } = toneIcon[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-surface-raised py-3.5 pr-2.5 pl-3.5 shadow-popover animate-slide-in-bottom",
            )}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", className)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-5 font-medium text-fg-primary">{item.title}</p>
              {item.description && <p className="mt-0.5 text-meta text-fg-secondary">{item.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="-mt-0.5 -mr-1 grid size-6 place-items-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg-primary"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
