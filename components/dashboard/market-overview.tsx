import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { Sparkline } from "@/components/ui/sparkline";
import { formatClockTime, formatNumber } from "@/lib/format";
import type { MarketIndex } from "@/lib/types";

export function MarketOverview({ indices, asOf }: { indices: MarketIndex[]; asOf: number }) {
  return (
    <Card>
      <CardHeader title="Market overview" subtitle={`Indices · as of ${formatClockTime(asOf)} IST`} divider />
      <ul className="divide-y divide-line">
        {indices.map((index) => {
          const change = index.value - index.previousClose;
          return (
            <li
              key={index.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-hover/60"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  {index.name}
                  <span className="text-[10px] font-normal text-fg-subtle">{index.exchange}</span>
                </p>
                <p className="mt-0.5 text-[15px] font-semibold text-fg tabular-nums">{formatNumber(index.value)}</p>
              </div>
              <Sparkline data={index.intraday} baseline={index.previousClose} className="h-8 w-16 sm:w-20" />
              <div className="flex flex-col items-end gap-1">
                <Delta value={(change / index.previousClose) * 100} variant="pill" showArrow />
                <Delta value={change} format="number" className="text-[11px]" />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
