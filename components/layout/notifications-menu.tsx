"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CircleCheck, Info, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppNotification, NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindIcon: Record<NotificationKind, LucideIcon> = {
  order: CircleCheck,
  competition: Trophy,
  alert: TrendingUp,
  system: Info,
};

export function NotificationsMenu({ notifications }: { notifications: AppNotification[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const unreadCount = items.filter((n) => n.unread).length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cn("relative", open && "bg-surface-hover text-fg")}
      >
        <Bell className="size-4" strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-canvas" aria-hidden />
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-lg border border-line-strong bg-surface-raised shadow-xl shadow-black/40"
        >
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-fg">
              Notifications
              {unreadCount > 0 && <span className="ml-1.5 text-fg-subtle tabular-nums">{unreadCount}</span>}
            </p>
            <button
              type="button"
              disabled={unreadCount === 0}
              onClick={() => setItems((current) => current.map((n) => ({ ...n, unread: false })))}
              className="rounded text-xs text-accent hover:text-fg disabled:cursor-default disabled:text-fg-subtle"
            >
              Mark all as read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto py-1">
            {items.map((item) => {
              const Icon = kindIcon[item.kind];
              return (
                <li key={item.id} className="mx-1 flex gap-3 rounded-md px-2.5 py-2.5 hover:bg-surface-hover">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-fg-muted">
                    <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px]", item.unread ? "font-medium text-fg" : "text-fg-muted")}>
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-fg-subtle">{item.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] text-fg-subtle">{item.timeLabel}</span>
                    {item.unread && <span className="size-1.5 rounded-full bg-accent" aria-label="Unread" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
