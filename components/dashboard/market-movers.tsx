"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatNumber } from "@/lib/format";
import type { StockQuote } from "@/lib/types";

const TABS = ["Gainers", "Losers"] as const;

export function MarketMovers({ gainers, losers }: { gainers: StockQuote[]; losers: StockQuote[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Gainers");
  const rows = tab === "Gainers" ? gainers : losers;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Market movers"
        subtitle={tab === "Gainers" ? "Top gainers · NSE" : "Top losers · NSE"}
        action={<SegmentedControl options={TABS} value={tab} onChange={setTab} label="Market movers" />}
        divider
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] gap-3 border-b border-line px-4 py-1.5 text-[11px] tracking-wide text-fg-subtle uppercase">
        <span>Stock</span>
        <span className="text-right">Price</span>
        <span className="text-right">Change</span>
      </div>
      <ul className="flex-1 py-1">
        {rows.map((stock) => (
          <li key={stock.symbol}>
            <Link
              href={`/trade?symbol=${stock.symbol}`}
              className="mx-1 grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 hover:bg-surface-hover"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">{stock.symbol}</span>
                <span className="block truncate text-[11px] text-fg-subtle">{stock.name}</span>
              </span>
              <span className="text-right leading-tight">
                <span className="block text-[13px] text-fg tabular-nums">{formatNumber(stock.lastPrice)}</span>
                <Delta value={stock.change} format="number" className="text-[11px]" />
              </span>
              <span className="text-right">
                <Delta value={stock.changePct} variant="pill" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
