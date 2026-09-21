"use client";

import type { ReactNode } from "react";
import { Megaphone, Snowflake } from "lucide-react";
import { BrandMark } from "@/components/shell/brand";
import { Sparkline } from "@/components/ui/sparkline";
import { projectorLeaderboardRows, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { nextPendingRound } from "@/lib/domain/lifecycle";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { MARKET_STATE_LABEL } from "@/lib/domain/trading-gate";
import type { EventState, LeaderboardRow, MarketState, NewsRelease, ResolvedImpact, Round } from "@/lib/domain/types";
import { formatClock, formatDuration, formatMinutes, formatRelative } from "@/lib/format";
import { instrumentOf, instrumentRows, movers, releasesNewestFirst, type InstrumentRow } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

/*
 * Projector type scale (1920×1080 stage): eyebrow 16 · title 40 · table 24–28 · primary metric 56–200 · secondary 18–20.
 * Readable from the back of a room without letting one element take over the screen.
 */

const tone = (value: number) => (value > 0.004 ? "text-positive" : value < -0.004 ? "text-negative" : "text-fg-secondary");

/** Usable content height inside a scene after the title block (stage 1080 − header − ticker − padding − title). */
const LIST_HEIGHT = 720;

/** Round label for the audience; round 0 is the briefing. */
export function roundLabel(state: EventState, round: Round | undefined | null, withTotal = false) {
  if (!round) return "Awaiting round";
  if (round.type === "BRIEFING") return "Briefing";
  const total = state.rounds.filter((r) => r.type === "TRADING").length;
  return withTotal ? `Round ${round.number} of ${total}` : `Round ${round.number}`;
}

function Arrow({ value, className }: { value: number; className?: string }) {
  if (Math.abs(value) < 0.004) return null;
  return (
    <svg viewBox="0 0 8 8" aria-hidden className={cn("shrink-0 fill-current", value < 0 && "rotate-180", className)}>
      <path d="M4 1 7.5 6.5h-7z" />
    </svg>
  );
}

export function SceneTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-8">
      <div>
        <p className="text-[16px] font-semibold tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
        <h2 className="mt-1.5 text-[40px] leading-none font-semibold tracking-tight text-fg-primary">{title}</h2>
      </div>
      {aside && <div className="text-[20px] text-fg-muted">{aside}</div>}
    </div>
  );
}

/* ───────── Standby ───────── */

export function StandbyScene({ state, marketState, joinUrl }: { state: EventState; marketState: MarketState; joinUrl: string }) {
  const next = nextPendingRound(state);
  const status =
    marketState === "NOT_STARTED" ? "The event starts soon" : marketState === "BETWEEN_ROUNDS" ? (next ? `Up next · ${roundLabel(state, next)}: ${next.name}` : "All rounds complete") : MARKET_STATE_LABEL[marketState];
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <BrandMark className="size-16 rounded-xl [&_svg]:size-9" />
      <p className="mt-7 max-w-[1400px] text-[64px] leading-[1.05] font-semibold tracking-tight text-fg-primary">{state.event.name}</p>
      <p className="mt-4 text-[28px] text-fg-secondary">{status}</p>
      <div className="mt-12 flex items-center gap-10 rounded-2xl border-2 border-border-strong bg-surface px-12 py-8">
        <div className="text-left">
          <p className="text-[18px] tracking-[0.18em] text-fg-muted uppercase">Join at</p>
          <p className="mt-1.5 font-mono text-[32px] text-fg-primary">{joinUrl}</p>
        </div>
        <span className="h-20 w-0.5 bg-border-strong" aria-hidden />
        <div className="text-left">
          <p className="text-[18px] tracking-[0.18em] text-fg-muted uppercase">Event code</p>
          <p className="mt-1 font-mono text-[72px] leading-none font-bold tracking-[0.08em] text-accent">{state.event.code}</p>
        </div>
      </div>
      <p className="mt-8 text-[20px] text-fg-muted">
        {state.teams.length} teams · {state.rounds.filter((r) => r.type === "TRADING").length} trading rounds · {state.instruments.filter((i) => i.enabled).length} stocks
      </p>
    </div>
  );
}

/* ───────── Round status ───────── */

export function RoundStatusScene({ state, marketState, remaining, elapsedPct, now }: { state: EventState; marketState: MarketState; remaining: number; elapsedPct: number; now: number }) {
  const round = state.rounds.find((r) => r.id === state.event.currentRoundId);
  const active = round && (round.status === "RUNNING" || round.status === "PAUSED");
  const warning = marketState === "FROZEN" || marketState === "PAUSED";
  const latest = releasesNewestFirst(state)[0];
  return (
    <div className="grid h-full grid-cols-[1.45fr_1fr] gap-14">
      <div className="flex flex-col justify-center">
        <p className="text-[22px] font-semibold tracking-[0.2em] text-accent uppercase">{roundLabel(state, round, true)}</p>
        <h2 className="mt-2 text-[56px] leading-tight font-semibold tracking-tight text-fg-primary">{round?.name ?? state.event.name}</h2>
        <p className={cn("mt-4 font-mono text-[200px] leading-none font-semibold tracking-tight tabular-nums", !active ? "text-fg-muted" : round?.status === "RUNNING" && remaining <= 60_000 ? "text-warning" : "text-fg-primary")}>
          {active ? formatDuration(remaining) : "--:--"}
        </p>
        <div className="mt-8 h-3 w-full overflow-hidden rounded-full bg-surface-hover">
          <div className={cn("h-full rounded-full transition-[width] duration-1000", warning ? "bg-warning" : "bg-accent")} style={{ width: `${round?.status === "ENDED" ? 100 : active ? elapsedPct : 0}%` }} />
        </div>
        <div className={cn("mt-8 inline-flex w-fit items-center gap-4 rounded-xl border-2 px-7 py-3.5 text-[28px] font-semibold", warning ? "border-warning/60 bg-warning/10 text-warning" : marketState === "OPEN" ? "border-accent/50 bg-accent/10 text-fg-primary" : "border-border-strong bg-surface text-fg-secondary")}>
          {marketState === "FROZEN" ? <Snowflake className="size-8" /> : <span className={cn("size-4 rounded-full", marketState === "OPEN" ? "animate-pulse-dot bg-accent" : warning ? "bg-warning" : "bg-fg-muted")} />}
          {marketState === "OPEN" ? "Trading open" : marketState === "FROZEN" ? "Trading frozen" : MARKET_STATE_LABEL[marketState]}
        </div>
      </div>
      <div className="flex flex-col justify-center gap-6">
        <div className="rounded-2xl border-2 border-border bg-surface px-8 py-6">
          <p className="text-[16px] font-semibold tracking-[0.16em] text-fg-muted uppercase">Schedule</p>
          <ol className="mt-3">
            {state.rounds.map((r) => (
              <li key={r.id} className={cn("flex items-center justify-between border-b border-border py-3 text-[22px] last:border-b-0", r.id === round?.id ? "text-fg-primary" : r.status === "ENDED" ? "text-fg-muted" : "text-fg-secondary")}>
                <span className="flex items-center gap-3">
                  <span className={cn("grid size-9 place-items-center rounded-lg text-[18px] font-bold tabular-nums", r.id === round?.id ? "bg-accent text-white" : "bg-surface-hover")}>{r.type === "BRIEFING" ? "B" : r.number}</span>
                  {r.name}
                </span>
                <span className="text-[18px] tabular-nums">{r.status === "ENDED" ? "Done" : r.id === round?.id ? "Now" : formatMinutes(r.durationSeconds)}</span>
              </li>
            ))}
          </ol>
        </div>
        {latest && (
          <div className="rounded-2xl border-2 border-border bg-surface px-8 py-6">
            <p className="text-[16px] font-semibold tracking-[0.16em] text-fg-muted uppercase">Latest news · {formatRelative(latest.releasedAt, now)}</p>
            <p className="mt-2 line-clamp-2 text-[26px] leading-snug font-semibold text-fg-primary">{latest.headline}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[20px]">
              {latest.impacts.slice(0, 3).map((i) => (
                <span key={i.instrumentId} className="tabular-nums">
                  <span className="font-semibold text-fg-primary">{instrumentOf(state, i.instrumentId)?.symbol}</span> <span className={tone(i.appliedPct)}>{formatPct(i.appliedPct)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Leaderboard ───────── */

export function LeaderboardScene({ state }: { state: EventState }) {
  const published = publishedLeaderboard(state);
  const rows = projectorLeaderboardRows(published.rows, state.event.leaderboard.projectorVisibility, state.event.leaderboard.projectorTopN) ?? [];
  const twoColumns = rows.length > 12;
  const perColumn = twoColumns ? Math.ceil(rows.length / 2) : Math.max(1, rows.length);
  const rowHeight = Math.max(34, Math.min(64, Math.floor(LIST_HEIGHT / perColumn)));
  const columns = twoColumns ? [rows.slice(0, perColumn), rows.slice(perColumn)] : [rows];
  const grid = twoColumns ? "grid-cols-[76px_52px_1fr_160px_200px]" : "grid-cols-[96px_72px_1fr_220px_280px]";
  return (
    <div className="flex h-full flex-col">
      <SceneTitle
        eyebrow="Live standings"
        title={state.event.leaderboard.projectorVisibility === "TOP_N" ? `Top ${state.event.leaderboard.projectorTopN} teams` : "Leaderboard"}
        aside={
          published.frozenAt ? (
            <span className="flex items-center gap-2.5 rounded-lg border-2 border-warning/60 bg-warning/10 px-4 py-2 text-[20px] font-semibold text-warning">
              <Snowflake className="size-6" /> Frozen at {formatClock(published.frozenAt)}
            </span>
          ) : (
            "Ranked by return on starting capital"
          )
        }
      />
      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-2xl border-2 border-dashed border-border-strong text-[32px] text-fg-muted">No teams yet</div>
      ) : (
        <div className={cn("grid min-h-0 flex-1 content-start gap-x-12", twoColumns ? "grid-cols-2" : "grid-cols-1")}>
          {columns.map((column, index) => (
            <div key={index} className="flex min-w-0 flex-col">
              <div className={cn("grid gap-x-5 border-b-2 border-border-strong pb-2.5 text-[16px] tracking-[0.14em] text-fg-muted uppercase", grid)}>
                <span className="pl-2">Rank</span>
                <span />
                <span>Team</span>
                <span className="text-right">Return</span>
                <span className="text-right">Net worth</span>
              </div>
              <ol>
                {column.map((row) => (
                  <LeaderRow key={row.teamId} row={row} height={rowHeight} grid={grid} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderRow({ row, height, grid }: { row: LeaderboardRow; height: number; grid: string }) {
  const compact = height < 48;
  return (
    <li className={cn("grid items-center gap-x-5 border-b border-border", grid, row.rank <= 3 && "bg-surface/70")} style={{ height }}>
      <span className={cn("pl-2 font-mono font-bold tabular-nums", compact ? "text-[22px]" : "text-[28px]", row.rank === 1 ? "text-accent" : "text-fg-primary")}>#{row.rank}</span>
      <span className={cn("flex items-center gap-1 font-semibold tabular-nums", compact ? "text-[16px]" : "text-[20px]", row.movement > 0 ? "text-positive" : row.movement < 0 ? "text-negative" : "text-fg-muted")}>
        {row.movement === 0 ? (
          "—"
        ) : (
          <>
            <Arrow value={row.movement} className="size-4" />
            {Math.abs(row.movement)}
          </>
        )}
      </span>
      <span className={cn("truncate font-semibold text-fg-primary", compact ? "text-[22px]" : "text-[28px]")}>{row.teamName}</span>
      <span className={cn("text-right font-mono font-semibold tabular-nums", compact ? "text-[22px]" : "text-[28px]", tone(row.returnPct))}>{formatPct(row.returnPct)}</span>
      <span className={cn("text-right font-mono text-fg-secondary tabular-nums", compact ? "text-[18px]" : "text-[22px]")}>{formatINR(row.netWorth, 0)}</span>
    </li>
  );
}

/* ───────── Market board ───────── */

export function MarketBoardScene({ state }: { state: EventState }) {
  const rows = instrumentRows(state, { enabledOnly: true });
  const twoColumns = rows.length > 9;
  const perColumn = twoColumns ? Math.ceil(rows.length / 2) : Math.max(1, rows.length);
  const rowHeight = Math.max(40, Math.min(80, Math.floor(LIST_HEIGHT / perColumn)));
  const columns = twoColumns ? [rows.slice(0, perColumn), rows.slice(perColumn)] : [rows];
  const grid = twoColumns ? "grid-cols-[1fr_180px_150px_150px]" : "grid-cols-[1fr_220px_170px_170px_240px_130px]";
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow="Market board" title="Stock prices" aside="Change since round open" />
      <div className={cn("grid min-h-0 flex-1 content-start gap-x-12", twoColumns ? "grid-cols-2" : "grid-cols-1")}>
        {columns.map((column, index) => (
          <div key={index} className="flex min-w-0 flex-col">
            <div className={cn("grid gap-x-6 border-b-2 border-border-strong pb-2.5 text-[16px] tracking-[0.14em] text-fg-muted uppercase", grid)}>
              <span>Stock</span>
              <span className="text-right">Price</span>
              <span className="text-right">Round</span>
              {!twoColumns && <span className="text-right">Event</span>}
              <span className="text-right">Trend</span>
              {!twoColumns && <span className="text-right">Status</span>}
            </div>
            <ol>
              {column.map((row) => (
                <MarketRow key={row.instrument.id} row={row} twoColumns={twoColumns} height={rowHeight} grid={grid} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketRow({ row, twoColumns, height, grid }: { row: InstrumentRow; twoColumns: boolean; height: number; grid: string }) {
  const showName = height >= 58;
  return (
    <li className={cn("grid items-center gap-x-6 border-b border-border", grid)} style={{ height }}>
      <span className="min-w-0">
        <span className={cn("flex items-center gap-3 leading-tight font-bold tracking-tight text-fg-primary", height >= 50 ? "text-[28px]" : "text-[24px]")}>
          {row.instrument.symbol}
          {twoColumns && row.instrument.halted && <span className="rounded bg-warning px-2 py-0.5 text-[14px] font-bold text-warning-fg uppercase">Halted</span>}
        </span>
        {showName && <span className="block truncate text-[17px] text-fg-muted">{row.instrument.name}</span>}
      </span>
      <span className={cn("text-right font-mono font-semibold text-fg-primary tabular-nums", height >= 50 ? "text-[30px]" : "text-[24px]")}>{formatPrice(row.price)}</span>
      <span className={cn("flex items-center justify-end gap-2 font-mono font-semibold tabular-nums", height >= 50 ? "text-[26px]" : "text-[22px]", tone(row.roundChangePct))}>
        <Arrow value={row.roundChangePct} className="size-4" />
        {formatPct(row.roundChangePct)}
      </span>
      {!twoColumns && <span className={cn("text-right font-mono text-[22px] tabular-nums", tone(row.eventChangePct))}>{formatPct(row.eventChangePct)}</span>}
      <Sparkline data={row.sparkline} baseline={row.snapshot.roundOpenPrice} className={cn("ml-auto", twoColumns ? "h-10 w-[140px]" : "h-11 w-[220px]")} strokeWidth={2.5} />
      {!twoColumns && (
        <span className="text-right">
          {row.instrument.halted ? <span className="rounded-md bg-warning px-2.5 py-1 text-[16px] font-bold text-warning-fg uppercase">Halted</span> : <span className="text-[18px] text-fg-muted">Trading</span>}
        </span>
      )}
    </li>
  );
}

/* ───────── Top movers ───────── */

export function TopMoversScene({ state }: { state: EventState }) {
  const { gainers, losers } = movers(state, 5);
  const column = (title: string, rows: InstrumentRow[], empty: string, positive: boolean) => (
    <div className="flex flex-col">
      <p className={cn("mb-3 text-[20px] font-semibold tracking-[0.14em] uppercase", positive ? "text-positive" : "text-negative")}>{title}</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border-strong px-8 py-14 text-center text-[24px] text-fg-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.instrument.id} className="grid h-[112px] grid-cols-[48px_1fr_170px_auto] items-center gap-6 rounded-2xl border-2 border-border bg-surface px-7">
              <span className="font-mono text-[26px] font-bold text-fg-muted">{index + 1}</span>
              <span className="min-w-0">
                <span className="block text-[32px] leading-tight font-bold text-fg-primary">{row.instrument.symbol}</span>
                <span className="block truncate text-[18px] text-fg-muted">
                  ₹{formatPrice(row.price)} · {row.instrument.name}
                </span>
              </span>
              <Sparkline data={row.sparkline} baseline={row.snapshot.roundOpenPrice} className="h-12 w-[170px]" strokeWidth={2.5} />
              <span className={cn("min-w-[170px] text-right font-mono text-[36px] font-bold tabular-nums", tone(row.roundChangePct))}>{formatPct(row.roundChangePct)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow="This round" title="Top movers" aside="Change since round open" />
      <div className="grid flex-1 grid-cols-2 gap-10">
        {column("Top gainers", gainers, "No gainers yet", true)}
        {column("Top losers", losers, "No losers yet", false)}
      </div>
    </div>
  );
}

/* ───────── News wall (newsroom) ───────── */

export function NewsWallScene({ state, now }: { state: EventState; now: number }) {
  const [lead, ...others] = releasesNewestFirst(state);
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow="Newsroom" title="Market news" aside={lead ? `${state.newsReleases.length} stories released` : undefined} />
      {!lead ? (
        <div className="grid flex-1 place-items-center rounded-2xl border-2 border-dashed border-border-strong text-[32px] text-fg-muted">No news released yet</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-8">
          <article className="flex min-h-0 flex-col self-start rounded-2xl border-2 border-accent/40 bg-surface px-10 py-8">
            <p className="text-[18px] text-fg-muted">
              <span className="font-semibold text-accent uppercase">Latest</span> · {formatClock(lead.releasedAt)} · {formatRelative(lead.releasedAt, now)}
            </p>
            <h3 className="mt-3 line-clamp-3 text-[44px] leading-[1.12] font-semibold text-fg-primary">{lead.headline}</h3>
            {lead.body && <p className="mt-4 line-clamp-3 text-[22px] leading-relaxed text-fg-secondary">{lead.body}</p>}
            <div className="mt-7 flex flex-col gap-3 border-t-2 border-border pt-5">
              {lead.impacts.slice(0, 4).map((impact) => (
                <ProjectorImpactRow key={impact.instrumentId} state={state} impact={impact} />
              ))}
            </div>
          </article>
          <ol className="flex min-h-0 flex-col gap-4">
            {others.slice(0, 3).map((release) => (
              <NewsListItem key={release.id} state={state} release={release} now={now} />
            ))}
            {others.length === 0 && <li className="grid flex-1 place-items-center rounded-2xl border-2 border-dashed border-border-strong text-[22px] text-fg-muted">Earlier stories appear here</li>}
          </ol>
        </div>
      )}
    </div>
  );
}

function NewsListItem({ state, release, now }: { state: EventState; release: NewsRelease; now: number }) {
  const top = release.impacts[0];
  return (
    <li className="rounded-2xl border-2 border-border bg-surface px-7 py-5">
      <p className="text-[16px] text-fg-muted tabular-nums">
        {formatClock(release.releasedAt)} · {formatRelative(release.releasedAt, now)}
      </p>
      <p className="mt-1 line-clamp-2 text-[24px] leading-snug font-semibold text-fg-primary">{release.headline}</p>
      {top && (
        <p className="mt-1.5 text-[20px] tabular-nums">
          <span className="font-semibold text-fg-primary">{instrumentOf(state, top.instrumentId)?.symbol}</span> <span className={tone(top.appliedPct)}>{formatPct(top.appliedPct)}</span>
          {release.impacts.length > 1 && <span className="text-fg-muted"> · +{release.impacts.length - 1} more</span>}
        </p>
      )}
    </li>
  );
}

export function ProjectorImpactRow({ state, impact, size = "md" }: { state: EventState; impact: ResolvedImpact; size?: "md" | "lg" }) {
  const symbol = instrumentOf(state, impact.instrumentId)?.symbol;
  const pct = <span className={cn("shrink-0 rounded-lg px-3 py-1 font-mono font-bold", size === "lg" ? "text-[32px]" : "text-[24px]", impact.appliedPct >= 0 ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}>{formatPct(impact.appliedPct)}</span>;
  const prices = (
    <span className={cn("font-mono whitespace-nowrap text-fg-secondary", size === "lg" ? "text-[28px]" : "text-[22px]")}>
      ₹{formatPrice(impact.previousPrice)} <span className="text-fg-muted">→</span> <span className="font-semibold text-fg-primary">₹{formatPrice(impact.newPrice)}</span>
    </span>
  );
  if (size === "lg") {
    return (
      <div className="flex flex-col gap-2 tabular-nums">
        <div className="flex items-center justify-between gap-6">
          <span className="text-[36px] leading-none font-bold text-fg-primary">{symbol}</span>
          {pct}
        </div>
        {prices}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[130px_1fr_auto] items-center gap-5 tabular-nums">
      <span className="truncate text-[26px] font-bold text-fg-primary">{symbol}</span>
      {prices}
      {pct}
    </div>
  );
}

/* ───────── Custom message ───────── */

export function MessageScene({ title, body, eventName, tone: messageTone = "default" }: { title: string; body: string; eventName: string; tone?: "default" | "announcement" }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className={cn("grid size-20 place-items-center rounded-full", messageTone === "announcement" ? "bg-accent/15 text-accent" : "bg-surface-hover text-fg-secondary")}>
        <Megaphone className="size-10" />
      </span>
      <p className="mt-6 text-[18px] font-semibold tracking-[0.2em] text-fg-muted uppercase">{eventName}</p>
      <h2 className="mt-3 max-w-[1500px] text-[72px] leading-[1.08] font-semibold tracking-tight text-fg-primary">{title}</h2>
      {body && <p className="mt-6 max-w-[1300px] text-[32px] leading-snug text-fg-secondary">{body}</p>}
    </div>
  );
}

/* ───────── Final results ───────── */

export function FinalResultsScene({ state }: { state: EventState }) {
  const rows = publishedLeaderboard(state).rows;
  const podium = [rows[1], rows[0], rows[2]];
  const heights = ["h-[230px]", "h-[300px]", "h-[180px]"];
  return (
    <div className="flex h-full flex-col">
      <SceneTitle eyebrow={state.event.name} title="Final results" aside="Ranked by return on starting capital" />
      <div className="grid flex-1 grid-cols-[1.3fr_1fr] gap-12">
        <div className="flex items-end justify-center gap-5">
          {podium.map((row, index) =>
            row ? (
              <div key={row.teamId} className="flex w-[280px] flex-col items-center">
                <p className="max-w-full truncate text-center text-[30px] leading-tight font-semibold text-fg-primary">{row.teamName}</p>
                <p className={cn("mt-1 font-mono text-[28px] font-semibold tabular-nums", tone(row.returnPct))}>{formatPct(row.returnPct)}</p>
                <p className="font-mono text-[18px] text-fg-muted tabular-nums">{formatINR(row.netWorth, 0)}</p>
                <div className={cn("mt-4 flex w-full items-start justify-center rounded-t-2xl border-2 border-b-0 pt-5", heights[index], row.rank === 1 ? "border-accent/60 bg-accent/15" : "border-border-strong bg-surface")}>
                  <span className={cn("font-mono text-[72px] leading-none font-bold", row.rank === 1 ? "text-accent" : "text-fg-secondary")}>{row.rank}</span>
                </div>
              </div>
            ) : (
              <div key={index} className="w-[280px]" />
            ),
          )}
        </div>
        <ol className="flex flex-col justify-center">
          {rows.slice(3, 14).map((row) => (
            <li key={row.teamId} className="grid h-[54px] grid-cols-[80px_1fr_180px] items-center gap-5 border-b border-border">
              <span className="font-mono text-[24px] font-bold text-fg-muted">#{row.rank}</span>
              <span className="truncate text-[24px] font-medium text-fg-primary">{row.teamName}</span>
              <span className={cn("text-right font-mono text-[24px] font-semibold tabular-nums", tone(row.returnPct))}>{formatPct(row.returnPct)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
