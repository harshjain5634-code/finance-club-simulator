import { formatPct, formatSignedINR } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type DeltaProps = {
  value: number;
  /** percent: 7.34 → +7.34% · inr: value in paise · number: plain signed number */
  format?: "percent" | "inr" | "number";
  decimals?: number;
  variant?: "text" | "pill";
  showArrow?: boolean;
  className?: string;
};

type Trend = "positive" | "negative" | "neutral";

const textTone: Record<Trend, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-fg-secondary",
};

const pillTone: Record<Trend, string> = {
  positive: "bg-positive/10 text-positive",
  negative: "bg-negative/10 text-negative",
  neutral: "bg-surface-hover text-fg-secondary",
};

function trendOf(value: number, format: DeltaProps["format"], decimals: number): Trend {
  const scaled = format === "inr" ? value / 100 : value;
  const rounded = Number(scaled.toFixed(decimals));
  return rounded > 0 ? "positive" : rounded < 0 ? "negative" : "neutral";
}

/** The only component that applies gain/loss colour, keeping green and red reserved for P&L. */
export function Delta({ value, format = "percent", decimals = 2, variant = "text", showArrow = false, className }: DeltaProps) {
  const trend = trendOf(value, format, decimals);
  const label =
    format === "percent"
      ? formatPct(value, { decimals })
      : format === "inr"
        ? formatSignedINR(value, decimals)
        : `${trend === "positive" ? "+" : trend === "negative" ? "−" : ""}${Math.abs(value).toFixed(decimals)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums whitespace-nowrap",
        variant === "pill" ? cn("h-5 rounded px-1.5 text-xs font-medium", pillTone[trend]) : textTone[trend],
        className,
      )}
    >
      {showArrow && trend !== "neutral" && (
        <svg viewBox="0 0 8 8" aria-hidden className={cn("size-2 shrink-0 fill-current", trend === "negative" && "rotate-180")}>
          <path d="M4 1 7.5 6.5h-7z" />
        </svg>
      )}
      {label}
    </span>
  );
}
