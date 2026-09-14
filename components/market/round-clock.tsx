"use client";

import { useNow } from "@/lib/mock/hooks";
import { formatDuration } from "@/lib/format";
import { currentRound, deriveMarketState, roundRemainingMs } from "@/lib/domain/trading-gate";
import type { EventState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function useRoundClock(state: EventState) {
  const now = useNow();
  const round = currentRound(state);
  const remaining = round ? roundRemainingMs(round, now) : 0;
  const elapsedPct = round && round.durationSeconds > 0 ? Math.min(100, Math.max(0, 100 - (remaining / (round.durationSeconds * 1000)) * 100)) : 0;
  return { now, round, remaining, elapsedPct, marketState: deriveMarketState(state.event, round, now) };
}

export function RoundCountdown({ state, className }: { state: EventState; className?: string }) {
  const { round, remaining } = useRoundClock(state);
  const active = round && (round.status === "RUNNING" || round.status === "PAUSED");
  const urgent = active && round.status === "RUNNING" && remaining <= 60_000;
  return (
    <span className={cn("font-mono tabular-nums", urgent ? "text-warning" : "text-fg-primary", !active && "text-fg-muted", className)} aria-label="Time remaining in round">
      {active ? formatDuration(remaining) : "--:--"}
    </span>
  );
}

export function RoundPill({ state, className }: { state: EventState; className?: string }) {
  const { round } = useRoundClock(state);
  const pending = !round || round.status === "ENDED";
  return (
    <span className={cn("inline-flex h-8 min-w-0 items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 text-xs", className)}>
      <span className="min-w-0 truncate text-fg-secondary">
        {round ? (
          <>
            <span className="font-medium text-fg-primary">R{round.number}</span> · {round.name}
            {round.status === "ENDED" && <span className="text-fg-muted"> (ended)</span>}
          </>
        ) : (
          "Awaiting first round"
        )}
      </span>
      {!pending && <span aria-hidden className="h-4 w-px bg-border-strong" />}
      {!pending && <RoundCountdown state={state} className="text-[13px] font-medium" />}
    </span>
  );
}
