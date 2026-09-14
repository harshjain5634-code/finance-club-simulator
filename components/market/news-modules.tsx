"use client";

import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatePanel } from "@/components/ui/guidance";
import { formatPct, formatPrice } from "@/lib/domain/money";
import type { EventState, NewsRelease, ResolvedImpact } from "@/lib/domain/types";
import { formatClock, formatRelative } from "@/lib/format";
import { instrumentOf } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

export const BREAKING_WINDOW_MS = 5 * 60_000;
export const FRESH_WINDOW_MS = 60_000;

const moveTone = (pct: number) => (pct > 0.004 ? "text-positive" : pct < -0.004 ? "text-negative" : "text-fg-secondary");

/** SYMBOL  ₹500.00 → ₹536.70  +7.34%, the observed price reaction to a story. */
export function ImpactRow({ state, impact, size = "md" }: { state: EventState; impact: ResolvedImpact; size?: "sm" | "md" }) {
  const symbol = instrumentOf(state, impact.instrumentId)?.symbol ?? impact.instrumentId;
  return (
    <div className={cn("grid grid-cols-[minmax(4.5rem,auto)_1fr_auto] items-center gap-3 tabular-nums", size === "md" ? "text-[13px]" : "text-xs")}>
      <span className="font-semibold text-fg-primary">{symbol}</span>
      <span className="truncate text-fg-secondary">
        ₹{formatPrice(impact.previousPrice)} <span className="text-fg-muted">→</span> <span className="text-fg-primary">₹{formatPrice(impact.newPrice)}</span>
      </span>
      <span className={cn("rounded px-1.5 py-0.5 font-semibold", moveTone(impact.appliedPct), impact.appliedPct > 0.004 ? "bg-positive/10" : impact.appliedPct < -0.004 ? "bg-negative/10" : "bg-surface-hover")}>
        {formatPct(impact.appliedPct)}
      </span>
    </div>
  );
}

function roundLabelOf(state: EventState, roundId: string | null) {
  const round = state.rounds.find((r) => r.id === roundId);
  return round ? `Round ${round.number}` : "Pre-round";
}

/** Prominent dashboard module: the latest story emphasised, 2–3 earlier stories underneath. */
export function LatestNewsCard({ state, releases, now, newsHref, className }: { state: EventState; releases: NewsRelease[]; now: number; newsHref: string; className?: string }) {
  const [latest, ...earlier] = releases;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Latest news"
        icon={<Newspaper className="size-3.5" />}
        subtitle={releases.length ? `${releases.length} ${releases.length === 1 ? "story" : "stories"} released` : "Prices react when news breaks"}
        action={
          <Link href={newsHref} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            View all news
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {!latest ? (
        <StatePanel size="sm" icon={<Newspaper className="size-4" />} title="No news yet" description="News released by the host appears here instantly. Prices can react the moment a story breaks." />
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
          <LeadStory state={state} release={latest} now={now} />
          {earlier.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium tracking-wide text-fg-muted uppercase">Earlier</p>
              <ul className="divide-y divide-border">
                {earlier.slice(0, 3).map((release) => {
                  const top = release.impacts[0];
                  return (
                    <li key={release.id} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="w-11 shrink-0 text-xs text-fg-muted tabular-nums">{formatClock(release.releasedAt)}</span>
                      <span className="min-w-0 flex-1 truncate text-fg-primary" title={release.headline}>
                        {release.headline}
                      </span>
                      {top && (
                        <span className={cn("shrink-0 text-xs font-medium tabular-nums", moveTone(top.appliedPct))}>
                          {instrumentOf(state, top.instrumentId)?.symbol} {formatPct(top.appliedPct)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function LeadStory({ state, release, now, size = "md" }: { state: EventState; release: NewsRelease; now: number; size?: "md" | "lg" }) {
  const age = now - release.releasedAt;
  const breaking = age < BREAKING_WINDOW_MS;
  const fresh = age < FRESH_WINDOW_MS;
  return (
    <article
      key={release.id}
      className={cn(
        "rounded-lg border px-4 py-3.5 transition-colors duration-700",
        fresh ? "border-warning/50 bg-warning/6 animate-pop-in" : "border-border bg-surface-raised/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        {breaking && (
          <Badge tone="warning" dot className="font-semibold tracking-wide uppercase [&>span:first-child]:animate-pulse-dot">
            Breaking
          </Badge>
        )}
        <span className="font-medium text-fg-secondary tabular-nums">{formatClock(release.releasedAt)}</span>
        <span aria-hidden>·</span>
        <span>{roundLabelOf(state, release.roundId)}</span>
        <span aria-hidden>·</span>
        <span>{formatRelative(release.releasedAt, now)}</span>
      </div>
      <h3 className={cn("mt-1.5 leading-snug font-semibold text-fg-primary", size === "lg" ? "text-lg" : "text-[15px]")}>{release.headline}</h3>
      {release.body && <p className={cn("mt-1 leading-relaxed text-fg-secondary", size === "lg" ? "text-[14px]" : "line-clamp-2 text-[13px]")}>{release.body}</p>}
      {release.impacts.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          {release.impacts.map((impact) => (
            <ImpactRow key={impact.instrumentId} state={state} impact={impact} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-fg-muted">No direct price impact.</p>
      )}
    </article>
  );
}
