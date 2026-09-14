"use client";

import { useRef } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactINR, formatINR, formatPct, changePct } from "@/lib/domain/money";
import { formatClock, formatDate } from "@/lib/format";
import type { ChartPoint, ChartRange } from "@/lib/mock/selectors";
import { useChartPalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

function niceScale(min: number, max: number, targetTicks = 4) {
  const span = max - min || Math.max(max * 0.02, 100);
  const rawStep = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude;
  const lower = Math.floor((min - span * 0.1) / step) * step;
  const upper = Math.ceil((max + span * 0.1) / step) * step;
  const ticks: number[] = [];
  for (let t = lower; t <= upper + step / 2; t += step) ticks.push(t);
  return { domain: [lower, upper] as [number, number], ticks };
}

type ValueChartProps = {
  points: ChartPoint[];
  range: ChartRange;
  height?: string;
  baseline?: number;
  className?: string;
  label: string;
  compactAxis?: boolean;
};

/** Step chart for event-time values (prices change only through discrete PriceEvents). */
export function ValueChart({ points, range, height = "h-64", baseline, className, label, compactAxis = true }: ValueChartProps) {
  const scope = useRef<HTMLDivElement>(null);
  const palette = useChartPalette(scope);
  const values = points.map((p) => p.value);
  const reference = baseline ?? values[0] ?? 0;
  const { domain, ticks } = niceScale(Math.min(...values, reference), Math.max(...values, reference));
  const start = points[0]?.t ?? 0;
  const end = points[points.length - 1]?.t ?? 1;
  const gradientId = `fill-${label.replace(/\W/g, "")}`;
  const preEvent = range === "PRE_EVENT";

  return (
    <div ref={scope} className={cn(height, className)} role="img" aria-label={label}>
      {points.length > 1 && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.accent} stopOpacity={0.16} />
                <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={palette.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              tickFormatter={(t: number) => (preEvent ? formatDate(t, { day: "numeric", month: "short" }) : formatClock(t))}
              tick={{ fill: palette.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={56}
              tickMargin={8}
            />
            <YAxis
              orientation="right"
              domain={domain}
              ticks={ticks}
              tickFormatter={(v: number) => (compactAxis ? formatCompactINR(v) : `₹${(v / 100).toFixed(0)}`)}
              tick={{ fill: palette.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={62}
            />
            <ReferenceLine y={reference} stroke={palette.cursor} strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: palette.axis, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined;
                if (!active || !point) return null;
                return (
                  <div className="min-w-40 rounded-md border border-border-strong bg-surface-raised px-3 py-2 shadow-xl shadow-black/40">
                    <p className="text-[11px] text-fg-muted">{preEvent ? formatDate(point.t, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : formatClock(point.t, true)}</p>
                    <p className="mt-0.5 text-[13px] font-semibold text-fg-primary tabular-nums">{formatINR(point.value)}</p>
                    <p className={cn("text-xs tabular-nums", point.value > reference ? "text-positive" : point.value < reference ? "text-negative" : "text-fg-secondary")}>
                      {formatPct(changePct(reference, point.value))}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type={preEvent ? "linear" : "stepAfter"}
              dataKey="value"
              stroke={palette.accent}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3.5, fill: palette.accent, stroke: palette.canvas, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
