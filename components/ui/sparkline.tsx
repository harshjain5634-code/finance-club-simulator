import { chartColors } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SparklineProps = {
  data: number[];
  baseline?: number;
  color?: string;
  className?: string;
};

const WIDTH = 100;
const HEIGHT = 32;
const PAD = 2;

export function Sparkline({ data, baseline, color, className }: SparklineProps) {
  if (data.length < 2) return null;

  const reference = baseline ?? data[0];
  const min = Math.min(...data, reference);
  const max = Math.max(...data, reference);
  const range = max - min || 1;

  const x = (i: number) => (i / (data.length - 1)) * WIDTH;
  const y = (v: number) => PAD + (1 - (v - min) / range) * (HEIGHT - PAD * 2);

  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const stroke =
    color ?? (data[data.length - 1] >= reference ? chartColors.positive : chartColors.negative);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-8 w-24 overflow-visible", className)}
    >
      <line
        x1={0}
        x2={WIDTH}
        y1={y(reference)}
        y2={y(reference)}
        stroke={chartColors.cursor}
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
