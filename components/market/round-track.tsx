"use client";

import { formatClock, formatMinutes } from "@/lib/format";
import type { EventState, Round } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { useRoundClock } from "./round-clock";

type SegmentState = "done" | "now" | "next";

function segmentState(round: Round, current: Round | null): SegmentState {
  if (round.status === "ENDED") return "done";
  if (current && round.id === current.id && (round.status === "RUNNING" || round.status === "PAUSED")) return "now";
  return "next";
}

function shortName(round: Round) {
  return round.type === "BRIEFING" ? "Briefing" : `R${round.number} · ${round.name}`;
}

function timeLabel(round: Round) {
  if (round.startedAt) {
    const end = round.endedAt ?? round.endsAt;
    return end ? `${formatClock(round.startedAt)}–${formatClock(end)}` : formatClock(round.startedAt);
  }
  return formatMinutes(round.durationSeconds);
}

/**
 * C4 round track (borrowed from C3): briefing and rounds as one timeline. The running segment fills with the
 * elapsed share of the round; finished rounds are full and muted. Used by the participant topbar, the host
 * live control strip and the projector.
 */
export function RoundTrack({ state, variant = "host", className }: { state: EventState; variant?: "host" | "participant" | "stage"; className?: string }) {
  const { round: current, elapsedPct } = useRoundClock(state);
  const rounds = [...state.rounds].sort((a, b) => a.number - b.number || (a.type === "BRIEFING" ? -1 : 1));
  if (rounds.length === 0) return null;
  const stage = variant === "stage";

  return (
    <ol className={cn("flex w-full gap-2", stage && "gap-3", className)} aria-label="Round schedule">
      {rounds.map((round) => {
        const s = segmentState(round, current);
        const fill = s === "done" ? 100 : s === "now" ? elapsedPct : 0;
        return (
          <li key={round.id} className="min-w-0 flex-1" aria-current={s === "now" ? "step" : undefined}>
            <div className={cn("overflow-hidden rounded-full bg-canvas-subtle", stage ? "h-3" : "h-1")}>
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", s === "now" ? (round.status === "PAUSED" ? "bg-warning" : "bg-accent") : "bg-fg-disabled")}
                style={{ width: `${fill}%` }}
              />
            </div>
            {variant !== "participant" && (
              <div className={cn("mt-1.5 flex min-w-0 gap-x-2", stage ? "mt-2.5 items-baseline justify-between" : "flex-col")}>
                <span
                  className={cn(
                    "truncate",
                    stage ? "text-[20px] leading-6 font-semibold tracking-[0.06em] uppercase" : "text-caption",
                    s === "now" ? "font-medium text-fg-primary" : "text-fg-muted",
                  )}
                >
                  {shortName(round)}
                </span>
                <span className={cn("shrink-0 font-mono", stage ? "text-[24px] leading-8" : "text-[12px] leading-4", s === "now" ? "text-accent-text" : "text-fg-muted")}>{timeLabel(round)}</span>
              </div>
            )}
            <span className="sr-only">{s === "done" ? "finished" : s === "now" ? "in progress" : "upcoming"}</span>
          </li>
        );
      })}
    </ol>
  );
}
