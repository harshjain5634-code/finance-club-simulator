import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatClockTime, formatCurrency, formatNumber, formatShortDate, isSameDay } from "@/lib/format";
import type { Trade, TradeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusStyle: Record<TradeStatus, { label: string; tone: BadgeTone; dot: string }> = {
  EXECUTED: { label: "Executed", tone: "neutral", dot: "bg-fg-muted" },
  OPEN: { label: "Open", tone: "accent", dot: "bg-accent" },
  CANCELLED: { label: "Cancelled", tone: "outline", dot: "bg-fg-subtle" },
};

export function RecentTrades({ trades, asOf }: { trades: Trade[]; asOf: number }) {
  return (
    <Card>
      <CardHeader
        title="Recent trades"
        subtitle="Orders placed in the simulator"
        action={
          <Link href="/trade" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            All orders
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line bg-surface-raised text-[11px] tracking-wide text-fg-subtle uppercase">
              <th scope="col" className="h-9 px-4 text-left font-medium">Time</th>
              <th scope="col" className="px-4 text-left font-medium">Stock</th>
              <th scope="col" className="px-4 text-left font-medium">Side</th>
              <th scope="col" className="px-4 text-right font-medium">Qty</th>
              <th scope="col" className="px-4 text-right font-medium">Price</th>
              <th scope="col" className="px-4 text-right font-medium">Value</th>
              <th scope="col" className="px-4 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const status = statusStyle[trade.status];
              const cancelled = trade.status === "CANCELLED";
              return (
                <tr
                  key={trade.id}
                  className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="block text-fg tabular-nums">{formatClockTime(trade.placedAt)}</span>
                    <span className="block text-[11px] text-fg-subtle">
                      {isSameDay(trade.placedAt, asOf) ? "Today" : formatShortDate(trade.placedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="block font-medium text-fg">{trade.symbol}</span>
                    <span className="block max-w-44 truncate text-[11px] text-fg-subtle">
                      {trade.orderType === "LIMIT" ? "Limit" : "Market"} · {trade.id}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={trade.side === "BUY" ? "accent" : "outline"} className="w-10 justify-center">
                      {trade.side === "BUY" ? "Buy" : "Sell"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right text-fg tabular-nums">{trade.quantity}</td>
                  <td className="px-4 py-2 text-right text-fg-muted tabular-nums">{formatNumber(trade.price)}</td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-medium tabular-nums",
                      cancelled ? "text-fg-subtle line-through" : "text-fg",
                    )}
                  >
                    {formatCurrency(trade.quantity * trade.price)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Badge tone={status.tone}>
                      <span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden />
                      {status.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
