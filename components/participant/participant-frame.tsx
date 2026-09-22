"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as RadixDialog } from "radix-ui";
import { ChartCandlestick, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, BriefcaseBusiness, X } from "lucide-react";
import { Button, ButtonKbd } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { BrandMark } from "@/components/shell/brand";
import { MarketStateBadge } from "@/components/market/status";
import { useRoundClock } from "@/components/market/round-clock";
import { formatDuration } from "@/lib/format";
import { isActive, participantNav, participantTitle, type NavItem } from "@/lib/navigation";
import type { EventState, MarketState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type FrameProps = {
  state: EventState;
  code: string;
  teamName: string;
  teamMeta: string;
  rankLabel: string | null;
  badges: Record<string, number>;
  onSignOut: () => void;
  search: ReactNode;
  actions: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
};

/** What the status area says for each market state (participant copy, C4 section 05 / 20). */
export function participantStatus(marketState: MarketState): { headline: string; tone: "live" | "warning" | "idle" } {
  switch (marketState) {
    case "OPEN":
      return { headline: "You can trade now", tone: "live" };
    case "FROZEN":
      return { headline: "Trading frozen · the round clock keeps running", tone: "warning" };
    case "PAUSED":
      return { headline: "Event paused · clock stopped", tone: "warning" };
    case "BRIEFING":
      return { headline: "Briefing · trading opens next round", tone: "idle" };
    case "BETWEEN_ROUNDS":
      return { headline: "Round over · waiting for the next round", tone: "idle" };
    case "COMPLETED":
      return { headline: "Event complete · final standings", tone: "idle" };
    default:
      return { headline: "The event starts soon", tone: "idle" };
  }
}

function roundLine(state: EventState, round: ReturnType<typeof useRoundClock>["round"]) {
  if (!round) return state.event.name;
  const total = state.rounds.filter((r) => r.type === "TRADING").length;
  return round.type === "BRIEFING" ? `Briefing · ${round.name}` : `Round ${round.number}${total ? ` of ${total}` : ""} · ${round.name}`;
}

/** Topbar status block: badge, plain-language state, round line and a live clock with progress. */
function StatusBlock({ state }: { state: EventState }) {
  const { round, remaining, elapsedPct, active, marketState } = useRoundClock(state);
  const { headline } = participantStatus(marketState);
  const urgent = active && round?.status === "RUNNING" && remaining <= 60_000;
  return (
    <div className="flex min-w-0 items-center gap-4">
      <MarketStateBadge state={marketState} />
      <div className="hidden min-w-0 leading-tight xl:block">
        <p className="truncate text-[14px] font-medium text-fg-primary">{headline}</p>
        <p className="truncate text-caption text-fg-muted">{roundLine(state, round)}</p>
      </div>
      {active && (
        <div className="w-16 shrink-0" aria-label="Time left in round">
          <p className={cn("font-mono text-[18px] leading-6 font-medium tabular-nums", urgent ? "text-warning" : "text-fg-primary")}>{formatDuration(remaining)}</p>
          <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-canvas-subtle">
            <div className={cn("h-full", marketState === "FROZEN" || marketState === "PAUSED" ? "bg-warning" : "bg-accent")} style={{ width: `${elapsedPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function MobileStatusChip({ state }: { state: EventState }) {
  const { remaining, active, marketState } = useRoundClock(state);
  const short: Record<MarketState, string> = { OPEN: "Open", FROZEN: "Frozen", PAUSED: "Paused", BRIEFING: "Briefing", BETWEEN_ROUNDS: "Break", NOT_STARTED: "Soon", COMPLETED: "Done" };
  const warning = marketState === "FROZEN" || marketState === "PAUSED";
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium",
        warning ? "bg-warning-soft text-warning" : marketState === "OPEN" ? "bg-accent-soft text-accent-text" : "bg-canvas-subtle text-fg-secondary",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full bg-current", marketState === "OPEN" && "animate-pulse-dot")} />
      {short[marketState]}
      {active && <span className="font-mono text-[15px] font-medium text-fg-primary tabular-nums">{formatDuration(remaining)}</span>}
    </span>
  );
}

function NavLink({ item, active, badge, onNavigate }: { item: NavItem; active: boolean; badge: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  const alert = item.badgeKey === "incoming";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-md px-3 text-[15px] transition-colors duration-150",
        active ? "bg-surface-selected font-medium text-fg-primary" : "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary",
      )}
    >
      <Icon aria-hidden strokeWidth={1.75} className={cn("size-5 shrink-0", active ? "text-accent-text" : "text-fg-muted group-hover:text-fg-secondary")} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-xs px-1 text-caption leading-none font-medium tabular-nums",
            alert ? "bg-accent text-accent-fg" : "border border-border bg-canvas-subtle text-fg-secondary",
          )}
        >
          {badge}
          <span className="sr-only">{alert ? " waiting for you" : " unread"}</span>
        </span>
      )}
    </Link>
  );
}

function SidebarContents({ state, code, teamName, teamMeta, badges, onSignOut, onNavigate }: Pick<FrameProps, "state" | "code" | "teamName" | "teamMeta" | "badges" | "onSignOut"> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = participantNav(code);
  return (
    <>
      <div className="flex items-center gap-3 px-2 pt-5 pb-5">
        <BrandMark className="size-8 rounded-md" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-medium text-fg-primary">Finance Club</span>
          <span className="block truncate text-caption text-fg-muted">{state.event.name}</span>
        </span>
      </div>
      <Link href={`/event/${code}/trade`} onClick={onNavigate} className="mb-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[14px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover" aria-keyshortcuts="T">
        <Plus className="size-4" aria-hidden />
        New trade
        <ButtonKbd variant="primary">T</ButtonKbd>
      </Link>
      <nav aria-label="Team terminal" className="flex-1 overflow-y-auto">
        {groups.map((group, index) => (
          <ul key={group.label ?? index} className={cn("space-y-0.5", index > 0 && "mt-3 border-t border-border pt-3")}>
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item)} badge={item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        ))}
      </nav>
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-canvas-subtle px-3 py-3">
        <Avatar name={teamName} tone="accent" size="md" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-medium text-fg-primary">{teamName}</span>
          <span className="block truncate text-caption text-fg-muted">{teamMeta}</span>
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onSignOut} aria-label="Sign out of this team">
          <LogOut className="size-4" />
        </Button>
      </div>
    </>
  );
}

/**
 * C4 participant shell (sections 05 and 06). ≥1024px: fixed 240px sidebar with the New trade call to action.
 * 768–1023px: the same sidebar as a drawer. <768px: a real phone layout with a compact header and a bottom
 * tab bar (Home · Markets · Trade · Portfolio · More) instead of a squeezed desktop.
 */
export function ParticipantFrame({ state, code, teamName, teamMeta, rankLabel, badges, onSignOut, search, actions, banner, children }: FrameProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const title = participantTitle(pathname, code);
  const onDashboard = pathname.endsWith("/dashboard");
  const base = `/event/${code}`;

  // "T" opens a new trade from anywhere except text fields.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=dialog]"))) return;
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        router.push(`${base}/trade`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, base]);

  const tabs = [
    { label: "Home", href: `${base}/dashboard`, icon: LayoutDashboard },
    { label: "Markets", href: `${base}/markets`, icon: ChartCandlestick },
    { label: "Portfolio", href: `${base}/portfolio`, icon: BriefcaseBusiness },
  ];
  const moreItems = participantNav(code)
    .flatMap((g) => g.items)
    .filter((i) => !["dashboard", "markets", "portfolio", "trade"].some((k) => i.href.endsWith(`/${k}`)));
  const moreBadge = moreItems.reduce((sum, i) => sum + (i.badgeKey ? (badges[i.badgeKey] ?? 0) : 0), 0);

  return (
    <div className="min-h-dvh bg-canvas" data-density="comfortable">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent-fg"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside aria-label="Team terminal navigation" className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface px-3 pb-3 lg:flex">
        <SidebarContents state={state} code={code} teamName={teamName} teamMeta={teamMeta} badges={badges} onSignOut={onSignOut} />
      </aside>

      {/* Tablet drawer */}
      <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in lg:hidden" />
          <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface px-3 pb-3 shadow-dialog animate-slide-in-right focus:outline-none lg:hidden">
            <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">Team terminal pages</RadixDialog.Description>
            <RadixDialog.Close className="absolute top-5 right-3 grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover" aria-label="Close navigation">
              <X className="size-4" />
            </RadixDialog.Close>
            <SidebarContents state={state} code={code} teamName={teamName} teamMeta={teamMeta} badges={badges} onSignOut={onSignOut} onNavigate={() => setDrawerOpen(false)} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <div className="lg:pl-60">
        {/* Desktop / tablet topbar */}
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-border bg-surface px-6 md:flex">
          <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" className="-ml-2 lg:hidden">
            <Menu className="size-5" />
          </Button>
          <p className="shrink-0 text-h2 font-semibold text-fg-primary">{title}</p>
          {!onDashboard && (
            <>
              <span aria-hidden className="h-6 w-px bg-border" />
              <StatusBlock state={state} />
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="w-56 xl:w-72">{search}</div>
            {actions}
          </div>
        </header>

        {/* Phone header */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5 md:hidden">
          <Avatar name={teamName} tone="accent" size="md" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-h2 font-semibold text-fg-primary">{title === "Dashboard" ? "Home" : title}</p>
            <p className="truncate text-caption text-fg-muted">
              {teamName}
              {rankLabel ? ` · Rank ${rankLabel}` : ""}
            </p>
          </div>
          <MobileStatusChip state={state} />
        </header>

        {banner}
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1600px] px-4 pt-4 pb-24 focus:outline-none md:px-6 md:py-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid h-16 grid-cols-5 items-center">
          {tabs.slice(0, 2).map((tab) => (
            <TabLink key={tab.href} {...tab} active={pathname.startsWith(tab.href)} />
          ))}
          <li className="grid place-items-center">
            <Link
              href={`${base}/trade`}
              aria-current={pathname.startsWith(`${base}/trade`) ? "page" : undefined}
              className="relative flex flex-col items-center gap-1 text-caption font-medium text-accent-text"
            >
              <span className="grid h-8 w-11 place-items-center rounded-md bg-accent text-accent-fg">
                <Plus className="size-5" aria-hidden />
              </span>
              Trade
              {(badges.incoming ?? 0) > 0 && (
                <span className="absolute -top-1.5 right-0 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg ring-2 ring-surface">
                  {badges.incoming}
                  <span className="sr-only"> proposals waiting</span>
                </span>
              )}
            </Link>
          </li>
          <TabLink {...tabs[2]} active={pathname.startsWith(tabs[2].href)} />
          <li className="grid place-items-center">
            <button type="button" onClick={() => setMoreOpen(true)} className="relative flex flex-col items-center gap-1 text-caption text-fg-muted">
              <span className="grid h-8 w-11 place-items-center rounded-md">
                <MoreHorizontal className="size-5" aria-hidden />
              </span>
              More
              {moreBadge > 0 && <span aria-label={`${moreBadge} new`} className="absolute top-0 right-2 size-2 rounded-full bg-accent" />}
            </button>
          </li>
        </ul>
      </nav>

      <RadixDialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
          <RadixDialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-border bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-dialog animate-slide-in-bottom focus:outline-none">
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
            <RadixDialog.Title className="px-1 text-h2 font-semibold text-fg-primary">More</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">Other pages and account actions</RadixDialog.Description>
            <ul className="mt-2 space-y-0.5">
              {moreItems.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(pathname, item)} badge={item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0} onNavigate={() => setMoreOpen(false)} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              {actions}
              <Button variant="ghost" className="ml-auto" onClick={onSignOut}>
                <LogOut /> Sign out
              </Button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </div>
  );
}

function TabLink({ label, href, icon: Icon, active }: { label: string; href: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <li className="grid place-items-center">
      <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 text-caption", active ? "font-medium text-accent-text" : "text-fg-muted")}>
        <span className={cn("grid h-8 w-11 place-items-center rounded-md", active && "bg-accent-soft")}>
          <Icon className="size-5" aria-hidden strokeWidth={1.75} />
        </span>
        {label}
      </Link>
    </li>
  );
}
