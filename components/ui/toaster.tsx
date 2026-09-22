"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { dismissToast, useToasts, type ToastTone } from "@/lib/toast";
import { cn } from "@/lib/utils";

const toneIcon: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: "text-accent-text" },
  error: { icon: CircleAlert, className: "text-warning" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  info: { icon: Info, className: "text-fg-secondary" },
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
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-raised px-3.5 py-3 shadow-xl shadow-black/40 animate-slide-in-right",
              item.tone === "error" || item.tone === "warning" ? "border-warning/40" : "border-border-strong",
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg-primary">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs leading-relaxed text-fg-secondary">{item.description}</p>}
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
