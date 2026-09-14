"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox, Plus } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { InlineBanner, ProgressBar } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { HoldingsTable, RankMovement, TradesTable } from "@/components/market/tables";
import { MarketStateBadge } from "@/components/market/status";
import { RoundCountdown, useRoundClock } from "@/components/market/round-clock";
import { ValueChart } from "@/components/market/value-chart";
import { MarketBoard, NewsFeedCard } from "@/components/market/widgets";
import { effectiveParticipantVisibility, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { formatINR, formatPct } from "@/lib/domain/money";
import { formatLongDate } from "@/lib/format";
import { instrumentRows, netWorthSeries, proposalsForTeam, releasesNewestFirst, teamSummary, tradesForTeam, type ChartRange } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { stockHref, useTerminal } from "./terminal-context";

const RANGES = ["15M", "ROUND", "EVENT"] as const;

export function DashboardScreen() {
  const { state, team, code, teamId } = useTerminal();
  const { now, round, elapsedPct, marketState } = useRoundClock(state);
  const [range, setRange] = useState<(typeof RANGES)[number]>("EVENT");

  const summary = useMemo(() => teamSummary(state, teamId)!, [state, teamId]);
  const rows = useMemo(() => instrumentRows(state, { enabledOnly: true }), [state]);
  const series = useMemo(() => netWorthSeries(state, teamId, range as ChartRange, now), [state, teamId, range, now]);
  const incoming = proposalsForTeam(state, teamId).incomingOpen;
  const published = publishedLeaderboard(state);
  const visibility = effectiveParticipantVisibility(state);
  const ownRow = published.rows.find((r) => r.teamId === teamId);
  const leader = published.rows[0];
  const periodChange = series.length ? series[series.length - 1].value - series[0].value : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">
            {state.event.code} · {formatLongDate(state.event.scheduledDate)}
          </p>
          <h1 className="mt-0.5 text-lg leading-7 font-semibold tracking-tight text-fg-primary">{state.event.name}</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            Trading as <span className="font-medium text-fg-primary">{team.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-3 rounded-lg border border-border bg-surface px-3">
            <div className="leading-tight">
              <p className="text-[10px] font-medium tracking-wide text-fg-muted uppercase">{round ? `Round ${round.number}` : "Round"}</p>
              <p className="text-[13px] font-medium text-fg-primary">{round?.name ?? "Not started"}</p>
            </div>
            <span aria-hidden className="h-6 w-px bg-border" />
            <RoundCountdown state={state} className="text-lg font-semibold" />
            <MarketStateBadge state={marketState} />
          </div>
          <Link href={`/event/${code}/trade`} className={buttonClasses({ variant: "primary", size: "lg" })}>
            <Plus className="size-4" />
            Propose trade
          </Link>
        </div>
      </div>

      {incoming.length > 0 && (
        <InlineBanner
          tone="accent"
          icon={<Inbox className="size-4" />}
          title={`${incoming.length} incoming trade proposal${incoming.length > 1 ? "s" : ""} waiting for your response.`}
          action={
            <Link href={`/event/${code}/trade`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Review
              <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          Proposals expire if you do not respond in time.
        </InlineBanner>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Net worth" value={formatINR(summary.netWorth)} footer={<span>Cash + holdings</span>} className="col-span-2 md:col-span-1" />
        <Kpi
          label="Return"
          value={formatPct(summary.returnPct)}
          valueClassName={tone(summary.returnPct)}
          footer={
            <span>
              on {formatINR(summary.capitalBase, 0)} capital base
            </span>
          }
        />
        <Kpi label="Round P&L" value={<Delta value={summary.roundPnl} format="inr" className="text-inherit" />} valueClassName={tone(summary.roundPnl)} footer={<span>{round ? `Since R${round.number} started` : "Starts with the first round"}</span>} />
        <Kpi label="Available cash" value={formatINR(summary.cash)} footer={<span>{formatPct(summary.netWorth ? (summary.cash / summary.netWorth) * 100 : 0, { signed: false, decimals: 1 })} of net worth</span>} />
        <Kpi
          label="Rank"
          value={visibility === "HIDDEN" ? "Hidden" : ownRow ? `#${ownRow.rank}` : "—"}
          valueClassName={visibility === "HIDDEN" ? "text-fg-muted" : undefined}
          footer={
            visibility === "HIDDEN" ? (
              <span>Leaderboard hidden by host</span>
            ) : ownRow ? (
              <span className="flex items-center gap-1.5">
                of {published.rows.length} · <RankMovement movement={ownRow.movement} />
                {published.frozenAt && <span className="text-warning">· frozen</span>}
              </span>
            ) : (
              <span>Not ranked yet</span>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="flex flex-col xl:col-span-8">
          <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5">
            <div>
              <h2 className="text-[13px] font-semibold text-fg-primary">Team net worth</h2>
              <p className="mt-2 text-2xl leading-7 font-semibold tracking-tight text-fg-primary tabular-nums">{formatINR(summary.netWorth)}</p>
              <p className="mt-1 flex items-center gap-2 text-xs">
                <Delta value={periodChange} format="inr" />
                <span className="text-fg-muted">{range === "15M" ? "Last 15 minutes" : range === "ROUND" ? "This round" : "Since the event started"}</span>
              </p>
            </div>
            <SegmentedControl options={RANGES.map((r) => ({ value: r, label: r === "15M" ? "15M" : r === "ROUND" ? "Round" : "Event" }))} value={range} onChange={setRange} label="Chart range" />
          </header>
          <ValueChart points={series} range={range} height="h-64 sm:h-72 xl:h-auto xl:min-h-72 xl:flex-1" className="px-1 pt-3 pb-2" label="Team net worth chart" baseline={summary.capitalBase} />
        </Card>

        <div className="flex flex-col gap-3 xl:col-span-4">
          <Card>
            <CardHeader title="Standing" subtitle={round ? `Round ${round.number} · ${round.name}` : "Event not started"} divider action={<Link href={`/event/${code}/leaderboard`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Leaderboard<ArrowRight className="size-3.5" /></Link>} />
            <div className="flex flex-col gap-3 px-4 py-3.5">
              {visibility === "HIDDEN" ? (
                <p className="text-[13px] text-fg-secondary">The host has hidden the leaderboard for this part of the event.</p>
              ) : (
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-fg-muted">Your rank</p>
                    <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-2xl leading-7 font-semibold text-fg-primary">#{ownRow?.rank ?? "—"}</span>
                      <span className="text-xs text-fg-muted">of {published.rows.length}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <Delta value={summary.returnPct} variant="pill" showArrow />
                    {leader && visibility !== "OWN_RANK" && leader.teamId !== teamId && (
                      <p className="mt-1 text-fg-muted">
                        Leader {leader.teamName} <span className="text-fg-secondary tabular-nums">{formatPct(leader.returnPct)}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Round progress</span>
                  <RoundCountdown state={state} className="text-xs" />
                </div>
                <ProgressBar value={round && round.status !== "PENDING" ? (round.status === "ENDED" ? 100 : elapsedPct) : 0} label="Round progress" className="mt-1.5" />
              </div>
            </div>
          </Card>
          <MarketBoard rows={rows} hrefFor={stockHref(code)} subtitle="Change since round open" limit={8} action={<Link href={`/event/${code}/markets`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Markets<ArrowRight className="size-3.5" /></Link>} />
        </div>
      </div>

      <Card>
        <CardHeader title="Holdings" subtitle={`${summary.holdings.length} positions · ${formatINR(summary.holdingsValue)} at reference prices`} action={<Link href={`/event/${code}/portfolio`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Portfolio<ArrowRight className="size-3.5" /></Link>} />
        <HoldingsTable state={state} holdings={summary.holdings} stockHref={stockHref(code)} />
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader title="Recent transactions" subtitle="Settled P2P trades involving your team" action={<Link href={`/event/${code}/transactions`} className={buttonClasses({ variant: "ghost", size: "sm" })}>All transactions<ArrowRight className="size-3.5" /></Link>} />
          <TradesTable state={state} trades={tradesForTeam(state, teamId).slice(0, 6)} perspectiveTeamId={teamId} now={now} />
        </Card>
        <div className="xl:col-span-5">
          <NewsFeedCard state={state} releases={releasesNewestFirst(state)} now={now} hrefAll={`/event/${code}/news`} />
        </div>
      </div>
    </div>
  );
}

function tone(value: number) {
  return value > 0.00001 ? "text-positive" : value < -0.00001 ? "text-negative" : undefined;
}

function Kpi({ label, value, footer, valueClassName, className }: { label: string; value: React.ReactNode; footer: React.ReactNode; valueClassName?: string; className?: string }) {
  return (
    <Card className={cn("px-4 py-3.5", className)}>
      <p className="text-xs font-medium text-fg-secondary">{label}</p>
      <p className={cn("mt-1.5 truncate text-[22px] leading-7 font-semibold tracking-tight text-fg-primary tabular-nums", valueClassName)}>{value}</p>
      <div className="mt-1 truncate text-xs text-fg-muted">{footer}</div>
    </Card>
  );
}
