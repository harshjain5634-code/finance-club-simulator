import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CompetitionCard } from "@/components/dashboard/competition-card";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { MarketMovers } from "@/components/dashboard/market-movers";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { PortfolioPerformanceChart } from "@/components/dashboard/portfolio-performance-chart";
import { RecentTrades } from "@/components/dashboard/recent-trades";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getDashboardData } from "@/lib/services/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const data = await getDashboardData();
  const monthTrend = data.performance["1M"].flatMap((point) => (point.value === null ? [] : [point.value]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-1">
        <div className="min-w-0">
          <p className="text-[13px] text-fg-muted">
            Welcome back, <span className="font-medium text-fg">{data.user.firstName}</span>
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Portfolio snapshot ·{" "}
            {formatDate(data.asOf, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })}{" "}
            IST
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="outline" className="h-7 rounded-md px-2 text-xs">
            Simulated data
          </Badge>
          <Link href="/trade" className={buttonClasses({ variant: "primary" })}>
            <Plus className="size-3.5" />
            New order
          </Link>
        </div>
      </div>

      <KpiCards summary={data.summary} trend={monthTrend} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <PortfolioPerformanceChart series={data.performance} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <MarketOverview indices={data.indices} asOf={data.asOf} />
          <CompetitionCard competition={data.competition} asOf={data.asOf} />
        </div>
      </div>

      <HoldingsTable holdings={data.holdings} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <RecentTrades trades={data.trades} asOf={data.asOf} />
        </div>
        <div className="min-w-0 xl:col-span-4 [&>section]:h-full">
          <MarketMovers gainers={data.gainers} losers={data.losers} />
        </div>
      </div>
    </div>
  );
}
