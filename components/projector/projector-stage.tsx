"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/shell/brand";
import { useRoundClock } from "@/components/market/round-clock";
import { formatPct, formatPrice } from "@/lib/domain/money";
import { MARKET_STATE_LABEL } from "@/lib/domain/trading-gate";
import type { EventState, MarketState, NewsRelease, ProjectorScene } from "@/lib/domain/types";
import { formatClock, formatDuration } from "@/lib/format";
import { instrumentOf, instrumentRows } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { FinalResultsScene, LeaderboardScene, MarketBoardScene, NewsWallScene, RoundStatusScene, StandbyScene, TopMoversScene } from "./scenes";

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export const SCENE_LABEL: Record<ProjectorScene, string> = {
  STANDBY: "Standby",
  ROUND_STATUS: "Round status",
  LEADERBOARD: "Leaderboard",
  MARKET_BOARD: "Market board",
  TOP_MOVERS: "Top movers",
  NEWS_WALL: "News wall",
  FINAL_RESULTS: "Final results",
};

/** Scales a fixed 1920×1080 stage to fit its container, letterboxing the rest. */
export function StageScaler({ children, className }: { children: ReactNode; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setScale(Math.min(element.clientWidth / STAGE_WIDTH, element.clientHeight / STAGE_HEIGHT));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className={cn("relative overflow-hidden bg-black", className)}>
      <div
        className="absolute top-1/2 left-1/2 origin-center"
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

/** Returns releases that appear after mount (and are recent), queued for the takeover. */
function useBreakingQueue(state: EventState) {
  const [queue, setQueue] = useState<NewsRelease[]>([]);
  const known = useRef<Set<string> | null>(null);
  const signature = state.newsReleases.map((r) => r.id).join("|");

  useEffect(() => {
    const ids = signature ? signature.split("|") : [];
    if (known.current === null) {
      known.current = new Set(ids);
      return;
    }
    const fresh = state.newsReleases.filter((r) => !known.current!.has(r.id));
    fresh.forEach((r) => known.current!.add(r.id));
    const recent = fresh.filter((r) => Date.now() - r.releasedAt < 60_000);
    if (recent.length) setQueue((current) => [...current, ...recent]);
  }, [signature, state.newsReleases]);

  const current = queue[0] ?? null;
  const duration = state.event.projector.breakingNewsSeconds * 1000;
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((q) => q.slice(1)), duration);
    return () => window.clearTimeout(timer);
  }, [current, duration]);

  return current;
}

function useScene(state: EventState, marketState: MarketState, paused: boolean): ProjectorScene {
  const { projector, leaderboard, status } = state.event;
  const [index, setIndex] = useState(0);

  const forced: ProjectorScene | null = status === "COMPLETED" ? "FINAL_RESULTS" : status === "DRAFT" || status === "READY" ? "STANDBY" : projector.pinnedScene;
  const rotation = projector.scenes
    .filter((s) => s.enabled && s.scene !== "FINAL_RESULTS")
    .filter((s) => s.scene !== "LEADERBOARD" || leaderboard.projectorVisibility !== "HIDDEN")
    .filter((s) => s.scene !== "STANDBY" || marketState === "BETWEEN_ROUNDS" || marketState === "NOT_STARTED");
  const safeIndex = rotation.length ? index % rotation.length : 0;
  const active = rotation[safeIndex];
  const duration = (active?.durationSeconds ?? 15) * 1000;

  useEffect(() => {
    if (forced || paused || rotation.length <= 1) return;
    const timer = window.setTimeout(() => setIndex((i) => i + 1), duration);
    return () => window.clearTimeout(timer);
  }, [forced, paused, rotation.length, duration, safeIndex]);

  return forced ?? active?.scene ?? "ROUND_STATUS";
}

export function ProjectorStage({ state, joinUrl, preview = false }: { state: EventState; joinUrl: string; preview?: boolean }) {
  const { now, round, remaining, elapsedPct, marketState } = useRoundClock(state);
  const breaking = useBreakingQueue(state);
  const scene = useScene(state, marketState, breaking !== null);
  const theme = state.event.projector.theme === "LIGHT" ? "light" : "dark";
  const active = round && (round.status === "RUNNING" || round.status === "PAUSED");
  const warning = marketState === "FROZEN" || marketState === "PAUSED";

  return (
    <div data-theme={theme} className="relative flex h-full w-full flex-col overflow-hidden bg-canvas text-fg-primary" aria-label={`Projector: ${SCENE_LABEL[scene]}`}>
      <header className="flex h-[128px] shrink-0 items-center justify-between border-b-2 border-border px-16">
        <div className="flex items-center gap-6">
          <BrandMark className="size-16 rounded-xl [&_svg]:size-9" />
          <div>
            <p className="text-[38px] leading-tight font-semibold tracking-tight text-fg-primary">{state.event.name}</p>
            <p className="font-mono text-[22px] tracking-[0.12em] text-fg-muted">JOIN · {state.event.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <div className="text-right">
            <p className="text-[22px] tracking-[0.16em] text-fg-muted uppercase">{round ? `Round ${round.number}` : "Round"}</p>
            <p className="text-[34px] leading-tight font-semibold text-fg-primary">{round?.name ?? "Not started"}</p>
          </div>
          <p className={cn("w-[260px] text-right font-mono text-[76px] leading-none font-semibold tabular-nums", !active ? "text-fg-muted" : round?.status === "RUNNING" && remaining <= 60_000 ? "text-warning" : "text-fg-primary")}>
            {active ? formatDuration(remaining) : "--:--"}
          </p>
          <span className={cn("flex items-center gap-3 rounded-xl border-2 px-6 py-3 text-[28px] font-semibold", warning ? "border-warning/60 bg-warning/10 text-warning" : marketState === "OPEN" ? "border-accent/50 bg-accent/10 text-fg-primary" : "border-border-strong text-fg-secondary")}>
            <span className={cn("size-4 rounded-full", marketState === "OPEN" ? "animate-pulse-dot bg-accent" : warning ? "bg-warning" : "bg-fg-muted")} />
            {MARKET_STATE_LABEL[marketState]}
          </span>
        </div>
      </header>

      <main key={scene} className="min-h-0 flex-1 animate-fade-in px-16 py-12">
        {scene === "STANDBY" && <StandbyScene state={state} marketState={marketState} joinUrl={joinUrl} />}
        {scene === "ROUND_STATUS" && <RoundStatusScene state={state} marketState={marketState} remaining={remaining} elapsedPct={elapsedPct} />}
        {scene === "LEADERBOARD" && <LeaderboardScene state={state} />}
        {scene === "MARKET_BOARD" && <MarketBoardScene state={state} />}
        {scene === "TOP_MOVERS" && <TopMoversScene state={state} />}
        {scene === "NEWS_WALL" && <NewsWallScene state={state} now={now} />}
        {scene === "FINAL_RESULTS" && <FinalResultsScene state={state} />}
      </main>

      {state.event.projector.tickerEnabled && <TickerStrip state={state} />}
      {breaking && <BreakingNewsTakeover state={state} release={breaking} />}
      {preview && (
        <span className="absolute top-4 right-4 rounded-lg bg-surface-raised/90 px-4 py-2 text-[24px] text-fg-secondary">
          Preview · {SCENE_LABEL[scene]} · {formatClock(now, true)}
        </span>
      )}
    </div>
  );
}

function TickerStrip({ state }: { state: EventState }) {
  const rows = instrumentRows(state, { enabledOnly: true });
  const items = [...rows, ...rows];
  return (
    <footer className="flex h-[76px] shrink-0 items-center overflow-hidden border-t-2 border-border bg-surface">
      <span className="z-10 flex h-full shrink-0 items-center bg-accent-strong px-8 text-[24px] font-bold tracking-[0.16em] text-white uppercase">Live</span>
      <div className="relative flex-1 overflow-hidden">
        <div className="flex w-max animate-ticker items-center gap-16 pl-10 whitespace-nowrap" style={{ animationDuration: `${Math.max(30, rows.length * 6)}s` }}>
          {items.map((row, index) => (
            <span key={`${row.instrument.id}-${index}`} className="flex items-center gap-4 text-[30px]">
              <span className="font-bold text-fg-primary">{row.instrument.symbol}</span>
              <span className="font-mono text-fg-secondary tabular-nums">₹{formatPrice(row.price)}</span>
              <span className={cn("font-mono font-semibold tabular-nums", row.roundChangePct > 0.004 ? "text-positive" : row.roundChangePct < -0.004 ? "text-negative" : "text-fg-muted")}>{formatPct(row.roundChangePct)}</span>
              {row.instrument.halted && <span className="rounded bg-warning px-2 text-[20px] font-bold text-warning-fg">HALTED</span>}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

function BreakingNewsTakeover({ state, release }: { state: EventState; release: NewsRelease }) {
  const seconds = state.event.projector.breakingNewsSeconds;
  const impacts = release.impacts.slice(0, 3);
  return (
    <div role="alert" aria-live="assertive" className="absolute inset-0 z-20 flex animate-takeover-in flex-col bg-canvas">
      <div className="flex h-[150px] shrink-0 items-center justify-between bg-warning px-16 text-warning-fg">
        <span className="flex items-center gap-6 text-[72px] leading-none font-black tracking-[0.12em] uppercase">
          <span className="size-8 animate-pulse-dot rounded-full bg-warning-fg" />
          Breaking news
        </span>
        <span className="font-mono text-[40px] font-semibold">{formatClock(release.releasedAt, true)}</span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-24">
        <h1 className="max-w-[1720px] text-[96px] leading-[1.04] font-bold tracking-tight text-fg-primary uppercase">{release.headline}</h1>
        {release.body && <p className="mt-8 max-w-[1500px] text-[36px] leading-snug text-fg-secondary">{release.body}</p>}
        {impacts.length > 0 && (
          <div className={cn("mt-14 grid gap-8", impacts.length === 1 ? "grid-cols-1" : impacts.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
            {impacts.map((impact) => (
              <div key={impact.instrumentId} className="rounded-3xl border-2 border-border-strong bg-surface px-12 py-9">
                <p className="text-[64px] leading-none font-black tracking-tight text-fg-primary">{instrumentOf(state, impact.instrumentId)?.symbol}</p>
                <div className={cn("mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono tabular-nums", impacts.length === 1 ? "text-[72px]" : "text-[48px]")}>
                  <span className="text-fg-secondary">₹{formatPrice(impact.previousPrice)}</span>
                  <span className="text-fg-muted">→</span>
                  <span className="font-bold text-fg-primary">₹{formatPrice(impact.newPrice)}</span>
                </div>
                <p className={cn("mt-5 inline-flex items-center gap-4 rounded-2xl px-6 py-2 font-mono font-bold tabular-nums", impact.appliedPct >= 0 ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative", impacts.length === 1 ? "text-[80px]" : "text-[56px]")}>
                  {formatPct(impact.appliedPct)}
                </p>
                {impact.clamped && <p className="mt-4 text-[26px] text-warning">Circuit / price limit applied</p>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="h-3 shrink-0 bg-surface-hover">
        <div className="h-full origin-left bg-warning" style={{ animation: `takeover-progress ${seconds}s linear forwards` }} />
      </div>
      <style>{`@keyframes takeover-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
    </div>
  );
}
