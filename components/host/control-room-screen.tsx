"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CirclePause, CirclePlay, Circle, Flag, Gauge, Newspaper, SkipForward, Square, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Delta } from "@/components/ui/delta";
import { InlineBanner, ProgressBar, StatTile } from "@/components/ui/misc";
import { EventStatusBadge, MarketStateBadge, RoundStatusBadge } from "@/components/market/status";
import { RoundCountdown, useRoundClock } from "@/components/market/round-clock";
import { LeaderboardTable } from "@/components/market/tables";
import { ImpactLabel } from "@/components/market/widgets";
import { computeLeaderboard } from "@/lib/domain/leaderboard";
import { nextPendingRound, readiness } from "@/lib/domain/lifecycle";
import { formatINR, formatPrice } from "@/lib/domain/money";
import { configuredImpactOf } from "@/lib/domain/news";
import type { NewsItem, OpResult } from "@/lib/domain/types";
import { formatClock, formatMinutes } from "@/lib/format";
import { endEvent, endRound, nextRound, pauseEvent, pauseRound, resumeEvent, resumeRound, startEvent, startRound } from "@/lib/mock/commands";
import { useOnlineTeams } from "@/lib/mock/runtime";
import { instrumentOf, instrumentRows, tradingVolume } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { ActivityFeed } from "./activity-feed";
import { hostAction, hostBase, useHostEvent } from "./host-context";
import { ReleaseNewsDialog } from "./news-release-dialog";
import { FreezeTradingControl } from "./trading-controls";

type Pending =
  | { kind: "startEvent" }
  | { kind: "endEvent" }
  | { kind: "startRound" }
  | { kind: "endRound" }
  | { kind: "nextRound" }
  | null;

export function ControlRoomScreen() {
  const { state, eventId } = useHostEvent();
  const { now, round, remaining, elapsedPct, marketState } = useRoundClock(state);
  const online = useOnlineTeams(eventId);
  const [pending, setPending] = useState<Pending>(null);
  const [releaseItem, setReleaseItem] = useState<NewsItem | null>(null);
  const base = hostBase(eventId);
  const { event } = state;

  const setupPhase = event.status === "DRAFT" || event.status === "READY";
  const checklist = readiness(state);
  const upcoming = nextPendingRound(state);
  const roundActive = round && (round.status === "RUNNING" || round.status === "PAUSED");
  const volume = tradingVolume(state, round?.id ?? null);
  const pendingApprovals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL").length;
  const releasedCount = state.news.filter((n) => n.status === "RELEASED").length;
  const queue = state.news
    .filter((n) => n.status === "READY" && (!round || n.roundId === round.id || n.roundId === null))
    .sort((a, b) => a.number - b.number);
  const laterQueue = state.news.filter((n) => n.status === "READY" && round && n.roundId !== round.id && n.roundId !== null).length;
  const leaderboard = computeLeaderboard(state).slice(0, 5);
  const rows = instrumentRows(state);

  const dialogs: Record<Exclude<Pending, null>["kind"], { title: string; description: string; label: string; tier: "confirm" | "typed"; run: (reason: string) => Promise<OpResult<unknown>> }> = {
    startEvent: {
      title: `Start ${event.name}?`,
      description: "Opening prices are locked and the event goes live for every team. Rounds are started separately.",
      label: "Start event",
      tier: "confirm",
      run: () => hostAction(startEvent(eventId), "Event started", "Start the briefing round when the room is ready."),
    },
    endEvent: {
      title: "End the event?",
      description: "Trading stops permanently, open proposals are cancelled, final standings are published and the projector shows the results. This cannot be undone.",
      label: "End event",
      tier: "typed",
      run: (reason) => hostAction(endEvent(eventId, reason), "Event ended", "Final results are now on the projector."),
    },
    startRound: {
      title: upcoming ? `Start Round ${upcoming.number} · ${upcoming.name}?` : "Start round?",
      description: upcoming
        ? `${formatMinutes(upcoming.durationSeconds)} ${upcoming.type === "BRIEFING" ? "briefing: teams can view the market but trading stays closed" : "trading round: teams can propose and accept trades"}.`
        : "",
      label: upcoming ? `Start ${upcoming.type === "BRIEFING" ? "briefing" : `Round ${upcoming.number}`}` : "Start round",
      tier: "confirm",
      run: () => hostAction(startRound(eventId), (r) => `Round ${r.number} · ${r.name} started`),
    },
    endRound: {
      title: round ? `End Round ${round.number} now?` : "End round?",
      description: "The timer stops and trading closes until you start the next round. Holdings and prices carry over.",
      label: "End round",
      tier: "confirm",
      run: () => hostAction(endRound(eventId), (r) => `Round ${r.number} ended`),
    },
    nextRound: {
      title: upcoming ? `Move to Round ${upcoming.number} · ${upcoming.name}?` : "Next round",
      description: `${roundActive ? `Round ${round!.number} ends immediately and ` : ""}Round ${upcoming?.number ?? ""} starts with a ${upcoming ? formatMinutes(upcoming.durationSeconds) : ""} timer.`,
      label: roundActive ? `End R${round!.number} & start R${upcoming?.number ?? ""}` : `Start R${upcoming?.number ?? ""}`,
      tier: "confirm",
      run: () => hostAction(nextRound(eventId), (r) => `Round ${r.number} · ${r.name} started`),
    },
  };
  const dialog = pending ? dialogs[pending.kind] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <Gauge className="size-3.5" /> Control room
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-fg-primary">{event.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <MarketStateBadge state={marketState} size="md" />
          <span className="text-xs text-fg-muted tabular-nums">Updated {formatClock(now, true)}</span>
        </div>
      </div>

      {setupPhase && (
        <Card>
          <CardHeader
            title="Readiness checklist"
            subtitle={event.status === "READY" ? "Allocations applied: the event can start" : "Complete setup before starting the event"}
            divider
            action={
              <Button variant="primary" onClick={() => setPending({ kind: "startEvent" })} disabled={checklist.some((i) => !i.done && i.id !== "news" && i.id !== "projector")}>
                <CirclePlay className="size-3.5" />
                Start event
              </Button>
            }
          />
          <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-3 bg-surface px-4 py-3">
                <span className={cn("grid size-6 place-items-center rounded-full", item.done ? "bg-accent/15 text-accent" : "border border-border-strong text-fg-muted")}>
                  {item.done ? <Check className="size-3.5" strokeWidth={3} /> : <Circle className="size-2" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg-primary">{item.label}</p>
                  <p className="truncate text-xs text-fg-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader title="Event" subtitle={event.startedAt ? `Started ${formatClock(event.startedAt)}` : "Not started"} action={<EventStatusBadge status={event.status} />} divider />
          <div className="flex flex-1 flex-col justify-between gap-4 px-4 py-4">
            <p className="text-[13px] leading-relaxed text-fg-secondary">
              {event.status === "LIVE" && "The event is live. Pausing holds the round timer and blocks trading."}
              {event.status === "PAUSED" && "The event is paused. Resume to restart the round timer."}
              {event.status === "COMPLETED" && "The event is complete. Final standings are published."}
              {setupPhase && "Start the event when teams are seated. Rounds are started separately."}
            </p>
            <div className="flex flex-wrap gap-2">
              {setupPhase && (
                <Button variant="primary" onClick={() => setPending({ kind: "startEvent" })}>
                  <CirclePlay className="size-3.5" /> Start event
                </Button>
              )}
              {event.status === "LIVE" && (
                <Button variant="secondary" onClick={() => hostAction(pauseEvent(eventId), "Event paused")}>
                  <CirclePause className="size-3.5" /> Pause event
                </Button>
              )}
              {event.status === "PAUSED" && (
                <Button variant="primary" onClick={() => hostAction(resumeEvent(eventId), "Event resumed")}>
                  <CirclePlay className="size-3.5" /> Resume event
                </Button>
              )}
              {(event.status === "LIVE" || event.status === "PAUSED") && (
                <Button variant="warning-outline" onClick={() => setPending({ kind: "endEvent" })}>
                  <Flag className="size-3.5" /> End event
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Round control"
            subtitle={round ? `Round ${round.number} of ${state.rounds.length - 1} · ${round.type === "BRIEFING" ? "Briefing" : "Trading"}` : `${state.rounds.length} rounds scheduled`}
            action={round ? <RoundStatusBadge status={round.status} /> : undefined}
            divider
          />
          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-fg-primary">{round ? round.name : "No round started"}</p>
                <p className="text-xs text-fg-muted">{upcoming ? `Next: R${upcoming.number} · ${upcoming.name} (${formatMinutes(upcoming.durationSeconds)})` : "No rounds remaining"}</p>
              </div>
              <RoundCountdown state={state} className="text-3xl leading-none font-semibold" />
            </div>
            <ProgressBar value={round ? (round.status === "ENDED" ? 100 : elapsedPct) : 0} label="Round progress" tone={round?.status === "PAUSED" ? "warning" : "accent"} />
            <div className="flex flex-wrap gap-2">
              {!roundActive && upcoming && (
                <Button variant="primary" onClick={() => setPending({ kind: "startRound" })} disabled={event.status !== "LIVE"}>
                  <CirclePlay className="size-3.5" /> Start {upcoming.type === "BRIEFING" ? "briefing" : `R${upcoming.number}`}
                </Button>
              )}
              {round?.status === "RUNNING" && (
                <Button variant="secondary" onClick={() => hostAction(pauseRound(eventId), `Round ${round.number} paused`)}>
                  <CirclePause className="size-3.5" /> Pause
                </Button>
              )}
              {round?.status === "PAUSED" && (
                <Button variant="primary" onClick={() => hostAction(resumeRound(eventId), `Round ${round.number} resumed`)} disabled={event.status !== "LIVE"}>
                  <CirclePlay className="size-3.5" /> Resume
                </Button>
              )}
              {roundActive && (
                <Button variant="secondary" onClick={() => setPending({ kind: "endRound" })}>
                  <Square className="size-3.5" /> End
                </Button>
              )}
              {upcoming && roundActive && (
                <Button variant="secondary" onClick={() => setPending({ kind: "nextRound" })} disabled={event.status !== "LIVE"}>
                  <SkipForward className="size-3.5" /> Next round
                </Button>
              )}
            </div>
            {round?.status === "RUNNING" && remaining <= 60_000 && remaining > 0 && <p className="text-xs text-warning">Less than a minute left. The round ends automatically at 00:00.</p>}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Trading control" subtitle="Emergency controls apply to every team" divider action={<Badge tone={event.tradingFrozen ? "warning" : marketState === "OPEN" ? "accent" : "neutral"} dot>{event.tradingFrozen ? "Frozen" : marketState === "OPEN" ? "Open" : "Closed"}</Badge>} />
          <div className="flex flex-1 flex-col justify-between gap-4 px-4 py-4">
            <div className="text-[13px] leading-relaxed text-fg-secondary">
              {event.tradingFrozen ? (
                <p>
                  Trading has been frozen since {event.tradingFrozenAt ? formatClock(event.tradingFrozenAt, true) : "—"}. Teams cannot propose or accept trades.
                </p>
              ) : (
                <p>{marketState === "OPEN" ? "Teams can propose and accept trades." : "Trading is closed by the round state (no trading round running)."}</p>
              )}
              <p className="mt-2 text-xs text-fg-muted">
                Halted stocks: {state.instruments.filter((i) => i.halted).map((i) => i.symbol).join(", ") || "none"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FreezeTradingControl state={state} size="lg" />
              <Link href={`${base}/prices`} className={buttonClasses({ variant: "secondary", size: "lg" })}>
                Halt a stock
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Teams online" value={`${online.size} / ${state.teams.length}`} sub="Terminals open in this browser" />
        <StatTile label="Trades this round" value={volume.count} sub={round ? `Round ${round.number}` : "No round yet"} />
        <StatTile label="Trading volume" value={formatINR(volume.value, 0)} sub="Settled value this round" />
        <StatTile label="News released" value={`${releasedCount} / ${state.news.length}`} sub={`${state.news.filter((n) => n.status === "READY").length} ready`} />
        <StatTile label="Pending approvals" value={pendingApprovals} valueClassName={pendingApprovals ? "text-warning" : undefined} sub={<Link href={`${base}/trades`} className="hover:text-fg-secondary">Open trade monitor</Link>} />
      </div>

      {event.tradingFrozen && (
        <InlineBanner tone="warning" title="Trading is frozen.">
          Remember to unfreeze trading once the issue is resolved.
        </InlineBanner>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader title="News queue" subtitle={round ? `Ready for Round ${round.number}${laterQueue ? ` · ${laterQueue} later` : ""}` : "Ready items"} icon={<Newspaper className="size-3.5" />} divider action={<Link href={`${base}/news`} className={buttonClasses({ variant: "ghost", size: "sm" })}>News desk<ArrowRight className="size-3.5" /></Link>} />
          {queue.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-muted">No ready news for this round.</p>
          ) : (
            <ul className="divide-y divide-border">
              {queue.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-xs text-fg-muted">#{item.number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg-primary">{item.headline}</p>
                    <p className="flex flex-wrap gap-x-2 text-[11px] text-fg-muted">
                      {item.impacts.map((impact) => (
                        <span key={impact.id}>
                          {instrumentOf(state, impact.instrumentId)?.symbol} <ImpactLabel configured={configuredImpactOf(impact)} className="text-[11px]" />
                        </span>
                      ))}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setReleaseItem(item)} disabled={event.status !== "LIVE" && event.status !== "PAUSED"}>
                    Preview & release
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Current market" subtitle="Change since round open" icon={<Timer className="size-3.5" />} divider action={<Link href={`${base}/prices`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Prices<ArrowRight className="size-3.5" /></Link>} />
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.instrument.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-20 text-[13px] font-medium text-fg-primary">{row.instrument.symbol}</span>
                <span className="flex-1 text-right text-[13px] tabular-nums">₹{formatPrice(row.price)}</span>
                <Delta value={row.roundChangePct} variant="pill" className="w-18 justify-end" />
                <span className="w-14 text-right">{row.instrument.halted ? <Badge tone="warning">Halted</Badge> : !row.instrument.enabled ? <Badge tone="outline">Off</Badge> : null}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Live activity" subtitle="Audit stream" divider action={<Link href={`${base}/audit`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Audit</Link>} />
          <div className="max-h-[26rem] overflow-y-auto">
            <ActivityFeed state={state} now={now} limit={40} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Leaderboard preview" subtitle="Top 5 live standings (host view)" divider action={<Link href={`${base}/leaderboard`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Leaderboard control<ArrowRight className="size-3.5" /></Link>} />
        <LeaderboardTable rows={leaderboard} />
      </Card>

      <ConfirmActionDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setPending(null)}
        tier={dialog?.tier ?? "confirm"}
        tone={pending?.kind === "endEvent" ? "warning" : "accent"}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.label ?? ""}
        typedPhrase={pending?.kind === "endEvent" ? event.code : undefined}
        reasonLabel="Reason for ending (recorded in the audit log)"
        onConfirm={({ reason }) => (dialog ? dialog.run(reason) : Promise.resolve({ ok: true, value: undefined }))}
      />
      <ReleaseNewsDialog state={state} item={releaseItem} onClose={() => setReleaseItem(null)} />
    </div>
  );
}
