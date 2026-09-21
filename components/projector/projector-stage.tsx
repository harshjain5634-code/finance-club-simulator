"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/shell/brand";
import { useRoundClock } from "@/components/market/round-clock";
import { formatPct, formatPrice } from "@/lib/domain/money";
import { activeTakeover, resolveProjectorScene, SCENE_LABEL, type ActiveTakeover } from "@/lib/domain/projector";
import { MARKET_STATE_LABEL } from "@/lib/domain/trading-gate";
import type { EventState, ProjectorScene } from "@/lib/domain/types";
import { formatClock, formatDuration } from "@/lib/format";
import { instrumentRows } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { FinalResultsScene, LeaderboardScene, MarketBoardScene, MessageScene, NewsWallScene, ProjectorImpactRow, roundLabel, RoundStatusScene, StandbyScene, TopMoversScene } from "./scenes";

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export { SCENE_LABEL };

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
      <div className="absolute top-1/2 left-1/2 origin-center" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

const TICKER_FACTOR = { SLOW: 1.7, NORMAL: 1, FAST: 0.6 } as const;

/** Local-only view override for reviewing one scene (`?scene=` on the projector URL). Never written to event state. */
export type StageOverride = { scene: ProjectorScene } | { breaking: true };

/**
 * The audience display. The current scene and any takeover come from shared event state plus the clock,
 * so the projector and the host's live preview always show the same thing.
 */
export function ProjectorStage({ state, joinUrl, preview = false, override = null }: { state: EventState; joinUrl: string; preview?: boolean; override?: StageOverride | null }) {
  const { now, round, remaining, elapsedPct, marketState, active } = useRoundClock(state);
  const resolution = resolveProjectorScene(state, now);
  const takeover = override ? overrideTakeover(state, override) : activeTakeover(state, now);
  const scene = override && "scene" in override ? override.scene : resolution.scene;
  const theme = state.event.projector.theme === "LIGHT" ? "light" : "dark";
  const warning = marketState === "FROZEN" || marketState === "PAUSED";

  return (
    <div data-theme={theme} className="relative flex h-full w-full flex-col overflow-hidden bg-canvas text-fg-primary" aria-label={`Projector: ${takeover ? "takeover" : SCENE_LABEL[scene]}`}>
      <header className="flex h-[88px] shrink-0 items-center justify-between border-b-2 border-border px-12">
        <div className="flex items-center gap-4">
          <BrandMark className="size-11 rounded-lg [&_svg]:size-6" />
          <div>
            <p className="text-[26px] leading-tight font-semibold tracking-tight text-fg-primary">{state.event.name}</p>
            <p className="font-mono text-[15px] tracking-[0.12em] text-fg-muted">JOIN · {state.event.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-8">
          {marketState !== "NOT_STARTED" && marketState !== "COMPLETED" && (
            <>
              <div className="text-right">
                <p className="text-[15px] tracking-[0.16em] text-fg-muted uppercase">{roundLabel(state, round)}</p>
                <p className="text-[24px] leading-tight font-semibold text-fg-primary">{round?.name ?? "Between rounds"}</p>
              </div>
              <p className={cn("w-[190px] text-right font-mono text-[48px] leading-none font-semibold tabular-nums", !active ? "text-fg-muted" : round?.status === "RUNNING" && remaining <= 60_000 ? "text-warning" : "text-fg-primary")}>{active ? formatDuration(remaining) : "--:--"}</p>
            </>
          )}
          <span className={cn("flex items-center gap-2.5 rounded-lg border-2 px-4 py-2 text-[20px] font-semibold", warning ? "border-warning/60 bg-warning/10 text-warning" : marketState === "OPEN" ? "border-accent/50 bg-accent/10 text-fg-primary" : "border-border-strong text-fg-secondary")}>
            <span className={cn("size-3 rounded-full", marketState === "OPEN" ? "animate-pulse-dot bg-accent" : warning ? "bg-warning" : "bg-fg-muted")} />
            {MARKET_STATE_LABEL[marketState]}
          </span>
        </div>
      </header>

      <main key={scene} className="min-h-0 flex-1 animate-fade-in px-12 py-9">
        {scene === "STANDBY" && <StandbyScene state={state} marketState={marketState} joinUrl={joinUrl} />}
        {scene === "ROUND_STATUS" && <RoundStatusScene state={state} marketState={marketState} remaining={remaining} elapsedPct={elapsedPct} now={now} />}
        {scene === "LEADERBOARD" && <LeaderboardScene state={state} />}
        {scene === "MARKET_BOARD" && <MarketBoardScene state={state} />}
        {scene === "TOP_MOVERS" && <TopMoversScene state={state} />}
        {scene === "NEWS_WALL" && <NewsWallScene state={state} now={now} />}
        {scene === "CUSTOM_MESSAGE" && <MessageScene title={state.event.projector.customMessage.title} body={state.event.projector.customMessage.body} eventName={state.event.name} />}
        {scene === "FINAL_RESULTS" && <FinalResultsScene state={state} />}
      </main>

      {state.event.projector.tickerEnabled && <TickerStrip state={state} label={marketState === "COMPLETED" ? "Final" : marketState === "NOT_STARTED" ? "Prices" : "Live"} />}
      {takeover && <Takeover state={state} takeover={takeover} />}
      {preview && (
        <span className="absolute top-3 right-3 rounded-md bg-surface-raised/90 px-3 py-1.5 text-[18px] text-fg-secondary">
          Preview · {takeover ? (takeover.kind === "NEWS" ? "Breaking news" : "Message") : SCENE_LABEL[scene]} · {formatClock(now, true)}
        </span>
      )}
    </div>
  );
}

function overrideTakeover(state: EventState, override: StageOverride): ActiveTakeover | null {
  if (!("breaking" in override)) return null;
  const release = [...state.newsReleases].sort((a, b) => b.releasedAt - a.releasedAt)[0];
  if (!release) return null;
  const durationSeconds = state.event.projector.breakingNewsSeconds;
  return { kind: "NEWS", release, remainingMs: durationSeconds * 1000, takeover: { kind: "NEWS", releaseId: release.id, startedAt: release.releasedAt, durationSeconds } };
}

function TickerStrip({ state, label }: { state: EventState; label: string }) {
  const rows = instrumentRows(state, { enabledOnly: true });
  const items = [...rows, ...rows];
  const seconds = Math.max(30, rows.length * 6) * TICKER_FACTOR[state.event.projector.tickerSpeed];
  return (
    <footer className="flex h-[56px] shrink-0 items-center overflow-hidden border-t-2 border-border bg-surface">
      <span className="z-10 flex h-full shrink-0 items-center bg-accent-strong px-6 text-[18px] font-bold tracking-[0.16em] text-white uppercase">{label}</span>
      <div className="relative flex-1 overflow-hidden">
        <div className="flex w-max animate-ticker items-center gap-12 pl-8 whitespace-nowrap" style={{ animationDuration: `${seconds}s` }}>
          {items.map((row, index) => (
            <span key={`${row.instrument.id}-${index}`} className="flex items-center gap-3 text-[22px]">
              <span className="font-bold text-fg-primary">{row.instrument.symbol}</span>
              <span className="font-mono text-fg-secondary tabular-nums">₹{formatPrice(row.price)}</span>
              <span className={cn("font-mono font-semibold tabular-nums", row.roundChangePct > 0.004 ? "text-positive" : row.roundChangePct < -0.004 ? "text-negative" : "text-fg-muted")}>{formatPct(row.roundChangePct)}</span>
              {row.instrument.halted && <span className="rounded bg-warning px-1.5 text-[15px] font-bold text-warning-fg">HALTED</span>}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

function Takeover({ state, takeover }: { state: EventState; takeover: ActiveTakeover }) {
  if (takeover.kind === "MESSAGE") {
    return (
      <div role="status" aria-live="polite" className="absolute inset-0 z-20 flex animate-takeover-in flex-col bg-canvas">
        <div className="flex h-[64px] shrink-0 items-center justify-between bg-accent-strong px-12 text-white">
          <span className="text-[26px] font-bold tracking-[0.16em] uppercase">Announcement</span>
          <span className="font-mono text-[22px]">{state.event.name}</span>
        </div>
        <div className="min-h-0 flex-1 px-12 py-10">
          <MessageScene title={takeover.title} body={takeover.body} eventName={state.event.name} tone="announcement" />
        </div>
      </div>
    );
  }

  const { release } = takeover;
  const impacts = release.impacts.slice(0, 4);
  const releaseRound = state.rounds.find((r) => r.id === release.roundId);
  return (
    <div role="alert" aria-live="assertive" className="absolute inset-0 z-20 flex animate-takeover-in flex-col bg-canvas">
      <div className="flex h-[76px] shrink-0 items-center justify-between bg-warning px-12 text-warning-fg">
        <span className="flex items-center gap-4 text-[34px] leading-none font-black tracking-[0.14em] uppercase">
          <span className="size-5 animate-pulse-dot rounded-full bg-warning-fg" />
          Breaking news
        </span>
        <span className="font-mono text-[26px] font-semibold">{formatClock(release.releasedAt, true)}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.3fr_1fr] items-center gap-14 px-14 py-12">
        <div className="flex min-h-0 flex-col">
          <p className="text-[20px] font-semibold tracking-[0.16em] text-warning uppercase">{releaseRound ? `${roundLabel(state, releaseRound)} · ${releaseRound.name}` : state.event.name}</p>
          <p className="mt-4 line-clamp-4 text-[72px] leading-[1.05] font-semibold tracking-tight text-fg-primary">{release.headline}</p>
          {release.body && <p className="mt-7 line-clamp-4 border-l-4 border-warning/60 pl-6 text-[30px] leading-snug text-fg-secondary">{release.body}</p>}
        </div>
        <div className="flex min-h-0 flex-col">
          <p className="mb-4 text-[18px] font-semibold tracking-[0.16em] text-fg-muted uppercase">{impacts.length ? "Price reaction" : "Market impact"}</p>
          {impacts.length === 0 ? (
            <p className="rounded-2xl border-2 border-border bg-surface px-8 py-7 text-[28px] text-fg-secondary">No direct price impact</p>
          ) : (
            <div className="flex flex-col gap-4">
              {impacts.map((impact) => (
                <div key={impact.instrumentId} className="rounded-2xl border-2 border-border-strong bg-surface px-8 py-6">
                  <ProjectorImpactRow state={state} impact={impact} size={impacts.length <= 2 ? "lg" : "md"} />
                  {impact.clamped && <p className="mt-2 text-[18px] text-warning">Price limit applied</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="h-2 shrink-0 bg-surface-hover">
        <TakeoverProgress key={release.id + takeover.takeover.startedAt} remainingMs={takeover.remainingMs} totalMs={(takeover.takeover.durationSeconds ?? 12) * 1000} />
      </div>
    </div>
  );
}

/** Countdown bar for the breaking-news overlay; the animation is fixed at mount so per-second re-renders never restart it. */
function TakeoverProgress({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const [animation] = useState(() => ({ from: Math.min(1, Math.max(0, remainingMs / totalMs)), seconds: Math.max(0.5, remainingMs / 1000) }));
  return <div className="h-full origin-left bg-warning" style={{ animation: `takeover-progress ${animation.seconds}s linear forwards`, ["--progress-from" as string]: animation.from }} />;
}
