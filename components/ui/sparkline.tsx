import { cn } from "@/lib/utils";

type SparklineProps = {
  data: number[];
  baseline?: number;
  tone?: "auto" | "accent" | "muted";
  className?: string;
  strokeWidth?: number;
};

const WIDTH = 100;
const HEIGHT = 32;
const PAD = 2;

/** Pure SVG; colours come from CSS classes so tokens (and themes) apply. */
export function Sparkline({ data, baseline, tone = "auto", className, strokeWidth = 1.25 }: SparklineProps) {
  if (data.length < 2) {
    return <div aria-hidden className={cn("h-8 w-24", className)} />;
  }

  const reference = baseline ?? data[0];
  const min = Math.min(...data, reference);
  const max = Math.max(...data, reference);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * WIDTH;
  const y = (v: number) => PAD + (1 - (v - min) / range) * (HEIGHT - PAD * 2);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");

  const last = data[data.length - 1];
  const strokeClass =
    tone === "accent"
      ? "stroke-accent"
      : tone === "muted"
        ? "stroke-fg-muted"
        : last > reference
          ? "stroke-positive"
          : last < reference
            ? "stroke-negative"
            : "stroke-fg-muted";

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden className={cn("h-8 w-24 overflow-visible", className)}>
      <line
        x1={0}
        x2={WIDTH}
        y1={y(reference)}
        y2={y(reference)}
        className="stroke-border-strong"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={line}
        fill="none"
        className={strokeClass}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
