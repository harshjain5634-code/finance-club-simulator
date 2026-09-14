"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { chartColors } from "@/lib/theme";
import type { PerformancePoint, PerformanceRange } from "@/lib/types";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const satisfies readonly PerformanceRange[];

const rangeLabel: Record<PerformanceRange, string> = {
  "1D": "Today",
  "1W": "Past week",
  "1M": "Past month",
  "3M": "Past 3 months",
  "1Y": "Past year",
  ALL: "Since you joined",
};

function formatTick(t: number, range: PerformanceRange) {
  switch (range) {
    case "1D":
      return formatDate(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    case "1W":
      return formatDate(t, { weekday: "short", day: "numeric" });
    case "1M":
    case "3M":
      return formatDate(t, { day: "numeric", month: "short" });
    default:
      return formatDate(t, { month: "short", year: "2-digit" });
  }
}

function formatTooltipDate(t: number, range: PerformanceRange) {
  const intraday = range === "1D" || range === "1W";
  return formatDate(t, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(intraday ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : { year: "numeric" }),
  });
}

// Rounds the axis to even steps (e.g. every ₹5K) so labels read cleanly.
function niceScale(min: number, max: number, targetTicks = 4) {
  const span = max - min || max * 0.02;
  const rawStep = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude;
  const lower = Math.floor((min - span * 0.08) / step) * step;
  const upper = Math.ceil((max + span * 0.08) / step) * step;
  const ticks: number[] = [];
  for (let t = lower; t <= upper + step / 2; t += step) ticks.push(t);
  return { domain: [lower, upper] as [number, number], ticks };
}

type ChartTooltipProps =Pick<TooltipContentProps, "active" | "payload"> & {
  range: PerformanceRange;
  baseline: number;
};

function ChartTooltip({ active, payload, range, baseline }: ChartTooltipProps) {
  const point = payload?.[0]?.payload as PerformancePoint | undefined;
  if (!active || !point || point.value === null) return null;
  const change = point.value - baseline;

  return (
    <div className="min-w-44 rounded-md border border-line-strong bg-surface-raised px-3 py-2 shadow-xl shadow-black/40">
      <p className="text-[11px] text-fg-subtle">{formatTooltipDate(point.t, range)}</p>
      <p className="mt-1 text-[13px] font-semibold text-fg tabular-nums">{formatCurrency(point.value)}</p>
      <p className="mt-0.5 flex gap-1.5 text-xs">
        <Delta value={change} format="currency" />
        <Delta value={(change / baseline) * 100} />
      </p>
    </div>
  );
}

export function PortfolioPerformanceChart({ series }: { series: Record<PerformanceRange, PerformancePoint[]> }) {
  const [range, setRange] = useState<PerformanceRange>("1M");

  const data = series[range];
  const values = data.flatMap((point) => (point.value === null ? [] : [point.value]));
  const baseline = values[0];
  const latest = values[values.length - 1];
  const change = latest - baseline;

  const { domain, ticks } = niceScale(Math.min(...values), Math.max(...values));

  return (
    <Card className="flex h-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-fg">Portfolio performance</h2>
          <p className="mt-2 text-2xl leading-7 font-semibold tracking-tight text-fg tabular-nums">
            {formatCurrency(latest)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
            <Delta value={change} format="currency" />
            <Delta value={(change / baseline) * 100} variant="pill" showArrow />
            <span className="text-fg-subtle">{rangeLabel[range]}</span>
          </p>
        </div>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} label="Chart time range" />
      </header>

      <div className="h-64 px-1 pt-3 pb-2 sm:h-72 xl:h-auto xl:min-h-80 xl:flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="performance-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.16} />
                <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis
              dataKey="t"
              tickFormatter={(t: number) => formatTick(t, range)}
              tick={{ fill: chartColors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              interval="preserveStartEnd"
              tickMargin={8}
            />
            <YAxis
              orientation="right"
              domain={domain}
              ticks={ticks}
              tickFormatter={formatCompactCurrency}
              tick={{ fill: chartColors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <ReferenceLine y={baseline} stroke={chartColors.cursor} strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: chartColors.axis, strokeDasharray: "3 3", strokeWidth: 1 }}
              content={({ active, payload }) => (
                <ChartTooltip active={active} payload={payload} range={range} baseline={baseline} />
              )}
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke={chartColors.accent}
              strokeWidth={1.5}
              fill="url(#performance-fill)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 3.5, fill: chartColors.accent, stroke: chartColors.canvas, strokeWidth: 2 }}
              animationDuration={350}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
