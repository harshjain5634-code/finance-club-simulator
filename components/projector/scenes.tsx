"use client";

import type { ReactNode } from "react";
import { Megaphone, Snowflake } from "lucide-react";
import { BrandMark } from "@/components/shell/brand";
import { Sparkline } from "@/components/ui/sparkline";
import { RoundTrack } from "@/components/market/round-track";
import { projectorLeaderboardRows, publishedLeaderboard, sharedRanks } from "@/lib/domain/leaderboard";
import { nextPendingRound } from "@/lib/domain/lifecycle";
import { formatCompactINR, formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { MARKET_STATE_DISPLAY } from "@/components/market/status";
import type { EventState, LeaderboardRow, MarketState, NewsRelease, ResolvedImpact, Round } from "@/lib/domain/types";
import { formatClock, formatDuration, formatMinutes, formatRelative } from "@/lib/format";
import { instrumentOf, instrumentRows, movers, releasesNewestFirst, tradingVolume, type InstrumentRow } from "@/lib/mock/selectors";
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
        <p className="text-[16px] font-semibold tracking-[0.2em] text-accent-text uppercase">{eyebrow}</p>
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
    marketState === "NOT_STARTED" ? "The event starts soon" : marketState === "BETWEEN_ROUNDS" ? (next ? `Up next · ${roundLabel(state, next)}: ${next.name}` : "All rounds complete") : MARKET_STATE_DISPLAY[marketState];
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
          <p className="mt-1 font-mono text-[72px] leading-none font-bold tracking-[0.08em] text-accent-text">{state.event.code}</p>
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
  const next = nextPendingRound(state);
  const volume = tradingVolume(state, round?.id ?? null);
  const activeTeams = state.teams.filter((t) => t.status === "ACTIVE").length;
  void elapsedPct;
  void now;

  const tiles: { label: string; value: string }[] = [
    { label: "Teams trading", value: `${activeTeams} of ${state.teams.length}` },
    { label: "Trades this round", value: String(volume.count) },
    { label: "Traded this round", value: formatCompactINR(volume.value) },
    { label: "Next", value: next ? `${next.type === "BRIEFING" ? "Briefing" : `Round ${next.number}`} · ${formatMinutes(next.durationSeconds)}` : "Final results" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-[22px] font-semibold tracking-[0.2em] text-fg-muted uppercase">{roundLabel(state, round, true)}</p>
        <h2 className="mt-2 text-[56px] leading-tight font-semibold tracking-tight text-fg-primary">{round?.name ?? state.event.name}</h2>
        <p className={cn("mt-2 font-mono text-[190px] leading-none font-semibold tracking-tight tabular-nums", !active ? "text-fg-muted" : round?.status === "RUNNING" && remaining <= 60_000 ? "text-warning" : "text-fg-primary")}>
          {active ? formatDuration(remaining) : "--:--"}
        </p>
        {warning ? (
          <p className="mt-4 flex items-center gap-3 text-[28px] font-semibold text-warning">
            <Snowflake className="size-8" />
            {marketState === "FROZEN" ? "Trading frozen · the round clock keeps running" : "Paused by the host"}
          </p>
        ) : (
          <p className="mt-4 text-[24px] text-fg-secondary">
            {active && round?.endsAt ? `left · round ends at ${formatClock(round.endsAt)}` : marketState === "BETWEEN_ROUNDS" ? "waiting for the host to start the next round" : MARKET_STATE_DISPLAY[marketState]}
          </p>
        )}
      </div>

      <RoundTrack state={state} variant="stage" className="shrink-0" />

      <div className="mt-9 grid shrink-0 grid-cols-4 gap-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl bg-surface px-7 py-5">
            <p className="text-[20px] text-fg-muted">{tile.label}</p>
            <p className="mt-1 font-mono text-[34px] leading-tight font-medium text-fg-primary tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Leaderboard ───────── */

export function LeaderboardScene({ state }: { state: EventState }) {
  const published = publishedLeaderboard(state);
  const rows = projectorLeaderboardRows(published.rows, state.event.leaderboard.projectorVisibility, state.event.leaderboard.projectorTopN) ?? [];
  const ranks = sharedRanks(published.rows);
  const twoColumns = rows.length > 12;
  const columnCount = twoColumns ? 2 : 1;
  // Rows never shrink below 34px on a projector, so a long field is capped to what actually fits on the stage and
  // the rest is summarised underneath — otherwise the last teams render under the ticker and off the screen.
  const MIN_ROW = 34;
  const COLUMN_HEADER = 44;
  const FOOTER = 48;
  const rowsArea = LIST_HEIGHT - COLUMN_HEADER;
  const fitsWithoutFooter = Math.max(1, Math.floor(rowsArea / MIN_ROW)) * columnCount;
  // A longer field than the stage can hold: keep a line free for the "+ N more" summary and drop the overflow.
  const capacityPerColumn = Math.max(1, Math.floor((rows.length > fitsWithoutFooter ? rowsArea - FOOTER : rowsArea) / MIN_ROW));
  const shown = Math.min(rows.length, capacityPerColumn * columnCount);
  const hidden = rows.length - shown;
  const visible = rows.slice(0, shown);
  const perColumn = twoColumns ? Math.ceil(visible.length / 2) : Math.max(1, visible.length);
  const rowHeight = Math.max(MIN_ROW, Math.min(64, Math.floor((hidden > 0 ? rowsArea - FOOTER : rowsArea) / perColumn)));
  const columns = twoColumns ? [visible.slice(0, perColumn), visible.slice(perColumn)] : [visible];
  const grid = twoColumns ? "grid-cols-[76px_52px_1fr_200px_150px]" : "grid-cols-[88px_80px_1fr_300px_190px]";
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
        <div className={cn("grid min-h-0 flex-1 content-start gap-x-12 overflow-hidden", twoColumns ? "grid-cols-2" : "grid-cols-1")}>
          {columns.map((column, index) => (
            <div key={index} className="flex min-w-0 flex-col">
              <div className={cn("grid gap-x-5 border-b-2 border-border-strong pb-2.5 text-[16px] tracking-[0.14em] text-fg-muted uppercase", grid)}>
                <span className="pl-2">Rank</span>
                <span />
                <span>Team</span>
                <span className="text-right">Net worth</span>
                <span className="text-right">Return</span>
              </div>
              <ol>
                {column.map((row) => (
                  <LeaderRow key={row.teamId} row={row} label={ranks[row.teamId]?.label.replace("#", "") ?? String(row.rank)} height={rowHeight} grid={grid} podium={!twoColumns && row.rank <= 3} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {hidden > 0 && (
        <p className="mt-4 shrink-0 text-[20px] text-fg-muted">
          + {hidden} more {hidden === 1 ? "team" : "teams"} · full table on your screen under Leaderboard
        </p>
      )}
    </div>
  );
}

function LeaderRow({ row, label, height, grid, podium }: { row: LeaderboardRow; label: string; height: number; grid: string; podium: boolean }) {
  const compact = height < 48;
  const big = podium && !compact;
  return (
    <li className={cn("grid items-center gap-x-5", grid, podium ? "mb-1.5 rounded-lg bg-surface" : "border-b border-border")} style={{ height: big ? Math.min(76, height + 10) : height }}>
      <span className={cn("pl-5 font-mono tabular-nums", big ? "text-[34px]" : compact ? "text-[22px]" : "text-[26px]", row.rank === 1 ? "font-semibold text-accent-text" : "text-fg-primary")}>{label}</span>
      <span className={cn("flex items-center gap-1 tabular-nums", compact ? "text-[16px]" : "text-[20px]", row.movement !== 0 ? "text-fg-secondary" : "text-fg-muted")}>
        {row.movement === 0 ? (
          "—"
        ) : (
          <>
            <Arrow value={row.movement} className="size-4" />
            {Math.abs(row.movement)}
          </>
        )}
      </span>
      <span className={cn("truncate text-fg-primary", big ? "text-[40px] font-semibold tracking-[-0.01em]" : compact ? "text-[22px]" : "text-[28px]")}>{row.teamName}</span>
      <span className={cn("text-right font-mono tabular-nums text-fg-primary", big ? "text-[40px] font-medium" : compact ? "text-[20px]" : "text-[26px]")}>{formatINR(row.netWorth, 0)}</span>
      <span className="flex justify-end pr-5">
        <span className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono tabular-nums", compact ? "text-[18px]" : "text-[20px]", row.returnPct > 0.004 ? "bg-positive/15 text-positive" : row.returnPct < -0.004 ? "bg-negative/15 text-negative" : "bg-surface-hover text-fg-secondary")}>
          <Arrow value={row.returnPct} className="size-3" />
          {formatPct(Math.abs(row.returnPct), { signed: false })}
        </span>
      </span>
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
              <span className="font-semibold text-accent-text uppercase">Latest</span> · {formatClock(lead.releasedAt)} · {formatRelative(lead.releasedAt, now)}
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

export function ProjectorImpactRow({ state, impact, size = "md" }: { state: EventState; impact: ResolvedImpact; size?: "md" | "lg" | "chip" }) {
  const symbol = instrumentOf(state, impact.instrumentId)?.symbol;
  if (size === "chip") {
    return (
      <div className="flex items-center gap-6 font-mono text-[36px] tabular-nums">
        <span className="font-sans font-semibold text-fg-primary">{symbol}</span>
        <span className="text-fg-primary">₹{formatPrice(impact.previousPrice)}</span>
        <span className="text-fg-muted">→</span>
        <span className="font-medium text-fg-primary">₹{formatPrice(impact.newPrice)}</span>
        <span className={cn("flex items-center gap-2 rounded-md px-3 py-1 text-[24px] font-semibold", impact.appliedPct >= 0 ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}>
          <Arrow value={impact.appliedPct} className="size-4" />
          {formatPct(Math.abs(impact.appliedPct), { signed: false })}
        </span>
      </div>
    );
  }
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
      <span className={cn("grid size-20 place-items-center rounded-full", messageTone === "announcement" ? "bg-accent/15 text-accent-text" : "bg-surface-hover text-fg-secondary")}>
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
  const ranks = sharedRanks(rows);
  const label = (row: LeaderboardRow) => ranks[row.teamId]?.label.replace("#", "") ?? String(row.rank);
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
                  <span className={cn("font-mono text-[72px] leading-none font-bold", row.rank === 1 ? "text-accent-text" : "text-fg-secondary")}>{label(row)}</span>
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
              <span className="font-mono text-[24px] font-bold text-fg-muted">{label(row)}</span>
              <span className="truncate text-[24px] font-medium text-fg-primary">{row.teamName}</span>
              <span className={cn("text-right font-mono text-[24px] font-semibold tabular-nums", tone(row.returnPct))}>{formatPct(row.returnPct)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
