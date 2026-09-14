"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, X } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "@/components/ui/button";
import { isNavItemActive, primaryNav, secondaryNav, type NavItem } from "@/lib/navigation";
import type { CurrentUser } from "@/lib/types";
import { cn } from "@/lib/utils";

type SidebarProps = {
  user: CurrentUser;
  open: boolean;
  onClose: () => void;
};

export const SIDEBAR_WIDTH_CLASS = "lg:pl-60";

export function Sidebar({ user, open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface transition-[translate,visibility] duration-200 ease-out lg:visible lg:w-60 lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <Brand />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation" className="lg:hidden">
            <X className="size-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {primaryNav.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink item={item} active={isNavItemActive(pathname, item.href)} onNavigate={onClose} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line px-3 py-3">
          <ul className="space-y-0.5">
            {secondaryNav.map((item) => (
              <li key={item.href}>
                <SidebarLink item={item} active={isNavItemActive(pathname, item.href)} onNavigate={onClose} />
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="mt-3 flex w-full items-center gap-2.5 rounded-md border border-line bg-surface-raised px-2.5 py-2 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
              {user.initials}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-fg">{user.name}</span>
              <span className="block truncate text-[11px] text-fg-subtle">{user.role}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
        active ? "bg-surface-hover font-medium text-fg" : "text-fg-muted hover:bg-surface-hover/70 hover:text-fg",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r bg-accent" />}
      <Icon
        aria-hidden
        className={cn("size-4 shrink-0", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")}
        strokeWidth={1.75}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] leading-none font-medium text-accent">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
