"use client";

import { ImpactLabel } from "@/components/market/widgets";
import { configuredImpactOf } from "@/lib/domain/news";
import { currentRound } from "@/lib/domain/trading-gate";
import type { EventState, NewsItem } from "@/lib/domain/types";
import { instrumentOf } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

/** Host-only summary of a story's configured price effect, e.g. "PULSE −2% to −4%". */
export function StoryImpacts({ state, item, className }: { state: EventState; item: NewsItem; className?: string }) {
  if (item.impacts.length === 0) return <span className={cn("text-xs text-fg-muted", className)}>No price impact</span>;
  return (
    <span className={cn("flex flex-wrap gap-x-3 gap-y-0.5", className)}>
      {item.impacts.map((impact) => (
        <span key={impact.id} className="inline-flex items-center gap-1.5 text-xs">
          <span className="font-medium text-fg-primary">{instrumentOf(state, impact.instrumentId)?.symbol}</span>
          <ImpactLabel configured={configuredImpactOf(impact)} />
        </span>
      ))}
    </span>
  );
}

/** Manual queue: READY, unscheduled stories for the running round first, then any-round stories, then later rounds. */
export function manualQueue(state: EventState): NewsItem[] {
  const round = currentRound(state);
  const rank = (item: NewsItem) => (round && item.roundId === round.id ? 0 : item.roundId === null ? 1 : 2);
  return state.news.filter((n) => n.status === "READY" && n.scheduledFor == null).sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}
