import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { Sparkline } from "@/components/ui/sparkline";
import { formatCurrency, formatPercent, formatSignedCurrency, trendOf } from "@/lib/format";
import { chartColors } from "@/lib/theme";
import type { PortfolioSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  footer: ReactNode;
  aside?: ReactNode;
};

function KpiCard({ label, value, valueClassName, footer, aside }: KpiCardProps) {
  return (
    <Card className="flex items-end justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        <p className={cn("mt-1.5 text-[22px] leading-7 font-semibold tracking-tight text-fg tabular-nums", valueClassName)}>
          {value}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">{footer}</div>
      </div>
      {aside}
    </Card>
  );
}

const trendText = { positive: "text-positive", negative: "text-negative", neutral: "text-fg" };

export function KpiCards({ summary, trend }: { summary: PortfolioSummary; trend: number[] }) {
  const cashShare = (summary.availableCash / summary.portfolioValue) * 100;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Portfolio value"
        value={formatCurrency(summary.portfolioValue)}
        footer={
          <>
            <span>Invested</span>
            <span className="text-fg-muted tabular-nums">{formatCurrency(summary.holdingsValue, 0)}</span>
          </>
        }
        aside={<Sparkline data={trend} color={chartColors.accent} className="mb-1 hidden h-9 w-20 shrink-0 sm:block" />}
      />
      <KpiCard
        label="Today's P&L"
        value={formatSignedCurrency(summary.todayPnl)}
        valueClassName={trendText[trendOf(summary.todayPnl)]}
        footer={
          <>
            <Delta value={summary.todayPnlPct} showArrow />
            <span>vs previous close</span>
          </>
        }
      />
      <KpiCard
        label="Available cash"
        value={formatCurrency(summary.availableCash)}
        footer={<span className="tabular-nums">{formatPercent(cashShare, { signed: false, decimals: 1 })} of portfolio</span>}
      />
      <KpiCard
        label="Total return"
        value={formatSignedCurrency(summary.totalReturn)}
        valueClassName={trendText[trendOf(summary.totalReturn)]}
        footer={
          <>
            <Delta value={summary.totalReturnPct} showArrow />
            <span>
              on <span className="tabular-nums">{formatCurrency(summary.startingCapital, 0)}</span> capital
            </span>
          </>
        }
      />
    </div>
  );
}
