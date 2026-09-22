"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NEWS_PRIORITY_LABEL } from "@/components/market/status";
import type { EventState, NewsPriority, NewsRelease } from "@/lib/domain/types";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export function releaseMeta(state: EventState, release: NewsRelease) {
  const item = state.news.find((n) => n.id === release.newsItemId);
  const round = state.rounds.find((r) => r.id === release.roundId);
  const priority: NewsPriority = item?.priority ?? "NORMAL";
  const symbols = release.impacts
    .map((impact) => state.instruments.find((i) => i.id === impact.instrumentId)?.symbol)
    .filter((s): s is string => !!s);
  return {
    priority,
    number: item?.number ?? null,
    roundLabel: round ? (round.type === "BRIEFING" ? "Briefing" : `Round ${round.number}`) : "Pre-event",
    symbols: Array.from(new Set(symbols)),
  };
}

const railTone: Record<NewsPriority, string> = { HIGH: "bg-warning", NORMAL: "bg-info", LOW: "bg-border-strong" };
const labelTone: Record<NewsPriority, string> = { HIGH: "text-warning", NORMAL: "text-info", LOW: "text-fg-muted" };

/**
 * C4 News Card. Importance is the participant label (Update / Important / Breaking); the rail and a text label
 * carry it, never colour alone. Only released data is shown: headline, body and affected companies. Configured
 * price effects never appear here.
 */
export function NewsCard({
  state,
  release,
  code,
  unread = false,
  selected = false,
  showBody = false,
  href,
  onSelect,
  className,
}: {
  state: EventState;
  release: NewsRelease;
  code: string;
  unread?: boolean;
  selected?: boolean;
  showBody?: boolean;
  href?: string;
  onSelect?: () => void;
  className?: string;
}) {
  const meta = releaseMeta(state, release);
  const breakingUnread = meta.priority === "HIGH" && unread;
  const Headline = onSelect ? "button" : "p";

  return (
    <article
      className={cn(
        "relative rounded-lg border p-4 transition-colors",
        breakingUnread ? "border-transparent bg-warning-soft" : "border-border bg-surface",
        selected && "border-accent ring-1 ring-accent",
        className,
      )}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex gap-3">
        <span aria-hidden className={cn("w-0.5 shrink-0 rounded-full", railTone[meta.priority])} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-caption">
            <span className="font-mono text-fg-muted">{formatClock(release.releasedAt)}</span>
            <span className="text-fg-muted">{meta.roundLabel}</span>
            {meta.priority !== "LOW" && (
              <span className={cn("inline-flex items-center gap-1 font-medium", labelTone[meta.priority])}>
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {NEWS_PRIORITY_LABEL[meta.priority]}
              </span>
            )}
            {meta.priority === "LOW" && <span className="font-medium text-fg-muted">{NEWS_PRIORITY_LABEL.LOW}</span>}
            {unread && (
              <span className="ml-auto size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" role="img" />
            )}
          </div>
          <Headline
            {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
            className={cn("mt-2 block text-left text-[15px] leading-[22px] font-medium", unread ? "text-fg-primary" : "text-fg-secondary", onSelect && "hover:text-fg-primary focus-visible:outline-offset-4")}
          >
            {release.headline}
          </Headline>
          {showBody && release.body && <p className="mt-1.5 line-clamp-2 text-meta text-fg-secondary">{release.body}</p>}
          {meta.symbols.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-caption">
              {meta.symbols.map((symbol) => (
                <span key={symbol} className="rounded-xs border border-border-strong px-1.5 py-0.5 font-mono text-fg-secondary">
                  {symbol}
                </span>
              ))}
              <span className="text-fg-muted">{meta.symbols.length === 1 ? "Affected company" : "Affected companies"}</span>
              {meta.symbols.length === 1 && (
                <Link href={href ?? `/event/${code}/markets/${meta.symbols[0]}`} className="ml-auto inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                  View {meta.symbols[0]} <ArrowRight className="size-3" aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
