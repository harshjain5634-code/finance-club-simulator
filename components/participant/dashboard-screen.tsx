"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { buttonClasses, ButtonKbd } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { Sparkline } from "@/components/ui/sparkline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketStateBadge } from "@/components/market/status";
import { HoldingRows, HoldingsEmpty } from "@/components/market/holding-rows";
import { NewsCard } from "@/components/market/news-card";
import { RoundTrack } from "@/components/market/round-track";
import { useRoundClock } from "@/components/market/round-clock";
import { TradesTable } from "@/components/market/tables";
import { MoversList } from "@/components/market/widgets";
import {
  computeLeaderboard,
  effectiveParticipantVisibility,
  publishedLeaderboard,
  sharedRanks,
} from "@/lib/domain/leaderboard";
import { formatINR, formatPct } from "@/lib/domain/money";
import type { EventState, MarketState } from "@/lib/domain/types";
import { formatClock, formatDuration } from "@/lib/format";
import {
  movers,
  netWorthSeries,
  releasesNewestFirst,
  teamSummary,
  tradesForTeam,
} from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { NeedsAttention, useAttentionItems } from "./needs-attention";
import { stockHref, useNewsLastSeen, useTerminal } from "./terminal-context";

function heroCopy(
  state: EventState,
  marketState: MarketState,
  teamName: string,
  roundName: string | null,
  nextName: string | null,
): { title: string; body: string } {
  switch (marketState) {
    case "OPEN":
      return {
        title: "You can trade now",
        body: "Propose a trade to any team; it settles the moment they accept.",
      };
    case "FROZEN":
      return {
        title: "Trading is frozen by the host",
        body: "You can't send or accept proposals right now. Open proposals stay open, and the round clock keeps running.",
      };
    case "PAUSED":
      return {
        title: "The event is paused",
        body: "The round clock is stopped. Trading resumes when the host restarts the round.",
      };
    case "BRIEFING":
      return {
        title: "Briefing in progress",
        body: "Read the news and study prices. Trading opens when Round 1 starts.",
      };
    case "BETWEEN_ROUNDS":
      return {
        title: `${roundName ? `${roundName} is over.` : "Round over."} ${nextName ? `${nextName} starts when the host is ready` : "Final results are coming"}`,
        body: "Review your portfolio and today's news. Nothing can be traded until the next round starts.",
      };
    case "COMPLETED":
      return {
        title: "The event is over",
        body: "Final standings are on the leaderboard.",
      };
    default:
      return {
        title: `Welcome, ${teamName}`,
        body: `${state.rounds.some((r) => r.type === "BRIEFING") ? "The event starts with a briefing. " : ""}Prices don't move and trading stays closed until Round 1.`,
      };
  }
}

/** C4 Event Status Hero: state, plain-language instruction, round track, the round clock and one action. */
function EventStatusHero({
  state,
  code,
  teamId,
  className,
}: {
  state: EventState;
  code: string;
  teamId: string;
  className?: string;
}) {
  const { round, remaining, active, marketState } = useRoundClock(state);
  const team = state.teams.find((t) => t.id === teamId);
  const trading = state.rounds.filter((r) => r.type === "TRADING");
  const next = [...state.rounds]
    .sort((a, b) => a.number - b.number)
    .find((r) => r.status === "PENDING");
  const urgent = active && round?.status === "RUNNING" && remaining <= 60_000;
  const warning = marketState === "FROZEN" || marketState === "PAUSED";
  const copy = heroCopy(
    state,
    marketState,
    team?.name ?? "team",
    round?.type === "TRADING"
      ? `Round ${round.number}`
      : round
        ? "The briefing"
        : null,
    next
      ? next.type === "BRIEFING"
        ? "The briefing"
        : `Round ${next.number} · ${next.name}`
      : null,
  );
  const roundLine =
    marketState === "OPEN" && round
      ? round.type === "BRIEFING"
        ? `Briefing · ${round.name}. `
        : `Round ${round.number} of ${trading.length} · ${round.name}. `
      : "";
  const cta =
    marketState === "OPEN" ? (
      <Link
        href={`/event/${code}/trade`}
        className={buttonClasses({ variant: "primary" })}
      >
        <Plus /> New trade <ButtonKbd variant="primary">T</ButtonKbd>
      </Link>
    ) : marketState === "FROZEN" || marketState === "PAUSED" ? (
      <Link
        href={`/event/${code}/news`}
        className={buttonClasses({ variant: "secondary" })}
      >
        Read the latest news
      </Link>
    ) : marketState === "NOT_STARTED" ? (
      <Link
        href={`/event/${code}/rules`}
        className={buttonClasses({ variant: "secondary" })}
      >
        How trading works
      </Link>
    ) : marketState === "COMPLETED" ? (
      <Link
        href={`/event/${code}/leaderboard`}
        className={buttonClasses({ variant: "secondary" })}
      >
        Final standings
      </Link>
    ) : marketState === "BETWEEN_ROUNDS" ? (
      <Link
        href={`/event/${code}/portfolio`}
        className={buttonClasses({ variant: "secondary" })}
      >
        Review portfolio
      </Link>
    ) : (
      <Link
        href={`/event/${code}/markets`}
        className={buttonClasses({ variant: "secondary" })}
      >
        View markets
      </Link>
    );

  return (
    <Card
      className={cn(
        "flex flex-col gap-5 p-6 md:flex-row md:items-start md:gap-8 md:px-7",
        warning && "border-warning bg-warning-soft",
        className,
      )}
      aria-label="Event status"
    >
      <div className="min-w-0 flex-1">
        <MarketStateBadge state={marketState} />
        <h1 className="mt-3 text-h1 font-semibold tracking-[-0.01em] text-fg-primary">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-3xl text-body text-fg-secondary">
          {roundLine}
          {copy.body}
        </p>
        <RoundTrack state={state} variant="host" className="mt-5 max-w-4xl" />
      </div>
      <div className="flex shrink-0 flex-row items-end justify-between gap-4 md:flex-col md:items-end">
        {active ? (
          <div className="text-left md:text-right">
            <p
              className={cn(
                "font-mono text-[40px] leading-[44px] font-medium tracking-[-0.02em] tabular-nums md:text-[48px] md:leading-[52px]",
                urgent || warning ? "text-warning" : "text-fg-primary",
              )}
              aria-label={`${formatDuration(remaining)} left in the round`}
            >
              {formatDuration(remaining)}
            </p>
            <p className="text-caption text-fg-muted">
              {round?.status === "PAUSED" ? "clock stopped" : "left"}
              {round?.endsAt && round.status === "RUNNING"
                ? ` · ends ${formatClock(round.endsAt)}`
                : ""}
              {marketState === "FROZEN" ? " · clock still running" : ""}
            </p>
          </div>
        ) : (
          <span />
        )}
        {cta}
      </div>
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
  action,
  valueClassName,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  valueClassName?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] leading-[18px] font-medium text-fg-muted">
          {label}
        </p>
        {action}
      </div>
      <div className="flex min-w-0 flex-1 items-end justify-between gap-4">
        <div className="min-w-0">
          <p
            className={cn(
              "mt-2 truncate font-semibold tracking-[-0.015em] text-fg-primary tabular-nums",
              valueClassName ?? "text-value-m",
            )}
          >
            {value}
          </p>
          {sub && (
            <div className="mt-1.5 truncate text-caption text-fg-secondary">
              {sub}
            </div>
          )}
        </div>
        {children}
      </div>
    </Card>
  );
}

/**
 * C4 Participant Dashboard (section 05). In one screen it answers: can I trade, which round, how long is left,
 * my net worth, my return, my cash, my rank, what is waiting for me and what just happened.
 */
export function DashboardScreen() {
  const { state, code, teamId, eventId } = useTerminal();
  const { now, marketState } = useRoundClock(state);
  const summary = useMemo(() => teamSummary(state, teamId)!, [state, teamId]);
  const series = useMemo(
    () => netWorthSeries(state, teamId, "EVENT", now),
    [state, teamId, now],
  );
  const releases = releasesNewestFirst(state);
  const lastSeen = useNewsLastSeen(eventId, teamId);
  const attention = useAttentionItems(state, teamId, now);
  const trades = tradesForTeam(state, teamId);
  const { gainers, losers } = movers(state, 5);

  const published = useMemo(() => publishedLeaderboard(state), [state]);
  const visibility = effectiveParticipantVisibility(state);
  const ownRow = published.rows.find((r) => r.teamId === teamId);
  const shared = useMemo(() => sharedRanks(published.rows), [published]);
  const live = useMemo(() => computeLeaderboard(state), [state]);
  const above = ownRow
    ? live.find((r) => r.rank === ownRow.rank - 1)
    : undefined;
  const profit = summary.netWorth - summary.capitalBase;
  const ownShared = shared[teamId];
  const tiedWith = ownShared?.tied
    ? Object.values(shared).filter((r) => r.rank === ownShared.rank).length - 1
    : 0;
  const cashShare = summary.netWorth
    ? (summary.cash / summary.netWorth) * 100
    : 0;

  const rankValue =
    visibility === "HIDDEN"
      ? "Hidden"
      : ownRow
        ? shared[teamId]?.tied
          ? `=${ownRow.rank}`
          : `#${ownRow.rank}`
        : "—";
  const rankSub =
    visibility === "HIDDEN" ? (
      "Revealed later by the host"
    ) : ownRow ? (
      <span className="inline-flex items-center gap-1.5">
        {ownRow.movement !== 0 && (
          <span className="text-fg-secondary">
            {ownRow.movement > 0 ? "▲" : "▼"} {Math.abs(ownRow.movement)} this
            round
          </span>
        )}
        {above && above.netWorth > summary.netWorth && (
          <span>
            · {formatINR(above.netWorth - summary.netWorth, 0)} to #{above.rank}
          </span>
        )}
        {published.frozenAt && <span className="text-warning">· frozen</span>}
        {ownRow.movement === 0 &&
          !(above && above.netWorth > summary.netWorth) && (
            <span>
              {tiedWith > 0
                ? `Level with ${tiedWith} ${tiedWith === 1 ? "team" : "teams"}`
                : "Holding position"}
            </span>
          )}
      </span>
    ) : (
      "Not ranked yet"
    );

  const newsList = releases.slice(0, 3);

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <EventStatusHero
        state={state}
        code={code}
        teamId={teamId}
        className={cn(marketState === "OPEN" && "max-md:hidden")}
      />

      {/* Phone: attention first, then one combined money card */}
      <div className="flex flex-col gap-4 md:hidden">
        {attention.length > 0 && (
          <NeedsAttention
            state={state}
            teamId={teamId}
            code={code}
            items={attention}
            now={now}
          />
        )}
        <Card className="p-4">
          <p className="text-caption text-fg-muted">Net worth</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-value-l font-semibold tracking-[-0.015em] text-fg-primary tabular-nums">
              {formatINR(summary.netWorth, 0)}
            </span>
            <Delta
              value={summary.returnPct}
              showArrow
              className="font-mono text-caption"
            />
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
            <div>
              <dt className="text-caption text-fg-muted">Cash</dt>
              <dd className="font-medium text-fg-primary tabular-nums">
                {formatINR(summary.cash, 0)}
              </dd>
              <dd className="text-caption text-fg-muted">
                {cashShare.toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-caption text-fg-muted">Rank</dt>
              <dd className="font-medium text-fg-primary">{rankValue}</dd>
              {ownRow && ownRow.movement !== 0 && (
                <dd className="text-caption text-fg-muted">
                  {ownRow.movement > 0 ? "▲" : "▼"} {Math.abs(ownRow.movement)}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-caption text-fg-muted">Return</dt>
              <dd className="font-medium">
                <Delta value={profit} format="inr" decimals={0} />
              </dd>
              <dd className="text-caption text-fg-muted">since start</dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Desktop KPI row */}
      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-[1.7fr_1fr_1fr_1fr]">
        <Kpi
          label="Net worth"
          value={formatINR(summary.netWorth, 0)}
          valueClassName="text-[36px] leading-[44px] tracking-[-0.02em]"
          sub="Cash + stocks at current prices"
          action={
            <Link
              href={`/event/${code}/portfolio`}
              className="inline-flex items-center gap-1 text-caption font-medium text-accent-text hover:underline"
            >
              Portfolio <ArrowRight className="size-3" aria-hidden />
            </Link>
          }
          className="md:col-span-2 xl:col-span-1"
        >
          {series.length > 1 && (
            <Sparkline
              data={series.map((p) => p.value)}
              baseline={summary.capitalBase}
              className="hidden h-14 w-28 shrink-0 2xl:w-36 sm:block"
              strokeWidth={2}
            />
          )}
        </Kpi>
        <Kpi
          label="Total return"
          value={formatPct(summary.returnPct)}
          valueClassName={cn(
            "text-value-m",
            summary.returnPct > 0.00001
              ? "text-positive"
              : summary.returnPct < -0.00001
                ? "text-negative"
                : undefined,
          )}
          sub={
            <>
              <Delta value={profit} format="inr" decimals={0} /> on{" "}
              {formatINR(summary.capitalBase, 0)} capital
            </>
          }
        />
        <Kpi
          label="Available cash"
          value={formatINR(summary.cash, 0)}
          sub={`${cashShare.toFixed(1)}% of net worth`}
        />
        <Kpi
          label="Rank"
          value={
            visibility === "HIDDEN"
              ? "Hidden"
              : `${rankValue}${ownRow ? ` of ${published.rows.length}` : ""}`
          }
          valueClassName={
            visibility === "HIDDEN" ? "text-value-m text-fg-muted" : undefined
          }
          sub={rankSub}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-[minmax(0,1fr)_336px]">
        {/* Holdings and supporting market information */}
        <Card className="order-2 min-w-0 overflow-hidden xl:order-1">
          <Tabs defaultValue="holdings">
            <div className="flex items-center border-b border-border pr-(--panel-p)">
              <TabsList className="min-w-0 flex-1 border-b-0">
                <TabsTrigger value="holdings" count={summary.holdings.length}>
                  Holdings
                </TabsTrigger>
                <TabsTrigger value="movers">Market movers</TabsTrigger>
                <TabsTrigger value="trades" count={trades.length}>
                  Recent trades
                </TabsTrigger>
              </TabsList>
              <Link
                href={`/event/${code}/portfolio`}
                className="ml-auto hidden shrink-0 items-center gap-1 text-[13px] font-medium text-accent-text hover:underline sm:flex"
              >
                Portfolio <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <TabsContent value="holdings" className="max-md:p-3">
              {summary.holdings.length === 0 ? (
                <HoldingsEmpty code={code} />
              ) : (
                <HoldingRows
                  state={state}
                  holdings={summary.holdings}
                  code={code}
                  variant="dashboard"
                />
              )}
            </TabsContent>
            <TabsContent value="movers">
              <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
                <div>
                  <p className="px-(--panel-p) pt-3 text-caption font-medium text-fg-muted">
                    Rising this round
                  </p>
                  <MoversList
                    rows={gainers}
                    hrefFor={stockHref(code)}
                    empty="Nothing has risen this round yet."
                  />
                </div>
                <div>
                  <p className="px-(--panel-p) pt-3 text-caption font-medium text-fg-muted">
                    Falling this round
                  </p>
                  <MoversList
                    rows={losers}
                    hrefFor={stockHref(code)}
                    empty="Nothing has fallen this round yet."
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="trades">
              <TradesTable
                state={state}
                trades={trades.slice(0, 8)}
                perspectiveTeamId={teamId}
                now={now}
              />
            </TabsContent>
          </Tabs>
        </Card>

        <div className="order-1 flex min-w-0 flex-col gap-4 md:gap-5 xl:order-2">
          {attention.length > 0 && (
            <div className="max-md:hidden">
              <NeedsAttention
                state={state}
                teamId={teamId}
                code={code}
                items={attention}
                now={now}
              />
            </div>
          )}
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-h3 font-semibold text-fg-primary">
                Latest news
              </h2>
              <Link
                href={`/event/${code}/news`}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
              >
                All news <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {newsList.length === 0 ? (
              <div className="rounded-md bg-canvas-subtle px-4 py-6 text-center">
                <p className="text-[14px] font-medium text-fg-primary">
                  No news released yet
                </p>
                <p className="mt-1 text-caption text-fg-secondary">
                  Stories appear here and on the projector as the host releases
                  them.
                </p>
              </div>
            ) : (
              newsList.map((release) => (
                <NewsCard
                  key={release.id}
                  state={state}
                  release={release}
                  code={code}
                  unread={release.releasedAt > lastSeen}
                />
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
