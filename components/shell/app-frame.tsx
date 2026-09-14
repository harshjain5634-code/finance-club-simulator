"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActive, type NavGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppFrameProps = {
  label: string;
  nav: NavGroup[];
  badges?: Record<string, number>;
  sidebarHeader: ReactNode;
  sidebarFooter?: ReactNode;
  topBar: (controls: { openNav: () => void; navOpen: boolean }) => ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  variant?: "terminal" | "console";
};

/** Shared shell: fixed sidebar on desktop, slide-out drawer below 1024px, sticky top bar. */
export function AppFrame({ label, nav, badges = {}, sidebarHeader, sidebarFooter, topBar, banner, children, variant = "terminal" }: AppFrameProps) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  const close = () => setNavOpen(false);

  return (
    <div className="min-h-dvh bg-canvas">
      <div
        aria-hidden
        onClick={close}
        className={cn("fixed inset-0 z-40 bg-overlay transition-opacity duration-200 lg:hidden", navOpen ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        id="app-sidebar"
        aria-label={label}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border transition-[translate,visibility] duration-200 ease-out lg:visible lg:w-60 lg:translate-x-0",
          variant === "console" ? "bg-surface" : "bg-surface",
          navOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
          {sidebarHeader}
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close navigation" className="lg:hidden">
            <X className="size-4" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {nav.map((group, index) => (
            <div key={group.label ?? index} className="mb-4 last:mb-0">
              {group.label && <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">{group.label}</p>}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                          active ? "bg-surface-hover font-medium text-fg-primary" : "text-fg-secondary hover:bg-surface-hover/70 hover:text-fg-primary",
                        )}
                      >
                        {active && <span aria-hidden className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r bg-accent" />}
                        <Icon aria-hidden strokeWidth={1.75} className={cn("size-4 shrink-0", active ? "text-accent" : "text-fg-muted group-hover:text-fg-secondary")} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span className="min-w-5 rounded bg-accent-strong px-1.5 py-0.5 text-center text-[10px] leading-none font-semibold text-white tabular-nums">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {sidebarFooter && <div className="shrink-0 border-t border-border px-3 py-3">{sidebarFooter}</div>}
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-border bg-canvas/92 backdrop-blur-md">{topBar({ openNav: () => setNavOpen(true), navOpen })}</header>
        {banner}
        <main className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">{children}</main>
      </div>
    </div>
  );
}
