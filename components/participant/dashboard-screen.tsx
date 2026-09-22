"use client";

import { MARKET_STATE_DISPLAY } from "@/components/market/status";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Inbox } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { ProgressBar } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LatestNewsCard } from "@/components/market/news-modules";
import { RoundCountdown, StateDot, useRoundClock } from "@/components/market/round-clock";
import { HoldingsTable, RankMovement, TradesTable } from "@/components/market/tables";
import { ValueChart } from "@/components/market/value-chart";
import { MoversList } from "@/components/market/widgets";
import { effectiveParticipantVisibility, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import type { MarketState } from "@/lib/domain/types";
import { formatQuantity } from "@/lib/format";
import { isBuyerFor, movers, netWorthSeries, proposalsForTeam, releasesNewestFirst, symbolOf, teamNameOf, teamSummary, tradesForTeam, type ChartRange } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { stockHref, useTerminal } from "./terminal-context";

const RANGES = ["15M", "ROUND", "EVENT"] as const;

const GUIDANCE: Record<MarketState, string> = {
  OPEN: "The market is open. Follow the news and trade with other teams.",
  BRIEFING: "Briefing: read the news and study prices. Trading opens in the next round.",
  PAUSED: "Trading is paused. The host will restart the round shortly.",
  FROZEN: "Trading is frozen by the host. Nothing can settle until the market reopens.",
  BETWEEN_ROUNDS: "This round has finished. The next round starts soon.",
  NOT_STARTED: "The event hasn't started yet. Explore the stocks and your starting portfolio.",
  COMPLETED: "The event is over. Check the final leaderboard.",
};

export function DashboardScreen() {
  const { state, team, code, teamId } = useTerminal();
  const { now, round, elapsedPct, active, marketState } = useRoundClock(state);
  const [range, setRange] = useState<(typeof RANGES)[number]>("EVENT");

  const summary = useMemo(() => teamSummary(state, teamId)!, [state, teamId]);
  const series = useMemo(() => netWorthSeries(state, teamId, range as ChartRange, now), [state, teamId, range, now]);
  const releases = releasesNewestFirst(state);
  const incoming = proposalsForTeam(state, teamId).incomingOpen;
  const published = publishedLeaderboard(state);
  const visibility = effectiveParticipantVisibility(state);
  const ownRow = published.rows.find((r) => r.teamId === teamId);
  const trades = tradesForTeam(state, teamId);
  const { gainers, losers } = movers(state, 5);
  const periodChange = series.length ? series[series.length - 1].value - series[0].value : 0;
  const warn = marketState === "PAUSED" || marketState === "FROZEN";
  const roundsTotal = state.rounds.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Now: what is happening and what to do */}
      <Card className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 border-l-2 px-4 py-3.5", warn ? "border-l-warning" : marketState === "OPEN" ? "border-l-accent" : "border-l-border-strong")}>
        <div className="min-w-0 flex-1 basis-72">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
            <StateDot state={marketState} />
            {MARKET_STATE_DISPLAY[marketState]}
            {round && <span className="font-medium tracking-normal normal-case">· Round {round.number} of {roundsTotal}</span>}
          </p>
          <h1 className="mt-1 text-lg leading-6 font-semibold tracking-tight text-fg-primary">{round ? round.name : state.event.name}</h1>
          <p className="mt-0.5 text-[13px] text-fg-secondary">{GUIDANCE[marketState]}</p>
        </div>
        {active && (
          <div className="w-44">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-fg-muted">Time left</span>
              <RoundCountdown state={state} className="text-2xl leading-none font-semibold" />
            </div>
            <ProgressBar value={elapsedPct} label="Round progress" tone={warn ? "warning" : "accent"} className="mt-2" />
          </div>
        )}
        <div className="flex items-center gap-2">
          {marketState === "OPEN" ? (
            <Link href={`/event/${code}/trade`} className={buttonClasses({ variant: "primary", size: "lg" })}>
              <ArrowLeftRight className="size-4" />
              Trade
            </Link>
          ) : (
            <Link href={`/event/${code}/${marketState === "COMPLETED" ? "leaderboard" : "markets"}`} className={buttonClasses({ variant: "secondary", size: "lg" })}>
              {marketState === "COMPLETED" ? "Final leaderboard" : "View markets"}
            </Link>
          )}
        </div>
      </Card>

      {incoming.length > 0 && (
        <Card className="border-accent/40 bg-accent/6">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-accent/15 text-accent-text">
              <Inbox className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-fg-primary">
                {incoming.length} {incoming.length === 1 ? "team wants" : "teams want"} to trade with you
              </p>
              <p className="truncate text-[13px] text-fg-secondary">
                {incoming
                  .slice(0, 2)
                  .map((p) => `${teamNameOf(state)(p.proposerTeamId)}: you ${isBuyerFor(p, teamId) ? "buy" : "sell"} ${formatQuantity(p.quantity)} ${symbolOf(state)(p.instrumentId)} at ₹${formatPrice(p.price)}`)
                  .join(" · ")}
              </p>
            </div>
            <Link href={`/event/${code}/trade`} className={buttonClasses({ variant: "primary" })}>
              Review proposals
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      )}

      {/* Key performance */}
      <Card className="grid grid-cols-2 lg:grid-cols-4">
        <Metric label="Net worth" value={formatINR(summary.netWorth)} sub={<>Round P&amp;L <Delta value={summary.roundPnl} format="inr" /></>} className="border-r border-b border-border lg:border-b-0" />
        <Metric
          label="Return"
          value={formatPct(summary.returnPct)}
          valueClassName={summary.returnPct > 0.00001 ? "text-positive" : summary.returnPct < -0.00001 ? "text-negative" : undefined}
          sub={
            <>
              Total P&amp;L <Delta value={summary.netWorth - summary.capitalBase} format="inr" /> on {formatINR(summary.capitalBase, 0)}
            </>
          }
          className="border-b border-border lg:border-r lg:border-b-0"
        />
        <Metric label="Cash" value={formatINR(summary.cash)} sub="Available to buy" className="border-r border-border" />
        <Metric
          label="Rank"
          value={visibility === "HIDDEN" ? "Hidden" : ownRow ? `#${ownRow.rank}` : "—"}
          valueClassName={visibility === "HIDDEN" ? "text-fg-muted" : undefined}
          sub={
            visibility === "HIDDEN" ? (
              "Revealed later by the host"
            ) : ownRow ? (
              <span className="inline-flex items-center gap-1.5">
                of {published.rows.length} teams <RankMovement movement={ownRow.movement} hideFlat />
                {published.frozenAt && <span className="text-warning">· frozen</span>}
              </span>
            ) : (
              "Not ranked yet"
            )
          }
        />
      </Card>

      {/* Main: chart + latest news */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="flex flex-col xl:col-span-8">
          <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5">
            <div>
              <h2 className="text-[13px] font-semibold text-fg-primary">Portfolio value</h2>
              <p className="mt-1.5 text-2xl leading-7 font-semibold tracking-tight text-fg-primary tabular-nums">{formatINR(summary.netWorth)}</p>
              <p className="mt-1 flex items-center gap-2 text-xs">
                <Delta value={periodChange} format="inr" />
                <span className="text-fg-muted">{range === "15M" ? "last 15 minutes" : range === "ROUND" ? "this round" : "since the event started"}</span>
              </p>
            </div>
            <SegmentedControl options={RANGES.map((r) => ({ value: r, label: r === "15M" ? "15M" : r === "ROUND" ? "Round" : "Event" }))} value={range} onChange={setRange} label="Chart range" />
          </header>
          <ValueChart points={series} range={range} height="h-60 sm:h-72 xl:h-auto xl:min-h-72 xl:flex-1" className="px-1 pt-3 pb-2" label="Portfolio value chart" baseline={summary.capitalBase} />
        </Card>
        <LatestNewsCard state={state} releases={releases} now={now} newsHref={`/event/${code}/news`} className="xl:col-span-4" />
      </div>

      {/* Secondary */}
      <Card>
        <Tabs defaultValue="holdings">
          <TabsList>
            <TabsTrigger value="holdings" count={summary.holdings.length}>
              Holdings
            </TabsTrigger>
            <TabsTrigger value="movers">Market movers</TabsTrigger>
            <TabsTrigger value="trades" count={trades.length}>
              Recent trades
            </TabsTrigger>
            <Link href={`/event/${code}/portfolio`} className="ml-auto hidden items-center gap-1 text-xs text-fg-secondary hover:text-fg-primary sm:flex">
              Full portfolio <ArrowRight className="size-3" />
            </Link>
          </TabsList>
          <TabsContent value="holdings">
            {summary.holdings.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-fg-muted">You don&apos;t hold any stocks yet. Buy from another team on the Trade page.</p>
            ) : (
              <HoldingsTable state={state} holdings={summary.holdings} stockHref={stockHref(code)} showAllocation={false} />
            )}
          </TabsContent>
          <TabsContent value="movers">
            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
              <div>
                <p className="px-4 pt-3 text-[11px] font-semibold tracking-wide text-positive uppercase">Top gainers this round</p>
                <MoversList rows={gainers} hrefFor={stockHref(code)} empty="No gainers this round yet." />
              </div>
              <div>
                <p className="px-4 pt-3 text-[11px] font-semibold tracking-wide text-negative uppercase">Top losers this round</p>
                <MoversList rows={losers} hrefFor={stockHref(code)} empty="No losers this round yet." />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="trades">
            <TradesTable state={state} trades={trades.slice(0, 8)} perspectiveTeamId={teamId} now={now} />
          </TabsContent>
        </Tabs>
      </Card>
      <p className="text-center text-xs text-fg-muted">
        Trading as <span className="text-fg-secondary">{team.name}</span> · {state.event.name}
      </p>
    </div>
  );
}

function Metric({ label, value, sub, valueClassName, className }: { label: string; value: ReactNode; sub: ReactNode; valueClassName?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 px-4 py-3.5", className)}>
      <p className="text-xs font-medium text-fg-secondary">{label}</p>
      <p className={cn("mt-1 truncate text-lg leading-7 font-semibold tracking-tight text-fg-primary tabular-nums sm:text-[22px]", valueClassName)}>{value}</p>
      <div className="mt-0.5 truncate text-xs text-fg-muted">{sub}</div>
    </div>
  );
}
