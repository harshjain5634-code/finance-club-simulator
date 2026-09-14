import {
  formatPercent,
  formatSignedCurrency,
  formatSignedNumber,
  trendOf,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type DeltaProps = {
  value: number;
  format?: "percent" | "currency" | "number";
  decimals?: number;
  variant?: "text" | "pill";
  showArrow?: boolean;
  className?: string;
};

const textTone = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-fg-muted",
};

const pillTone = {
  positive: "bg-positive/10 text-positive",
  negative: "bg-negative/10 text-negative",
  neutral: "bg-surface-hover text-fg-muted",
};

// The only component that applies gain/loss colour, so green and red stay reserved for P&L.
export function Delta({
  value,
  format = "percent",
  decimals = 2,
  variant = "text",
  showArrow = false,
  className,
}: DeltaProps) {
  const trend = trendOf(value, decimals);
  const label =
    format === "percent"
      ? formatPercent(value, { decimals })
      : format === "currency"
        ? formatSignedCurrency(value, decimals)
        : formatSignedNumber(value, decimals);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums whitespace-nowrap",
        variant === "pill" ? cn("h-5 rounded px-1.5 text-xs font-medium", pillTone[trend]) : textTone[trend],
        className,
      )}
    >
      {showArrow && trend !== "neutral" && (
        <svg viewBox="0 0 8 8" aria-hidden className={cn("size-2 fill-current", trend === "negative" && "rotate-180")}>
          <path d="M4 1 7.5 6.5h-7z" />
        </svg>
      )}
      {label}
    </span>
  );
}
