"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { HoldingsTable } from "@/components/market/tables";
import { formatINR, formatPct } from "@/lib/domain/money";
import { symbolOf, teamSummary } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { stockHref, useTerminal } from "./terminal-context";

export function PortfolioScreen() {
  const { state, team, code, teamId } = useTerminal();
  const summary = useMemo(() => teamSummary(state, teamId)!, [state, teamId]);
  const symbol = symbolOf(state);

  const segments = [
    { key: "cash", label: "Cash", value: summary.cash, className: "bg-fg-muted/45" },
    ...summary.holdings
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((h, index) => ({ key: h.instrumentId, label: symbol(h.instrumentId), value: h.value, className: ALLOCATION_SHADES[index % ALLOCATION_SHADES.length] })),
  ];

  const trend = (v: number) => (v > 0 ? "text-positive" : v < 0 ? "text-negative" : undefined);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Portfolio" description={`${team.name} · valued at current reference prices`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Net worth" value={formatINR(summary.netWorth)} sub="Cash + holdings" />
        <StatTile label="Cash" value={formatINR(summary.cash)} sub={`${formatPct(summary.netWorth ? (summary.cash / summary.netWorth) * 100 : 0, { signed: false, decimals: 1 })} of net worth`} />
        <StatTile label="Capital base" value={formatINR(summary.capitalBase)} sub="Starting allocation ± capital changes" />
        <StatTile label="Return" value={formatPct(summary.returnPct)} valueClassName={trend(summary.returnPct)} sub="(Net worth − base) ÷ base" />
        <StatTile label="Realized P&L" value={<Delta value={summary.realizedPnl} format="inr" />} sub="From completed sales" />
        <StatTile label="Unrealized P&L" value={<Delta value={summary.unrealizedPnl} format="inr" />} sub="Open positions vs cost" />
      </div>

      <Card>
        <CardHeader title="Allocation" subtitle="Share of net worth by asset" divider />
        <div className="px-4 py-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-hover" role="img" aria-label="Portfolio allocation bar">
            {segments.map((segment) => (
              <div key={segment.key} className={cn("h-full border-r border-canvas last:border-r-0", segment.className)} style={{ width: `${summary.netWorth ? (segment.value / summary.netWorth) * 100 : 0}%` }} title={`${segment.label}: ${formatINR(segment.value)}`} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            {segments.map((segment) => (
              <li key={segment.key} className="flex min-w-0 items-center gap-2 text-xs">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", segment.className)} />
                <span className="truncate font-medium text-fg-primary">{segment.label}</span>
                <span className="ml-auto text-fg-secondary tabular-nums">{formatPct(summary.netWorth ? (segment.value / summary.netWorth) * 100 : 0, { signed: false, decimals: 1 })}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader title="Holdings" subtitle={`${summary.holdings.length} positions`} />
        <HoldingsTable state={state} holdings={summary.holdings} stockHref={stockHref(code)} />
      </Card>
    </div>
  );
}

/** One accent hue at stepped opacities keeps the palette restrained and theme-token based. */
const ALLOCATION_SHADES = ["bg-accent", "bg-accent/80", "bg-accent/65", "bg-accent/50", "bg-accent/38", "bg-accent/28", "bg-accent/20", "bg-accent/14"];
