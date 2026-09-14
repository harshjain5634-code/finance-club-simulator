"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Menu, MonitorSmartphone, Users } from "lucide-react";
import { AppFrame } from "@/components/shell/app-frame";
import { Brand } from "@/components/shell/brand";
import { Button, buttonClasses } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/controls";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/misc";
import { EventStatusBadge } from "@/components/market/status";
import { SessionChip } from "@/components/market/round-clock";
import { readiness } from "@/lib/domain/lifecycle";
import type { EventState } from "@/lib/domain/types";
import { hostNav } from "@/lib/navigation";
import { useEventById } from "@/lib/mock/hooks";
import { useOnlineTeams } from "@/lib/mock/runtime";
import { HOST_NAME } from "@/lib/mock/store";
import { HostEventContext } from "./host-context";
import { LiveControls } from "./live-controls";

export function HostEventShell({ children }: { children: ReactNode }) {
  const params = useParams<{ eventId: string }>();
  const eventId = decodeURIComponent(params.eventId);
  const state = useEventById(eventId);

  if (state === null) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 border-r border-border lg:block" />
        <div className="flex-1 space-y-3 px-6 py-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-40" />
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

  const pendingApprovals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL").length;

  return (
    <HostEventContext.Provider value={eventId}>
      <AppFrame
        label="Host console navigation"
        variant="console"
        nav={hostNav(eventId)}
        badges={{ approvals: pendingApprovals }}
        sidebarHeader={<Brand href="/host" subtitle="Host console" />}
        sidebarFooter={
          <>
            <Link href="/host" className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover/70 hover:text-fg-primary">
              <ArrowLeft className="size-4 text-fg-muted" strokeWidth={1.75} />
              All events
            </Link>
            <div className="mt-3 flex items-center gap-2.5 rounded-md border border-border bg-surface-raised px-2.5 py-2">
              <Avatar name="Host Club" tone="accent" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-medium text-fg-primary">{HOST_NAME}</span>
                <span className="block truncate text-[11px] text-fg-muted">Event owner · prototype</span>
              </span>
            </div>
          </>
        }
        topBar={({ openNav, navOpen }) => <HostStatusBar state={state} openNav={openNav} navOpen={navOpen} />}
        banner={
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6 lg:hidden">
            <p className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-fg-secondary">
              <MonitorSmartphone className="size-3.5 shrink-0 text-fg-muted" />
              The host console is designed for laptops (1024px+). Everything works here, but tables scroll.
            </p>
          </div>
        }
      >
        {children}
      </AppFrame>
    </HostEventContext.Provider>
  );
}

/** Always-visible event status bar: where the event is, what's happening now and the primary live controls. */
function HostStatusBar({ state, openNav, navOpen }: { state: EventState; openNav: () => void; navOpen: boolean }) {
  const { event } = state;
  const online = useOnlineTeams(event.id);
  const setup = event.status === "DRAFT" || event.status === "READY";
  const items = readiness(state);

  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
      <Button variant="ghost" size="icon" onClick={openNav} aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={navOpen} className="-ml-1.5 lg:hidden">
        <Menu className="size-4" />
      </Button>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="min-w-0 leading-tight">
          <p className="max-w-[16rem] truncate text-[14px] font-semibold text-fg-primary">{event.name}</p>
          <p className="font-mono text-[11px] text-fg-muted">{event.code}</p>
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {setup ? (
          <span className="flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-xs text-fg-secondary">
            Setup · <span className="ml-1 font-medium text-fg-primary tabular-nums">{items.filter((i) => i.done).length}/{items.length}</span>&nbsp;ready
          </span>
        ) : (
          <SessionChip state={state} />
        )}
        <Tooltip content="Team terminals open in this browser (prototype presence)">
          <span className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-fg-secondary tabular-nums">
            <Users className="size-3.5" aria-hidden />
            <span className="font-medium text-fg-primary">{online.size}</span>/{state.teams.length}
            <span className="sr-only">teams online</span>
          </span>
        </Tooltip>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LiveControls state={state} />
        <Tooltip content="Open the projector in a new tab">
          <a href={`/event/${event.code}/projector?key=${event.projector.projectorKey}`} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ghost", size: "icon" })} aria-label="Open projector">
            <ExternalLink className="size-4" />
          </a>
        </Tooltip>
      </div>
    </div>
  );
}
