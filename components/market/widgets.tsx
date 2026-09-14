"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sparkline } from "@/components/ui/sparkline";
import { buttonClasses } from "@/components/ui/button";
import { changePct, formatPrice } from "@/lib/domain/money";
import { describeConfigured } from "@/lib/domain/news";
import type { ConfiguredImpact, EventState, NewsRelease, Paise } from "@/lib/domain/types";
import { formatClock, formatRelative } from "@/lib/format";
import { instrumentOf, type InstrumentRow } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { SymbolMark } from "./tables";

export function BeforeAfter({ before, after, className }: { before: Paise; after: Paise; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <span className="text-fg-secondary">₹{formatPrice(before)}</span>
      <ArrowRight className="size-3 text-fg-muted" aria-label="to" />
      <span className="font-medium text-fg-primary">₹{formatPrice(after)}</span>
    </span>
  );
}

export function ImpactLabel({ configured, className }: { configured: ConfiguredImpact; className?: string }) {
  return <span className={cn("font-mono text-xs text-fg-secondary tabular-nums", className)}>{describeConfigured(configured)}</span>;
}

/** Compact instrument list used on dashboards and the control room. */
export function MarketBoard({ rows, hrefFor, title = "Event market board", subtitle, action, limit }: { rows: InstrumentRow[]; hrefFor?: (symbol: string) => string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; limit?: number }) {
  const visible = limit ? rows.slice(0, limit) : rows;
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} divider />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border px-4 py-1.5 text-[11px] tracking-wide text-fg-muted uppercase">
        <span>Stock</span>
        <span className="hidden text-right sm:block">Trend</span>
        <span className="text-right">Price · Round</span>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((row) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                <SymbolMark symbol={row.instrument.symbol} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg-primary">
                    {row.instrument.symbol}
                    {row.instrument.halted && <Badge tone="warning">Halted</Badge>}
                  </span>
                  <span className="block truncate text-[11px] text-fg-muted">{row.instrument.name}</span>
                </span>
              </span>
              <Sparkline data={row.sparkline} baseline={row.snapshot.roundOpenPrice} className="hidden h-7 w-20 sm:block" />
              <span className="text-right leading-tight">
                <span className="block text-[13px] text-fg-primary tabular-nums">{formatPrice(row.price)}</span>
                <Delta value={row.roundChangePct} className="text-[11px]" />
              </span>
            </>
          );
          const rowClass = "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 transition-colors duration-150";
          return (
            <li key={row.instrument.id}>
              {hrefFor ? (
                <Link href={hrefFor(row.instrument.symbol)} className={cn(rowClass, "hover:bg-surface-hover")}>
                  {content}
                </Link>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function MoversList({ rows, hrefFor, empty = "No moves this round yet." }: { rows: InstrumentRow[]; hrefFor?: (symbol: string) => string; empty?: string }) {
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-[13px] text-fg-muted">{empty}</p>;
  return (
    <ul className="py-1">
      {rows.map((row) => {
        const content = (
          <>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-fg-primary">{row.instrument.symbol}</span>
              <span className="block truncate text-[11px] text-fg-muted">{row.instrument.name}</span>
            </span>
            <span className="text-right text-[13px] text-fg-primary tabular-nums">{formatPrice(row.price)}</span>
            <span className="text-right">
              <Delta value={row.roundChangePct} variant="pill" />
            </span>
          </>
        );
        const cls = "mx-1 grid grid-cols-[minmax(0,1fr)_auto_4.75rem] items-center gap-3 rounded-md px-3 py-2";
        return (
          <li key={row.instrument.id}>
            {hrefFor ? (
              <Link href={hrefFor(row.instrument.symbol)} className={cn(cls, "hover:bg-surface-hover")}>
                {content}
              </Link>
            ) : (
              <div className={cls}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NewsReleaseItem({ state, release, now, showImpactDetail = false, compact = false }: { state: EventState; release: NewsRelease; now: number; showImpactDetail?: boolean; compact?: boolean }) {
  const round = state.rounds.find((r) => r.id === release.roundId);
  const fresh = now - release.releasedAt < 5 * 60_000;
  return (
    <article className={cn("px-4", compact ? "py-2.5" : "py-3.5")}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
        {fresh && (
          <Badge tone="warning" dot className="[&>span:first-child]:animate-pulse-dot">
            Breaking
          </Badge>
        )}
        <span className="tabular-nums">{formatClock(release.releasedAt)}</span>
        <span aria-hidden>·</span>
        <span>{round ? `Round ${round.number} · ${round.name}` : "Pre-round"}</span>
        <span aria-hidden>·</span>
        <span>{formatRelative(release.releasedAt, now)}</span>
      </div>
      <h3 className={cn("mt-1 font-semibold text-fg-primary", compact ? "text-[13px]" : "text-[14px] leading-snug")}>{release.headline}</h3>
      {!compact && release.body && <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">{release.body}</p>}
      {release.impacts.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {release.impacts.map((impact) => {
            const instrument = instrumentOf(state, impact.instrumentId);
            const current = state.prices[impact.instrumentId]?.price ?? impact.newPrice;
            return (
              <li key={impact.instrumentId} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs">
                <span className="font-medium text-fg-primary">{instrument?.symbol}</span>
                <Delta value={impact.appliedPct} className="text-xs" />
                {showImpactDetail ? (
                  <span className="text-fg-muted">
                    <BeforeAfter before={impact.previousPrice} after={impact.newPrice} className="text-xs" />
                  </span>
                ) : (
                  <span className="text-fg-muted tabular-nums" title="Change since release">
                    now {formatPrice(current)} (<Delta value={changePct(impact.previousPrice, current)} className="text-xs" /> total)
                  </span>
                )}
                {showImpactDetail && impact.clamped && <Badge tone="warning">Clamped</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export function NewsFeedCard({ state, releases, now, hrefAll, limit = 4, title = "Latest news" }: { state: EventState; releases: NewsRelease[]; now: number; hrefAll?: string; limit?: number; title?: string }) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={`${releases.length} released`}
        divider
        action={
          hrefAll ? (
            <Link href={hrefAll} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              All news
              <ArrowRight className="size-3.5" />
            </Link>
          ) : undefined
        }
      />
      {releases.length === 0 ? (
        <EmptyState icon={<Newspaper className="size-4" />} title="No news yet" description="Breaking news from the host will appear here instantly." className="py-8" />
      ) : (
        <div className="divide-y divide-border">
          {releases.slice(0, limit).map((release) => (
            <NewsReleaseItem key={release.id} state={state} release={release} now={now} compact />
          ))}
        </div>
      )}
    </Card>
  );
}

export function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-56" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}
