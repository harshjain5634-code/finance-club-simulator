"use client";

import { useRef } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { NEWS_PRIORITY_LABEL } from "@/components/market/status";
import { changePct, formatPct, formatPrice } from "@/lib/domain/money";
import { formatClock, formatDate } from "@/lib/format";
import type { ChartPoint, PriceMove } from "@/lib/mock/selectors";
import { useChartPalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type TradePrint = { t: number; price: number; quantity: number };
export type RoundBoundary = { t: number; label: string };

type PriceChartProps = {
  points: ChartPoint[];
  /** Reference the line is compared with (round open for the Round range). */
  baseline: number;
  baselineLabel: string;
  moves: PriceMove[];
  trades?: TradePrint[];
  boundaries?: RoundBoundary[];
  /** When set, the x-axis runs to this time and the rest of the round is shaded. */
  axisEnd?: number;
  now: number;
  daily?: boolean;
  label: string;
  className?: string;
};

function scale(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(max * 0.04, 100);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lower = Math.floor((min - span * 0.15) / step) * step;
  const upper = Math.ceil((max + span * 0.25) / step) * step;
  const ticks: number[] = [];
  for (let v = lower; v <= upper + step / 2; v += step) ticks.push(v);
  return { domain: [lower, upper] as [number, number], ticks };
}

/**
 * C4 price chart (section 08 chart spec, implemented with Recharts for this pass). Prices only change at price
 * events, so the line is a step line whose colour follows its direction against the baseline. Every move has a
 * marker: numbered circles for news, diamonds for host changes; dotted rules mark round boundaries, an accent line
 * marks now, and the rest of the round is shaded so the chart doubles as a round clock. The crosshair snaps to
 * points and the tooltip names the move; the same series is also rendered as a screen-reader table.
 */
export function PriceChart({ points, baseline, baselineLabel, moves, trades = [], boundaries = [], axisEnd, now, daily = false, label, className }: PriceChartProps) {
  const scope = useRef<HTMLDivElement>(null);
  const palette = useChartPalette(scope);
  if (points.length < 2) {
    return (
      <div className={cn("grid h-72 place-items-center rounded-md bg-canvas-subtle px-4 text-center", className)}>
        <p className="text-meta text-fg-secondary">No price changes in this range yet. The line starts at the first move.</p>
      </div>
    );
  }

  const start = points[0].t;
  const end = Math.max(axisEnd ?? points[points.length - 1].t, points[points.length - 1].t);
  const last = points[points.length - 1].value;
  const direction = last > baseline ? palette.positive : last < baseline ? palette.negative : palette.muted;
  const values = [...points.map((p) => p.value), baseline, ...trades.map((t) => t.price)];
  const { domain, ticks } = scale(values);
  const visibleMoves = moves.filter((m) => m.at >= start && m.at <= end && m.source !== "OPENING");
  const visibleTrades = trades.filter((t) => t.t >= start && t.t <= end);
  // A marker sitting exactly on the first point would be sliced in half by the axis edge.
  const axisStart = start - Math.max(1000, (end - start) * 0.03);
  const fmtTime = daily ? (t: number) => formatDate(t, { day: "numeric", month: "short" }) : (t: number) => formatClock(t);
  const moveAt = (t: number) => visibleMoves.find((m) => Math.abs(m.at - t) < 1500);

  return (
    <div ref={scope} className={cn("relative h-72 lg:h-80", className)}>
      <ChartTable points={points} moves={visibleMoves} baseline={baseline} baselineLabel={baselineLabel} label={label} daily={daily} />
      <div aria-hidden className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} accessibilityLayer={false} margin={{ top: 28, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={palette.grid} />
          <XAxis dataKey="t" type="number" scale="time" domain={[axisStart, end]} tickFormatter={fmtTime} tick={{ fill: palette.axis, fontSize: 12, fontFamily: "var(--font-dm-mono)" }} tickLine={false} axisLine={false} minTickGap={72} tickMargin={8} />
          <YAxis orientation="right" domain={domain} ticks={ticks} tickFormatter={(v: number) => formatPrice(v)} tick={{ fill: palette.axis, fontSize: 12, fontFamily: "var(--font-dm-mono)" }} tickLine={false} axisLine={false} width={72} />
          {axisEnd && now < end && <ReferenceArea x1={Math.max(now, start)} x2={end} fill={palette.canvas} fillOpacity={0.55} ifOverflow="hidden" />}
          {boundaries
            .filter((b) => b.t >= start && b.t <= end)
            .map((b) => {
              // Drop the caption when it would sit on top of the "Now" label; the dotted line still marks the boundary.
              const crowded = axisEnd !== undefined && Math.abs(b.t - now) < (end - start) * 0.12;
              return (
                <ReferenceLine
                  key={`b-${b.t}-${b.label}`}
                  x={b.t}
                  stroke={palette.cursor}
                  strokeDasharray="2 3"
                  label={crowded ? undefined : { value: b.label, position: "insideTopLeft", fill: palette.axis, fontSize: 12, dy: -22 }}
                />
              );
            })}
          <ReferenceLine y={baseline} stroke={palette.muted} strokeDasharray="4 4" label={{ value: baselineLabel, position: "insideBottomRight", fill: palette.axis, fontSize: 12 }} />
          {axisEnd && now <= end && now >= start && <ReferenceLine x={now} stroke={palette.accent} strokeWidth={1.5} label={{ value: `Now ${formatClock(now)}`, position: "top", fill: palette.accent, fontSize: 12, fontWeight: 600 }} />}
          <Tooltip
            cursor={{ stroke: palette.axis, strokeDasharray: "3 3" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              if (!active || !point) return null;
              const move = moveAt(point.t);
              const pct = changePct(baseline, point.value);
              return (
                <div className="w-64 rounded-md border border-border bg-surface-raised px-3 py-2.5 shadow-popover">
                  <p className="font-mono text-caption text-fg-muted">{daily ? formatDate(point.t, { weekday: "short", day: "numeric", month: "short" }) : formatClock(point.t, true)}</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-[14px] font-medium text-fg-primary">{formatPrice(point.value)}</span>
                    <span className={cn("font-mono text-caption", pct > 0 ? "text-positive" : pct < 0 ? "text-negative" : "text-fg-muted")}>
                      {pct > 0 ? "▲" : pct < 0 ? "▼" : ""} {formatPct(pct)}
                    </span>
                  </p>
                  {move && (
                    <div className="mt-2 border-t border-border-subtle pt-2">
                      <p className="text-caption font-medium text-warning">
                        {move.source === "NEWS" ? `${move.priority ? NEWS_PRIORITY_LABEL[move.priority] : "News"} · News #${move.newsNumber ?? "?"}` : move.source === "MANUAL" ? "Host price change" : "Price change"}
                      </p>
                      {move.headline && <p className="mt-0.5 text-[13px] leading-5 font-medium text-fg-primary">{move.headline}</p>}
                      <p className="mt-0.5 text-caption text-fg-secondary">
                        {formatPrice(move.from)} → {formatPrice(move.to)} ({formatPct(move.changePct)})
                      </p>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Line type="stepAfter" dataKey="value" stroke={direction} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: direction, stroke: palette.surface, strokeWidth: 2 }} isAnimationActive={false} />
          {visibleTrades.length > 0 && <Scatter data={visibleTrades.map((t) => ({ t: t.t, value: t.price }))} dataKey="value" fill={palette.surface} stroke={palette.axis} strokeWidth={1.5} shape="circle" isAnimationActive={false} />}
          {visibleMoves.map((m) =>
            m.source === "NEWS" ? (
              <ReferenceDot
                key={m.id}
                x={m.at}
                y={m.to}
                r={10}
                fill={m.priority === "HIGH" ? palette.warning : palette.muted}
                stroke={palette.surface}
                strokeWidth={2}
                label={{ value: String(m.newsNumber ?? ""), fill: palette.surface, fontSize: 11, fontWeight: 600 }}
                ifOverflow="extendDomain"
              />
            ) : (
              <ReferenceDot key={m.id} x={m.at} y={m.to} r={6} fill={palette.accent} stroke={palette.surface} strokeWidth={2} shape={(props: { cx?: number; cy?: number }) => <rect x={(props.cx ?? 0) - 5} y={(props.cy ?? 0) - 5} width={10} height={10} transform={`rotate(45 ${props.cx} ${props.cy})`} fill={palette.accent} stroke={palette.surface} strokeWidth={2} />} />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * The same series as a table, visible only to screen readers and to "find in page". Rows are the price changes,
 * each with what caused it, so the chart is never the only way to reach the numbers (C4 section 21).
 */
function ChartTable({ points, moves, baseline, baselineLabel, label, daily }: { points: ChartPoint[]; moves: PriceMove[]; baseline: number; baselineLabel: string; label: string; daily: boolean }) {
  const time = daily ? (t: number) => formatDate(t, { day: "numeric", month: "short" }) : (t: number) => formatClock(t, true);
  const moveAt = (t: number) => moves.find((m) => Math.abs(m.at - t) < 1500);
  const reason = (m: PriceMove | undefined) =>
    !m ? "" : m.source === "NEWS" ? `News${m.newsNumber ? ` #${m.newsNumber}` : ""}${m.headline ? `: ${m.headline}` : ""}` : m.source === "MANUAL" ? "Host price change" : "";
  return (
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Price</th>
          <th scope="col">Change vs {baselineLabel.toLowerCase()}</th>
          <th scope="col">What moved it</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point, index) => {
          const pct = changePct(baseline, point.value);
          return (
            <tr key={`${point.t}-${index}`}>
              <td>{time(point.t)}</td>
              <td>₹{formatPrice(point.value)}</td>
              <td>{pct > 0 ? "up" : pct < 0 ? "down" : "level"} {formatPct(Math.abs(pct), { signed: false })}</td>
              <td>{reason(moveAt(point.t))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Legend row under the chart: identity never relies on colour alone. */
export function PriceChartLegend({ symbol, showTrades }: { symbol: string; showTrades: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-fg-secondary" aria-label="Chart legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 bg-fg-secondary" /> {symbol} price
      </li>
      {showTrades && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full border-[1.5px] border-fg-muted" /> Trades between teams
        </li>
      )}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full bg-warning" /> News story
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 rotate-45 bg-accent" /> Host price change
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-3 border-l border-dotted border-border-strong" /> Round boundary
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="w-4 border-t border-dashed border-fg-muted" /> Round open
      </li>
    </ul>
  );
}
