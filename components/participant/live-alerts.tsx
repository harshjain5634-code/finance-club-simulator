"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Popover as RadixPopover } from "radix-ui";
import { Bell, Newspaper, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Delta } from "@/components/ui/delta";
import { ImpactRow } from "@/components/market/news-modules";
import { formatINR, formatPrice } from "@/lib/domain/money";
import type { EventState } from "@/lib/domain/types";
import { formatClock, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/mock/hooks";
import { isBuyerFor, releasesNewestFirst, symbolOf, teamNameOf } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { markNewsRead, useNewsLastSeen } from "./terminal-context";

const TOAST_WINDOW_MS = 15_000;
const dismissedKey = (eventId: string) => `finsim:breaking-dismissed:${eventId}`;

function readDismissed(eventId: string): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(dismissedKey(eventId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Breaking-news toast: appears for 15 seconds after a release, anchored under the top bar so it never covers
 * navigation or blocks the page. The story stays highlighted on the dashboard and news page afterwards.
 */
export function BreakingNewsToast({ state, code }: { state: EventState; code: string }) {
  const now = useNow();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(state.event.id));
  const latest = releasesNewestFirst(state)[0];
  const visible = latest && now - latest.releasedAt < TOAST_WINDOW_MS && !dismissed.includes(latest.id);

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      sessionStorage.setItem(dismissedKey(state.event.id), JSON.stringify(next));
    } catch {
      // Dismissal is a convenience only.
    }
  };

  if (!visible) return null;
  return (
    <div role="alert" aria-live="assertive" className="fixed top-[4.25rem] right-3 z-[65] w-[min(26rem,calc(100vw-1.5rem))] animate-slide-in-right sm:right-5">
      <div className="overflow-hidden rounded-lg border border-warning/50 bg-surface-raised shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-3 border-b border-warning/30 bg-warning/12 px-3.5 py-2">
          <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-warning uppercase">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-warning" aria-hidden />
            Breaking news
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-fg-secondary tabular-nums">{formatClock(latest.releasedAt, true)}</span>
            <button type="button" onClick={() => dismiss(latest.id)} className="grid size-6 place-items-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg-primary" aria-label="Dismiss breaking news">
              <X className="size-3.5" />
            </button>
          </span>
        </div>
        <div className="px-3.5 py-3">
          <p className="text-[14px] leading-snug font-semibold text-fg-primary">{latest.headline}</p>
          {latest.impacts.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1.5">
              {latest.impacts.slice(0, 3).map((impact) => (
                <ImpactRow key={impact.instrumentId} state={state} impact={impact} size="sm" />
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-fg-muted">Prices have already updated.</span>
            <Link href={`/event/${code}/news`} onClick={() => dismiss(latest.id)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Read the story
            </Link>
          </div>
        </div>
        <div className="h-0.5 bg-surface-hover">
          <div key={latest.id} className="h-full origin-left bg-warning" style={{ animation: `toast-countdown ${TOAST_WINDOW_MS}ms linear forwards` }} />
        </div>
        <style>{`@keyframes toast-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
      </div>
    </div>
  );
}

/** Returns ids that appeared after mount; the first snapshot is treated as already seen. */
function useNewIds(ids: string[], onNew: (ids: string[]) => void) {
  const known = useRef<Set<string> | null>(null);
  const callback = useRef(onNew);
  useEffect(() => {
    callback.current = onNew;
  });
  const signature = ids.join("|");
  useEffect(() => {
    const list = signature ? signature.split("|") : [];
    if (known.current === null) {
      known.current = new Set(list);
      return;
    }
    const fresh = list.filter((id) => !known.current!.has(id));
    fresh.forEach((id) => known.current!.add(id));
    if (fresh.length > 0) callback.current(fresh);
  }, [signature]);
}

/** Toasts when a new proposal arrives for this team or one of its proposals changes state. */
export function ProposalNotifier({ state, teamId }: { state: EventState; teamId: string }) {
  const incoming = state.proposals.filter((p) => p.counterpartyTeamId === teamId);
  const name = teamNameOf(state);
  const symbol = symbolOf(state);
  useNewIds(
    incoming.map((p) => p.id),
    (ids) => {
      for (const proposal of incoming.filter((p) => ids.includes(p.id) && p.status === "PROPOSED")) {
        const youBuy = isBuyerFor(proposal, teamId);
        toast.info(
          `${name(proposal.proposerTeamId)} sent you a proposal`,
          `You ${youBuy ? "buy" : "sell"} ${proposal.quantity} ${symbol(proposal.instrumentId)} at ₹${formatPrice(proposal.price)} (${formatINR(proposal.price * proposal.quantity)}). Review it on the Trade page.`,
        );
      }
    },
  );

  const outgoing = state.proposals.filter((p) => p.proposerTeamId === teamId);
  const statusSignature = outgoing.map((p) => `${p.id}:${p.status}`);
  useNewIds(statusSignature, (changes) => {
    for (const change of changes) {
      const [id, status] = change.split(":");
      const proposal = outgoing.find((p) => p.id === id);
      if (!proposal || status === "PROPOSED" || status === "ACCEPTED") continue;
      const label = `${proposal.quantity} ${symbol(proposal.instrumentId)} with ${name(proposal.counterpartyTeamId)}`;
      if (status === "SETTLED") toast.success(`Trade settled: ${label}`, `Settled at ₹${formatPrice(proposal.price)} per share.`);
      else if (status === "REJECTED") toast.warning(`Proposal declined: ${label}`, proposal.rejectionReason ?? undefined);
      else if (status === "FAILED") toast.warning(`Proposal could not settle: ${label}`, proposal.failureReason ?? undefined);
      else if (status === "EXPIRED") toast.info(`Proposal expired: ${label}`);
      else if (status === "PENDING_APPROVAL") toast.info(`Waiting for host approval: ${label}`);
      else if (status === "REJECTED_BY_HOST") toast.warning(`Host rejected: ${label}`, proposal.rejectionReason ?? undefined);
    }
  });

  return null;
}

export function NewsAlertsMenu({ state, teamId, code }: { state: EventState; teamId: string; code: string }) {
  const now = useNow();
  const lastSeen = useNewsLastSeen(state.event.id, teamId);
  const releases = releasesNewestFirst(state);
  const unread = releases.filter((r) => r.releasedAt > lastSeen).length;

  return (
    <RadixPopover.Root onOpenChange={(open) => !open && markNewsRead(state.event.id, teamId)}>
      <RadixPopover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `News, ${unread} unread` : "News"} className="relative">
          <Bell className="size-4" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-3.5 place-items-center rounded-full bg-warning px-1 text-[9px] leading-3.5 font-bold text-warning-fg ring-2 ring-canvas">
              {unread}
            </span>
          )}
        </Button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content align="end" sideOffset={8} className="z-50 w-[min(24rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-fg-primary">News</p>
            <RadixPopover.Close className="grid size-6 place-items-center rounded text-fg-muted hover:bg-surface-hover" aria-label="Close">
              <X className="size-3.5" />
            </RadixPopover.Close>
          </div>
          {releases.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-muted">No news released yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {releases.slice(0, 8).map((release) => (
                <li key={release.id} className="mx-1 flex gap-3 rounded-md px-2.5 py-2.5 hover:bg-surface-hover">
                  <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border", release.releasedAt > lastSeen ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-surface text-fg-muted")}>
                    <Newspaper className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] leading-snug", release.releasedAt > lastSeen ? "font-medium text-fg-primary" : "text-fg-secondary")}>{release.headline}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-fg-muted">
                      {release.impacts.map((i) => (
                        <span key={i.instrumentId}>
                          {symbolOf(state)(i.instrumentId)} <Delta value={i.appliedPct} className="text-[11px]" />
                        </span>
                      ))}
                      <span>{formatRelative(release.releasedAt, now)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border p-2">
            <RadixPopover.Close asChild>
              <Link href={`/event/${code}/news`} className={buttonClasses({ variant: "ghost", size: "sm", className: "w-full" })}>
                Open news feed
              </Link>
            </RadixPopover.Close>
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
