"use client";

import { useNow } from "@/lib/mock/hooks";
import { formatDuration } from "@/lib/format";
import { currentRound, deriveMarketState, MARKET_STATE_LABEL, roundRemainingMs } from "@/lib/domain/trading-gate";
import type { EventState, MarketState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function useRoundClock(state: EventState) {
  const now = useNow();
  const round = currentRound(state);
  const remaining = round ? roundRemainingMs(round, now) : 0;
  const elapsedPct = round && round.durationSeconds > 0 ? Math.min(100, Math.max(0, 100 - (remaining / (round.durationSeconds * 1000)) * 100)) : 0;
  const active = !!round && (round.status === "RUNNING" || round.status === "PAUSED");
  return { now, round, remaining, elapsedPct, active, marketState: deriveMarketState(state.event, round, now) };
}

export const MARKET_TONE: Record<MarketState, "live" | "info" | "warning" | "idle"> = {
  OPEN: "live",
  BRIEFING: "info",
  PAUSED: "warning",
  FROZEN: "warning",
  BETWEEN_ROUNDS: "idle",
  NOT_STARTED: "idle",
  COMPLETED: "idle",
};

export function StateDot({ state, className }: { state: MarketState; className?: string }) {
  const tone = MARKET_TONE[state];
  return (
    <span className={cn("relative flex size-2 shrink-0", className)} aria-hidden>
      {tone === "live" && <span className="absolute inset-0 animate-pulse-dot rounded-full bg-accent/60" />}
      <span className={cn("relative size-2 rounded-full", tone === "live" ? "bg-accent" : tone === "info" ? "bg-accent/70" : tone === "warning" ? "bg-warning" : "bg-fg-muted")} />
    </span>
  );
}

export function RoundCountdown({ state, className }: { state: EventState; className?: string }) {
  const { round, remaining, active } = useRoundClock(state);
  const urgent = active && round?.status === "RUNNING" && remaining <= 60_000;
  return (
    <span className={cn("font-mono tabular-nums", urgent ? "text-warning" : "text-fg-primary", !active && "text-fg-muted", className)} aria-label="Time remaining in round">
      {active ? formatDuration(remaining) : "--:--"}
    </span>
  );
}

/** One compact chip that answers "what is happening now": round, time left and market state. */
export function SessionChip({ state, className }: { state: EventState; className?: string }) {
  const { round, active, marketState } = useRoundClock(state);
  const tone = MARKET_TONE[marketState];
  const label =
    state.event.status === "COMPLETED" ? "Event complete" : round ? null : state.event.status === "DRAFT" || state.event.status === "READY" ? "Starts soon" : "Awaiting round";
  return (
    <div className={cn("flex h-8 min-w-0 items-stretch overflow-hidden rounded-md border text-xs", tone === "warning" ? "border-warning/40" : "border-border", className)}>
      <span className="flex min-w-0 items-center gap-1 bg-surface px-2.5 text-fg-secondary">
        {label ?? (
          <>
            <span className="font-semibold text-fg-primary">R{round!.number}</span>
            <span className="truncate">· {round!.name}</span>
          </>
        )}
      </span>
      {active && (
        <span className="flex items-center border-l border-border bg-surface px-2.5">
          <RoundCountdown state={state} className="text-[13px] font-semibold" />
        </span>
      )}
      <span
        className={cn(
          "flex items-center gap-1.5 border-l px-2.5 font-medium whitespace-nowrap",
          tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : tone === "live" ? "border-border bg-accent/10 text-fg-primary" : "border-border bg-surface text-fg-secondary",
        )}
      >
        <StateDot state={marketState} />
        {MARKET_STATE_LABEL[marketState]}
      </span>
    </div>
  );
}
