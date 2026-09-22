"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Dialog as RadixDialog, DropdownMenu } from "radix-ui";
import {
  ArrowLeft,
  CirclePause,
  CirclePlay,
  Command,
  ExternalLink,
  Flag,
  Keyboard,
  Menu,
  MoreHorizontal,
  Radio,
  SkipForward,
  Snowflake,
  Square,
  X,
  Zap,
} from "lucide-react";
import { BrandMark } from "@/components/shell/brand";
import { Button, buttonClasses } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/controls";
import { Avatar, EmptyState, Kbd, Skeleton } from "@/components/ui/misc";
import { MarketStateBadge } from "@/components/market/status";
import { useRoundClock } from "@/components/market/round-clock";
import { RoundTrack } from "@/components/market/round-track";
import { nextPendingRound, readiness } from "@/lib/domain/lifecycle";
import { activeTakeover, resolveProjectorScene, SCENE_LABEL } from "@/lib/domain/projector";
import type { EventState } from "@/lib/domain/types";
import { formatClock, formatDuration, formatMinutes } from "@/lib/format";
import { hostRailNav, isActive, type NavGroup } from "@/lib/navigation";
import { useEventById } from "@/lib/mock/hooks";
import { useOnlineTeams } from "@/lib/mock/runtime";
import { HOST_NAME } from "@/lib/mock/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { hostBase, HostEventContext } from "./host-context";
import { HostCommandsProvider, useHostCommands, type HostCommandId } from "./host-commands";
import { CommandPalette, GOTO_KEYS, ShortcutsSheet } from "./host-palette";

/**
 * C4 host shell (section 13): a 64px icon rail (LIVE / OPS / SETUP), the Live Control Strip that is always on top,
 * the workspace, and a shortcut bar. Keyboard: N release next · F freeze · P pause · E end round · G+key go to ·
 * ⌘K palette · ? shortcuts. Shortcuts never fire while typing or while a dialog is open.
 */
export function HostEventShell({ children }: { children: ReactNode }) {
  const params = useParams<{ eventId: string }>();
  const eventId = decodeURIComponent(params.eventId);
  const state = useEventById(eventId);

  if (state === null) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-16 border-r border-border lg:block" />
        <div className="flex-1 space-y-3 px-4 py-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (state === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <EmptyState
          title="Event not found"
          description={`There is no event with id "${eventId}" in this browser.`}
          action={
            <Link href="/host" className={buttonClasses({ variant: "secondary" })}>
              <ArrowLeft className="size-3.5" />
              All events
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <HostEventContext.Provider value={eventId}>
      <HostCommandsProvider state={state}>
        <HostFrame state={state}>{children}</HostFrame>
      </HostCommandsProvider>
    </HostEventContext.Provider>
  );
}

function HostFrame({ state, children }: { state: EventState; children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const nav = hostRailNav(state.event.id);
  const badges = { approvals: state.proposals.filter((p) => p.status === "PENDING_APPROVAL").length };
  useHostShortcuts({ state, openPalette: () => setPaletteOpen((o) => !o), openHelp: () => setHelpOpen(true) });

  return (
    <div className="min-h-dvh bg-canvas lg:pl-16">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent-fg"
      >
        Skip to main content
      </a>
      <HostRail nav={nav} badges={badges} onHelp={() => setHelpOpen(true)} />
      <div className="flex min-h-dvh flex-col">
        <MobileHeader state={state} nav={nav} badges={badges} open={navOpen} onOpenChange={setNavOpen} onPalette={() => setPaletteOpen(true)} />
        <LiveControlStrip state={state} onPalette={() => setPaletteOpen(true)} />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-4 focus:outline-none">
          {children}
        </main>
        <ShortcutBar onHelp={() => setHelpOpen(true)} onPalette={() => setPaletteOpen(true)} />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------ rail */

function HostRail({ nav, badges, onHelp }: { nav: NavGroup[]; badges: Record<string, number>; onHelp: () => void }) {
  const pathname = usePathname();
  return (
    <aside aria-label="Host console navigation" className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center border-r border-border bg-surface py-3 lg:flex">
      <Tooltip content="All events" side="right">
        <Link href="/host" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="All events">
          <BrandMark className="size-9 rounded-md" />
        </Link>
      </Tooltip>
      <nav className="mt-1 flex flex-1 flex-col items-center overflow-y-auto">
        {nav.map((group) => (
          <div key={group.label} className="flex flex-col items-center pt-3">
            <p className="pb-1.5 text-[10px] leading-4 font-semibold tracking-[0.08em] text-fg-muted uppercase">{group.label}</p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                const badge = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                return (
                  <li key={item.href}>
                    <Tooltip content={badge ? `${item.label} · ${badge} waiting` : item.label} side="right">
                      <Link
                        href={item.href.endsWith("/setup") ? `${item.href}/general` : item.href}
                        aria-label={badge ? `${item.label}, ${badge} waiting` : item.label}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative grid size-10 place-items-center rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                          active ? "bg-accent-soft text-accent-text" : "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary",
                        )}
                      >
                        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                        {badge > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 font-mono text-[10px] leading-none font-semibold text-warning-fg">{badge}</span>
                        )}
                      </Link>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-3 pt-2">
        <Tooltip content="Keyboard shortcuts (?)" side="right">
          <button type="button" onClick={onHelp} aria-label="Keyboard shortcuts" className="grid size-10 place-items-center rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg-primary">
            <Keyboard className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content={`${HOST_NAME} · event owner`} side="right">
          <span>
            <Avatar name={HOST_NAME} tone="accent" />
          </span>
        </Tooltip>
      </div>
    </aside>
  );
}

function MobileHeader({
  state,
  nav,
  badges,
  open,
  onOpenChange,
  onPalette,
}: {
  state: EventState;
  nav: NavGroup[];
  badges: Record<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPalette: () => void;
}) {
  const pathname = usePathname();
  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-surface px-3 lg:hidden">
      <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
        <RadixDialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-4" />
          </Button>
        </RadixDialog.Trigger>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
          <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-surface p-3 shadow-dialog focus:outline-none">
            <div className="flex items-center justify-between px-1 pb-2">
              <RadixDialog.Title className="text-h3 font-semibold text-fg-primary">Host console</RadixDialog.Title>
              <RadixDialog.Close className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover" aria-label="Close navigation">
                <X className="size-4" />
              </RadixDialog.Close>
            </div>
            <RadixDialog.Description className="sr-only">Pages in the host console</RadixDialog.Description>
            <nav className="flex-1 overflow-y-auto">
              {nav.map((group) => (
                <div key={group.label} className="pt-3">
                  <p className="eyebrow px-2 pb-1">{group.label}</p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item);
                    const badge = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href.endsWith("/setup") ? `${item.href}/general` : item.href}
                        onClick={() => onOpenChange(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex h-10 items-center gap-3 rounded-md px-2 text-[14px]", active ? "bg-accent-soft font-medium text-accent-text" : "text-fg-secondary hover:bg-surface-hover")}
                      >
                        <Icon className="size-4" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && <span className="rounded-full bg-warning px-1.5 font-mono text-caption text-warning-fg">{badge}</span>}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <Link href="/host" className="flex h-10 items-center gap-2 rounded-md px-2 text-[14px] text-fg-secondary hover:bg-surface-hover">
              <ArrowLeft className="size-4" /> All events
            </Link>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
      <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg-primary">{state.event.name}</p>
      <Button variant="ghost" size="icon" onClick={onPalette} aria-label="Open command palette">
        <Command className="size-4" />
      </Button>
    </header>
  );
}

/* ------------------------------------------------------------------ live control strip */

function LiveControlStrip({ state, onPalette }: { state: EventState; onPalette: () => void }) {
  const { event } = state;
  const setup = event.status === "DRAFT" || event.status === "READY";
  return (
    <section
      aria-label="Live controls"
      className={cn(
        "top-0 z-30 border-b bg-surface lg:sticky",
        event.tradingFrozen ? "border-warning/60 shadow-[inset_0_-2px_0_var(--color-warning)]" : "border-border",
      )}
    >
      <div className="mx-auto flex min-h-28 max-w-[1760px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 xl:flex-nowrap">
        {setup ? <SetupStatus state={state} /> : <ClockBlock state={state} />}
        <Divider />
        <TrackBlock state={state} />
        <Divider />
        <ProjectorBlock state={state} />
        <div className="w-full sm:ml-auto sm:w-auto">
          <StripActions state={state} onPalette={onPalette} />
        </div>
      </div>
    </section>
  );
}

function Divider() {
  return <span aria-hidden className="hidden h-16 w-px shrink-0 bg-border xl:block" />;
}

function ClockBlock({ state }: { state: EventState }) {
  const { round, remaining, active } = useRoundClock(state);
  const { event } = state;
  const trading = state.rounds.filter((r) => r.type !== "BRIEFING").length;
  const upcoming = nextPendingRound(state);
  const paused = round?.status === "PAUSED" || event.status === "PAUSED";
  const urgent = active && round?.status === "RUNNING" && remaining <= 60_000;

  let caption: string;
  let clock: string;
  let sub: string;
  if (event.status === "COMPLETED") {
    caption = "Event complete";
    clock = "--:--";
    sub = event.endedAt ? `Ended ${formatClock(event.endedAt)} · final results published` : "Final results published";
  } else if (active && round) {
    caption = round.type === "BRIEFING" ? `Briefing · ${round.name}` : `Round ${round.number} of ${trading} · ${round.name}`;
    clock = formatDuration(remaining);
    const total = round.durationSeconds * 1000;
    sub = `left of ${formatMinutes(round.durationSeconds)} · elapsed ${formatDuration(Math.max(0, total - remaining))}${round.endsAt && !paused ? ` · ends ${formatClock(round.endsAt)}` : " · clock held"}`;
  } else if (upcoming) {
    caption = `Between rounds · next ${upcoming.type === "BRIEFING" ? "briefing" : `Round ${upcoming.number}`}`;
    clock = formatDuration(upcoming.durationSeconds * 1000);
    sub = `${upcoming.name} · waiting for you to start`;
  } else {
    caption = "All rounds finished";
    clock = "--:--";
    sub = "End the event to publish final results";
  }

  return (
    <div className="w-[236px] shrink-0">
      <p className={cn("truncate text-[13px] font-medium", paused ? "text-warning" : "text-fg-secondary")}>{paused ? `${caption} · paused` : caption}</p>
      <p
        className={cn(
          "font-mono text-[44px] leading-[52px] font-medium tracking-[-0.02em] tabular-nums",
          !active ? "text-fg-muted" : paused || urgent ? "text-warning" : "text-fg-primary",
        )}
        role="timer"
        aria-label={active ? `${clock} left in the round` : caption}
      >
        {clock}
      </p>
      <p className="truncate text-caption text-fg-muted tabular-nums">{sub}</p>
    </div>
  );
}

function SetupStatus({ state }: { state: EventState }) {
  const items = readiness(state);
  const done = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done);
  return (
    <div className="w-[236px] shrink-0">
      <p className="text-[13px] font-medium text-fg-secondary">Setup · not started</p>
      <p className="font-mono text-[44px] leading-[52px] font-medium tracking-[-0.02em] text-fg-primary tabular-nums">
        {done}/{items.length}
      </p>
      <p className="truncate text-caption text-fg-muted">{next ? `Next: ${next.label.toLowerCase()}` : "Ready to start"}</p>
    </div>
  );
}

function TrackBlock({ state }: { state: EventState }) {
  const { marketState } = useRoundClock(state);
  const online = useOnlineTeams(state.event.id);
  const open = state.proposals.filter((p) => p.status === "PROPOSED").length;
  const approvals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL").length;
  const frozen = state.event.tradingFrozen;
  return (
    <div className="min-w-[280px] flex-1 xl:max-w-[420px]">
      <RoundTrack state={state} variant="host" />
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <MarketStateBadge state={marketState} />
        {frozen ? (
          <span className="text-caption font-medium text-warning">Round clock continues</span>
        ) : (
          <span className="text-caption text-fg-muted">
            <span className="font-mono text-fg-secondary">
              {online.size}/{state.teams.length}
            </span>{" "}
            online · <span className="font-mono text-fg-secondary">{open}</span> open ·{" "}
            <span className={cn("font-mono", approvals ? "text-warning" : "text-fg-secondary")}>{approvals}</span> to approve
          </span>
        )}
      </div>
    </div>
  );
}

function ProjectorBlock({ state }: { state: EventState }) {
  const { now } = useRoundClock(state);
  const resolution = resolveProjectorScene(state, now);
  const takeover = activeTakeover(state, now);
  const { event } = state;
  const href = `/event/${event.code}/projector?key=${event.projector.projectorKey}`;
  const onAir = takeover ? (takeover.kind === "NEWS" ? "Breaking news" : "Message") : SCENE_LABEL[resolution.scene];
  const detail = takeover
    ? takeover.remainingMs !== null
      ? `overlay · ${formatDuration(takeover.remainingMs)} left`
      : "overlay · until cleared"
    : resolution.source === "PINNED"
      ? "held · rotation off"
      : resolution.nextScene
        ? `next ${SCENE_LABEL[resolution.nextScene]} ${resolution.sceneRemainingMs !== null ? formatDuration(resolution.sceneRemainingMs) : ""}`
        : "";
  return (
    <div className="w-[200px] shrink-0">
      <div className="flex items-center justify-between">
        <Link href={`${hostBase(event.id)}/display`} className="text-[13px] font-medium text-fg-secondary hover:text-fg-primary">
          Projector
        </Link>
        <Tooltip content="Open the projector in a new tab">
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Open projector in a new tab" className="grid size-6 place-items-center rounded-xs text-fg-muted hover:bg-surface-hover hover:text-fg-primary">
            <ExternalLink className="size-3.5" />
          </a>
        </Tooltip>
      </div>
      <span className={cn("mt-1.5 inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 text-caption font-semibold", takeover ? "bg-warning text-warning-fg" : "bg-accent text-accent-fg")}>
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {takeover ? "Overlay on air" : "On air"}
      </span>
      <p className="mt-1.5 truncate text-caption text-fg-primary">
        {onAir}
        {detail && <span className="font-mono text-fg-muted"> · {detail}</span>}
      </p>
    </div>
  );
}

function StripActions({ state, onPalette }: { state: EventState; onPalette: () => void }) {
  const { available, run, commands } = useHostCommands();
  const { event } = state;
  const setup = event.status === "DRAFT" || event.status === "READY";
  const label = (id: HostCommandId) => commands.find((c) => c.id === id)?.label ?? "";

  if (event.status === "COMPLETED") {
    return (
      <Link href={`${hostBase(event.id)}/leaderboard`} className={buttonClasses({ variant: "secondary" })}>
        View final results
      </Link>
    );
  }

  if (setup) {
    const blockers = readiness(state).filter((i) => !i.done && i.id !== "news" && i.id !== "projector");
    return (
      <div className="flex items-center gap-2">
        <Link href={`${hostBase(event.id)}/setup/general`} className={buttonClasses({ variant: "secondary" })}>
          Continue setup
        </Link>
        <Tooltip content={blockers.length ? `Finish first: ${blockers.map((b) => b.label.toLowerCase()).join(", ")}` : "Go live for every team"}>
          <span>
            <Button variant="primary" onClick={() => run("startEvent")} disabled={!available("startEvent")}>
              <CirclePlay className="size-4" />
              Start event
            </Button>
          </span>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 max-sm:[&>button]:w-full max-sm:[&>div:first-of-type>button]:w-full max-sm:[&_kbd]:hidden sm:grid-cols-[auto_auto]">
      <Button variant="primary" shortcut="N" onClick={() => run("releaseNext")} disabled={!available("releaseNext")} title={available("releaseNext") ? undefined : "No story is ready to release"}>
        <Zap className="size-4" />
        Release next story
      </Button>
      {event.tradingFrozen ? (
        <Button variant="warning" shortcut="F" onClick={() => run("unfreeze")} disabled={!available("unfreeze")}>
          <Snowflake className="size-4" />
          Unfreeze trading
        </Button>
      ) : (
        <Button variant="warning-outline" shortcut="F" onClick={() => run("freeze")} disabled={!available("freeze")}>
          <Snowflake className="size-4" />
          Freeze trading
        </Button>
      )}
      <div className="flex gap-2">
        {available("resumeEvent") ? (
          <Button variant="primary" shortcut="P" onClick={() => run("resumeEvent")}>
            <CirclePlay className="size-4" />
            Resume event
          </Button>
        ) : available("startRound") ? (
          <Button variant="primary" onClick={() => run("startRound")}>
            <CirclePlay className="size-4" />
            {label("startRound")}
          </Button>
        ) : available("resumeRound") ? (
          <Button variant="primary" shortcut="P" onClick={() => run("resumeRound")}>
            <CirclePlay className="size-4" />
            Resume
          </Button>
        ) : (
          <Button variant="secondary" shortcut="P" onClick={() => run("pauseRound")} disabled={!available("pauseRound")}>
            <CirclePause className="size-4" />
            Pause
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" shortcut="E" onClick={() => run("endRound")} disabled={!available("endRound")} className="flex-1">
          <Square className="size-4" />
          End round…
        </Button>
        <MoreMenu onPalette={onPalette} />
      </div>
    </div>
  );
}

function MoreMenu({ onPalette }: { onPalette: () => void }) {
  const { available, run, commands } = useHostCommands();
  const items: { id: HostCommandId; icon: ReactNode }[] = [
    { id: "nextRound", icon: <SkipForward className="size-4" /> },
    { id: "pauseEvent", icon: <CirclePause className="size-4" /> },
    { id: "projectorBreaking", icon: <Radio className="size-4" /> },
    { id: "projectorClear", icon: <X className="size-4" /> },
    { id: "endEvent", icon: <Flag className="size-4" /> },
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="icon" aria-label="More event actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-72 animate-fade-in rounded-lg border border-border-strong bg-surface-raised p-1 shadow-popover">
          {items
            .filter((i) => available(i.id))
            .map((i) => {
              const c = commands.find((x) => x.id === i.id)!;
              return (
                <DropdownMenu.Item
                  key={i.id}
                  onSelect={() => run(i.id)}
                  className={cn("flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 outline-none data-highlighted:bg-surface-hover", c.tone === "warning" ? "text-warning" : "text-fg-primary")}
                >
                  <span className="mt-0.5">{i.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{c.label}</span>
                    <span className="block truncate text-caption text-fg-muted">{c.hint}</span>
                  </span>
                </DropdownMenu.Item>
              );
            })}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={onPalette} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] text-fg-primary outline-none data-highlighted:bg-surface-hover">
            <Command className="size-4" />
            <span className="flex-1">All commands</span>
            <Kbd>⌘K</Kbd>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ------------------------------------------------------------------ shortcuts */

function ShortcutBar({ onHelp, onPalette }: { onHelp: () => void; onPalette: () => void }) {
  const hint = (keys: string[], label: string) => (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {keys.map((k) => (
        <Kbd key={k} className="h-5 min-w-5 px-1 text-[11px]">
          {k}
        </Kbd>
      ))}
      {label}
    </span>
  );
  return (
    <footer className="sticky bottom-0 z-20 hidden h-8 items-center gap-5 overflow-hidden border-t border-border bg-surface px-4 text-caption text-fg-muted lg:flex" aria-label="Keyboard shortcuts">
      {hint(["N"], "release next")}
      {hint(["F"], "freeze")}
      {hint(["P"], "pause")}
      {hint(["E"], "end round")}
      {hint(["G", "N"], "news desk")}
      {hint(["G", "T"], "trades")}
      {hint(["G", "P"], "projector")}
      {hint(["G", "L"], "leaderboard")}
      <button type="button" onClick={onPalette} className="hover:text-fg-primary">
        {hint(["⌘", "K"], "commands")}
      </button>
      <button type="button" onClick={onHelp} className="hover:text-fg-primary">
        {hint(["?"], "all shortcuts")}
      </button>
    </footer>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function useHostShortcuts({ state, openPalette, openHelp }: { state: EventState; openPalette: () => void; openHelp: () => void }) {
  const router = useRouter();
  const { available, run } = useHostCommands();
  const goPending = useRef(0);
  const latest = useRef({ available, run, openPalette, openHelp, base: hostBase(state.event.id) });
  useEffect(() => {
    latest.current = { available, run, openPalette, openHelp, base: hostBase(state.event.id) };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { available, run, openPalette, openHelp, base } = latest.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      const key = e.key.toLowerCase();

      if (Date.now() - goPending.current < 1500) {
        goPending.current = 0;
        e.preventDefault();
        const target = GOTO_KEYS[key];
        if (target) router.push(`${base}${target.path}`);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openHelp();
        return;
      }
      if (e.shiftKey) return;
      const tryRun = (ids: HostCommandId[], unavailable: string) => {
        e.preventDefault();
        const id = ids.find((i) => available(i));
        if (id) run(id);
        else toast.info(unavailable);
      };
      switch (key) {
        case "g":
          goPending.current = Date.now();
          return;
        case "n":
          return tryRun(["releaseNext"], "No story is ready to release");
        case "f":
          return tryRun(["freeze", "unfreeze"], "Trading can only be frozen while the event is live");
        case "p":
          return tryRun(["pauseRound", "resumeRound", "resumeEvent"], "No round is running to pause");
        case "e":
          return tryRun(["endRound"], "No round is running to end");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}
