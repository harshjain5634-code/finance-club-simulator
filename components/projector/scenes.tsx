"use client";

import type { ReactNode } from "react";
import { Snowflake } from "lucide-react";
import { BrandMark } from "@/components/shell/brand";
import { Sparkline } from "@/components/ui/sparkline";
import { projectorLeaderboardRows, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { nextPendingRound } from "@/lib/domain/lifecycle";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { MARKET_STATE_LABEL } from "@/lib/domain/trading-gate";
import type { EventState, LeaderboardRow, MarketState, NewsRelease } from "@/lib/domain/types";
import { formatClock, formatDuration, formatMinutes, formatRelative } from "@/lib/format";
import { instrumentOf, instrumentRows, movers, releasesNewestFirst, type InstrumentRow } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

const tone = (value: number) => (value > 0.004 ? "text-positive" : value < -0.004 ? "text-negative" : "text-fg-secondary");

function Arrow({ value, className }: { value: number; className?: string }) {
  if (Math.abs(value) < 0.004) return null;
  return (
    <svg viewBox="0 0 8 8" aria-hidden className={cn("fill-current", value < 0 && "rotate-180", className)}>
      <path d="M4 1 7.5 6.5h-7z" />
    </svg>
  );
}

export function SceneTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-10 flex items-end justify-between">
      <div>
        <p className="text-[22px] font-semibold tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
        <h2 className="mt-2 text-[64px] leading-none font-semibold tracking-tight text-fg-primary">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

/* ───────── Standby ───────── */

export function StandbyScene({ state, marketState, joinUrl }: { state: EventState; marketState: MarketState; joinUrl: string }) {
  const next = nextPendingRound(state);
  const status =
    marketState === "NOT_STARTED" ? "The event starts soon" : marketState === "BETWEEN_ROUNDS" ? (next ? `Next up · Round ${next.number}: ${next.name}` : "All rounds complete") : MARKET_STATE_LABEL[marketState];
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <BrandMark className="size-24 rounded-2xl [&_svg]:size-14" />
      <h1 className="mt-10 max-w-[1500px] text-[104px] leading-[1.02] font-semibold tracking-tight text-fg-primary">{state.event.name}</h1>
      <p className="mt-6 text-[40px] text-fg-secondary">{status}</p>
      <div className="mt-16 flex items-center gap-12 rounded-3xl border-2 border-border-strong bg-surface px-16 py-10">
        <div className="text-left">
          <p className="text-[26px] tracking-[0.18em] text-fg-muted uppercase">Join at</p>
          <p className="mt-2 font-mono text-[44px] text-fg-primary">{joinUrl}</p>
        </div>
        <span className="h-28 w-0.5 bg-border-strong" aria-hidden />
        <div className="text-left">
          <p className="text-[26px] tracking-[0.18em] text-fg-muted uppercase">Event code</p>
          <p className="mt-1 font-mono text-[96px] leading-none font-bold tracking-[0.08em] text-accent">{state.event.code}</p>
        </div>
      </div>
      <p className="mt-10 text-[28px] text-fg-muted">
        {state.teams.length} teams · {state.rounds.length} rounds · {state.instruments.filter((i) => i.enabled).length} stocks
      </p>
    </div>
  );
}

/* ───────── Round status ───────── */

export function RoundStatusScene({ state, marketState, remaining, elapsedPct }: { state: EventState; marketState: MarketState; remaining: number; elapsedPct: number }) {
  const round = state.rounds.find((r) => r.id === state.event.currentRoundId);
  const next = nextPendingRound(state);
  const active = round && (round.status === "RUNNING" || round.status === "PAUSED");
  const warning = marketState === "FROZEN" || marketState === "PAUSED";
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-[40px] font-semibold tracking-[0.22em] text-accent uppercase">{round ? `Round ${round.number}` : "Awaiting round"}</p>
      <h2 className="mt-3 text-[80px] leading-none font-semibold tracking-tight text-fg-primary">{round?.name ?? state.event.name}</h2>
      <p className={cn("mt-8 font-mono text-[280px] leading-none font-semibold tracking-tight tabular-nums", active && remaining <= 60_000 && round?.status === "RUNNING" ? "text-warning" : "text-fg-primary", !active && "text-fg-muted")}>
        {active ? formatDuration(remaining) : "--:--"}
      </p>
      <div className="mt-10 h-4 w-[1200px] overflow-hidden rounded-full bg-surface-hover">
        <div className={cn("h-full rounded-full transition-[width] duration-1000", warning ? "bg-warning" : "bg-accent")} style={{ width: `${round?.status === "ENDED" ? 100 : active ? elapsedPct : 0}%` }} />
      </div>
      <div className={cn("mt-12 inline-flex items-center gap-5 rounded-2xl border-2 px-10 py-5 text-[44px] font-semibold", warning ? "border-warning/60 bg-warning/10 text-warning" : marketState === "OPEN" ? "border-accent/50 bg-accent/10 text-fg-primary" : "border-border-strong bg-surface text-fg-secondary")}>
        {marketState === "FROZEN" ? <Snowflake className="size-12" /> : <span className={cn("size-6 rounded-full", marketState === "OPEN" ? "animate-pulse-dot bg-accent" : warning ? "bg-warning" : "bg-fg-muted")} />}
        {marketState === "OPEN" ? "Trading open" : marketState === "FROZEN" ? "Trading frozen" : MARKET_STATE_LABEL[marketState]}
      </div>
      {!active && next && <p className="mt-8 text-[32px] text-fg-secondary">Next: Round {next.number} · {next.name} ({formatMinutes(next.durationSeconds)})</p>}
    </div>
  );
}

/* ───────── Leaderboard ───────── */

export function LeaderboardScene({ state }: { state: EventState }) {
  const published = publishedLeaderboard(state);
  const rows = projectorLeaderboardRows(published.rows, state.event.leaderboard.projectorVisibility, state.event.leaderboard.projectorTopN) ?? [];
  const visible = rows.slice(0, 10);
  return (
    <div className="flex h-full flex-col">
      <SceneTitle
        eyebrow="Live standings"
        title="Leaderboard"
        aside={
          published.frozenAt ? (
            <span className="flex items-center gap-3 rounded-xl border-2 border-warning/60 bg-warning/10 px-6 py-3 text-[28px] font-semibold text-warning">
              <Snowflake className="size-8" /> Frozen at {formatClock(published.frozenAt)}
            </span>
          ) : (
            <span className="text-[28px] text-fg-muted">Ranked by return on capital</span>
          )
        }
      />
      <div className="grid grid-cols-[120px_90px_1fr_260px_340px] items-center gap-x-6 border-b-2 border-border-strong pb-3 text-[22px] tracking-[0.14em] text-fg-muted uppercase">
        <span>Rank</span>
        <span />
        <span>Team</span>
        <span className="text-right">Return</span>
        <span className="text-right">Net worth</span>
      </div>
      <ol className="flex-1">
        {visible.map((row) => (
          <LeaderRow key={row.teamId} row={row} />
        ))}
      </ol>
    </div>
  );
}

function LeaderRow({ row }: { row: LeaderboardRow }) {
  return (
    <li className={cn("grid h-[68px] grid-cols-[120px_90px_1fr_260px_340px] items-center gap-x-6 border-b border-border", row.rank <= 3 && "bg-surface/60")}>
      <span className={cn("font-mono text-[44px] font-bold tabular-nums", row.rank === 1 ? "text-accent" : "text-fg-primary")}>#{row.rank}</span>
      <span className={cn("flex items-center gap-1 text-[28px] font-semibold tabular-nums", row.movement > 0 ? "text-positive" : row.movement < 0 ? "text-negative" : "text-fg-muted")}>
        {row.movement === 0 ? "—" : <><Arrow value={row.movement} className="size-5" />{Math.abs(row.movement)}</>}
      </span>
      <span className="truncate text-[40px] font-semibold text-fg-primary">{row.teamName}</span>
      <span className={cn("text-right font-mono text-[40px] font-semibold tabular-nums", tone(row.returnPct))}>{formatPct(row.returnPct)}</span>
      <span className="text-right font-mono text-[34px] text-fg-secondary tabular-nums">{formatINR(row.netWorth, 0)}</span>
    </li>
  );
}

/* ───────── Market board ───────── */

export function MarketBoardScene({ state }: { state: EventState }) {
  const rows = instrumentRows(state, { enabledOnly: true });
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow="Market board" title="Stock prices" aside={<span className="text-[28px] text-fg-muted">Change since round open</span>} />
      <div className="grid flex-1 grid-cols-4 grid-rows-2 gap-6">
        {rows.slice(0, 8).map((row) => (
          <MarketCard key={row.instrument.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function MarketCard({ row }: { row: InstrumentRow }) {
  return (
    <div className={cn("flex flex-col justify-between rounded-2xl border-2 bg-surface px-8 py-7", row.instrument.halted ? "border-warning/60" : "border-border")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[46px] leading-none font-bold tracking-tight text-fg-primary">{row.instrument.symbol}</p>
          <p className="mt-2 truncate text-[22px] text-fg-muted">{row.instrument.name}</p>
        </div>
        {row.instrument.halted && <span className="rounded-lg bg-warning px-3 py-1 text-[20px] font-bold tracking-wide text-warning-fg uppercase">Halted</span>}
      </div>
      <Sparkline data={row.sparkline} baseline={row.snapshot.roundOpenPrice} className="h-20 w-full" strokeWidth={3} />
      <div className="flex items-end justify-between gap-3">
        <p className="font-mono text-[50px] leading-none font-semibold text-fg-primary tabular-nums">₹{formatPrice(row.price)}</p>
        <p className={cn("flex items-center gap-2 font-mono text-[32px] font-semibold tabular-nums", tone(row.roundChangePct))}>
          <Arrow value={row.roundChangePct} className="size-5" />
          {formatPct(row.roundChangePct)}
        </p>
      </div>
    </div>
  );
}

/* ───────── Top movers ───────── */

export function TopMoversScene({ state }: { state: EventState }) {
  const { gainers, losers } = movers(state, 5);
  const column = (title: string, rows: InstrumentRow[], empty: string, positive: boolean) => (
    <div className="flex flex-col">
      <p className={cn("mb-5 text-[34px] font-semibold tracking-[0.12em] uppercase", positive ? "text-positive" : "text-negative")}>{title}</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border-strong px-8 py-16 text-center text-[32px] text-fg-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <li key={row.instrument.id} className="grid h-[120px] grid-cols-[70px_1fr_auto] items-center gap-6 rounded-2xl border-2 border-border bg-surface px-8">
              <span className="font-mono text-[40px] font-bold text-fg-muted">{index + 1}</span>
              <span className="min-w-0">
                <span className="block text-[44px] leading-tight font-bold text-fg-primary">{row.instrument.symbol}</span>
                <span className="block truncate text-[22px] text-fg-muted">₹{formatPrice(row.price)} · {row.instrument.name}</span>
              </span>
              <span className={cn("font-mono text-[52px] font-bold tabular-nums", tone(row.roundChangePct))}>{formatPct(row.roundChangePct)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow="This round" title="Top movers" />
      <div className="grid flex-1 grid-cols-2 gap-12">
        {column("Top gainers", gainers, "No gainers yet", true)}
        {column("Top losers", losers, "No losers yet", false)}
      </div>
    </div>
  );
}

/* ───────── News wall ───────── */

export function NewsWallScene({ state, now }: { state: EventState; now: number }) {
  const releases = releasesNewestFirst(state).slice(0, 4);
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow="Newsroom" title="Latest headlines" />
      {releases.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-3xl border-2 border-dashed border-border-strong text-[40px] text-fg-muted">No news released yet</div>
      ) : (
        <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-6">
          {releases.map((release, index) => (
            <NewsCard key={release.id} state={state} release={release} now={now} highlight={index === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsCard({ state, release, now, highlight }: { state: EventState; release: NewsRelease; now: number; highlight: boolean }) {
  return (
    <article className={cn("flex flex-col justify-between rounded-2xl border-2 bg-surface px-9 py-8", highlight ? "border-accent/50" : "border-border")}>
      <div>
        <p className="text-[22px] text-fg-muted">{formatClock(release.releasedAt)} · {formatRelative(release.releasedAt, now)}</p>
        <h3 className="mt-3 line-clamp-3 text-[40px] leading-[1.15] font-semibold text-fg-primary">{release.headline}</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {release.impacts.map((impact) => (
          <span key={impact.instrumentId} className="flex items-center gap-3 rounded-xl bg-surface-raised px-5 py-2.5 text-[28px]">
            <span className="font-bold text-fg-primary">{instrumentOf(state, impact.instrumentId)?.symbol}</span>
            <span className={cn("font-mono font-semibold tabular-nums", tone(impact.appliedPct))}>{formatPct(impact.appliedPct)}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

/* ───────── Final results ───────── */

export function FinalResultsScene({ state }: { state: EventState }) {
  const rows = publishedLeaderboard(state).rows;
  const podium = [rows[1], rows[0], rows[2]];
  const heights = ["h-[300px]", "h-[400px]", "h-[230px]"];
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow={state.event.name} title="Final results" />
      <div className="grid flex-1 grid-cols-[1.35fr_1fr] gap-14">
        <div className="flex items-end justify-center gap-6">
          {podium.map((row, index) =>
            row ? (
              <div key={row.teamId} className="flex w-[300px] flex-col items-center">
                <p className="max-w-full truncate text-center text-[38px] leading-tight font-semibold text-fg-primary">{row.teamName}</p>
                <p className={cn("mt-2 font-mono text-[34px] font-semibold tabular-nums", tone(row.returnPct))}>{formatPct(row.returnPct)}</p>
                <p className="font-mono text-[24px] text-fg-muted tabular-nums">{formatINR(row.netWorth, 0)}</p>
                <div className={cn("mt-5 flex w-full items-start justify-center rounded-t-2xl border-2 border-b-0 pt-6", heights[index], row.rank === 1 ? "border-accent/60 bg-accent/15" : "border-border-strong bg-surface")}>
                  <span className={cn("font-mono text-[96px] leading-none font-bold", row.rank === 1 ? "text-accent" : "text-fg-secondary")}>{row.rank}</span>
                </div>
              </div>
            ) : (
              <div key={index} className="w-[300px]" />
            ),
          )}
        </div>
        <ol className="flex flex-col justify-center">
          {rows.slice(3, 12).map((row) => (
            <li key={row.teamId} className="grid h-[64px] grid-cols-[90px_1fr_220px] items-center gap-5 border-b border-border">
              <span className="font-mono text-[32px] font-bold text-fg-muted">#{row.rank}</span>
              <span className="truncate text-[32px] font-medium text-fg-primary">{row.teamName}</span>
              <span className={cn("text-right font-mono text-[32px] font-semibold tabular-nums", tone(row.returnPct))}>{formatPct(row.returnPct)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
