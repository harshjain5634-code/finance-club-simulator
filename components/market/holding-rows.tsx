"use client";

import Link from "next/link";
import { Delta } from "@/components/ui/delta";
import { Avatar } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { formatINR, formatPrice } from "@/lib/domain/money";
import type { HoldingView } from "@/lib/domain/portfolio";
import type { EventState } from "@/lib/domain/types";
import { formatQuantity } from "@/lib/format";
import { instrumentOf } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

type Variant = "dashboard" | "full";

/**
 * C4 Holdings Row list (section 04 · Holdings Row; used on the dashboard and portfolio). Desktop is a table with
 * numbers in DM Mono; phones get cards with the value, P&L and Buy / Sell buttons instead of a squeezed table.
 */
export function HoldingRows({ state, holdings, code, variant = "dashboard", limit }: { state: EventState; holdings: HoldingView[]; code: string; variant?: Variant; limit?: number }) {
  const rows = [...holdings].sort((a, b) => b.value - a.value).slice(0, limit ?? holdings.length);
  const full = variant === "full";
  const totals = holdings.reduce((acc, h) => ({ value: acc.value + h.value, basis: acc.basis + h.costBasis, pnl: acc.pnl + h.unrealizedPnl }), { value: 0, basis: 0, pnl: 0 });
  const tradeHref = (symbol: string, side: "BUY" | "SELL") => `/event/${code}/trade?symbol=${symbol}&side=${side}`;

  return (
    <>
      {/* Desktop / tablet table */}
      <table className="hidden w-full border-collapse md:table">
        <caption className="sr-only">Your holdings</caption>
        <thead>
          <tr className="h-9 bg-canvas-subtle text-caption text-fg-muted">
            <th scope="col" className="px-(--panel-p) text-left font-medium">Company</th>
            <th scope="col" className="w-20 px-3 text-right font-medium">Qty</th>
            {full && <th scope="col" className="w-28 px-3 text-right font-medium">Avg price</th>}
            <th scope="col" className="w-28 px-3 text-right font-medium">{full ? "Last price" : "Price"}</th>
            <th scope="col" className="w-32 px-3 text-right font-medium">Value</th>
            <th scope="col" className="w-28 px-3 text-right font-medium">P&amp;L</th>
            {full && <th scope="col" className="w-24 px-3 text-right font-medium">Return</th>}
            <th scope="col" className="w-36 pr-(--panel-p)">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const instrument = instrumentOf(state, h.instrumentId)!;
            return (
              <tr key={h.instrumentId} className="group h-(--row-h) border-b border-border-subtle last:border-b-0 hover:bg-surface-hover">
                <td className="px-(--panel-p)">
                  <Link href={`/event/${code}/markets/${instrument.symbol}`} className="flex min-w-0 items-center gap-3 rounded-sm">
                    <Avatar name={instrument.name} text={instrument.symbol.slice(0, 2)} tone="accent" size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-fg-primary">{instrument.name}</span>
                      <span className="block truncate text-caption text-fg-muted">
                        {instrument.symbol} · {instrument.sector}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 text-right font-mono text-[14px] text-fg-primary tabular-nums">{formatQuantity(h.quantity)}</td>
                {full && <td className="px-3 text-right font-mono text-[14px] text-fg-secondary tabular-nums">{formatPrice(h.averageCost)}</td>}
                <td className="px-3 text-right font-mono text-[14px] text-fg-primary tabular-nums">{formatPrice(h.price)}</td>
                <td className="px-3 text-right font-mono text-[14px] font-medium text-fg-primary tabular-nums">{formatINR(h.value, 0)}</td>
                <td className="px-3 text-right font-mono text-[14px]">
                  <Delta value={h.unrealizedPnl} format="inr" decimals={0} />
                </td>
                {full && (
                  <td className="px-3 text-right">
                    <Delta value={h.returnPct} variant="pill" showArrow />
                  </td>
                )}
                <td className="pr-(--panel-p) text-right">
                  <span className="inline-flex gap-1.5">
                    <Link href={tradeHref(instrument.symbol, "BUY")} className={buttonClasses({ variant: "ghost", size: "sm", className: "group-hover:border group-hover:border-border-strong group-hover:bg-surface" })} aria-label={`Buy ${instrument.symbol}`}>
                      Buy
                    </Link>
                    <Link href={tradeHref(instrument.symbol, "SELL")} className={buttonClasses({ variant: "ghost", size: "sm", className: "group-hover:border group-hover:border-border-strong group-hover:bg-surface" })} aria-label={`Sell ${instrument.symbol}`}>
                      Sell
                    </Link>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        {full && holdings.length > 0 && (
          <tfoot>
            <tr className="h-12 bg-canvas-subtle">
              <th scope="row" className="px-(--panel-p) text-left text-[13px] font-medium text-fg-primary">
                Total · {holdings.length} {holdings.length === 1 ? "stock" : "stocks"}
              </th>
              <td colSpan={3} />
              <td className="px-3 text-right font-mono text-[14px] font-medium text-fg-primary tabular-nums">{formatINR(totals.value, 0)}</td>
              <td className="px-3 text-right font-mono text-[14px] font-medium">
                <Delta value={totals.pnl} format="inr" decimals={0} />
              </td>
              <td className="px-3 text-right">
                <Delta value={totals.basis ? (totals.pnl / totals.basis) * 100 : 0} showArrow className="font-mono text-[13px] font-medium" />
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      {/* Phone cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((h) => {
          const instrument = instrumentOf(state, h.instrumentId)!;
          return (
            <li key={h.instrumentId} className="rounded-lg border border-border bg-surface p-4">
              <Link href={`/event/${code}/markets/${instrument.symbol}`} className="flex items-start gap-3">
                <Avatar name={instrument.name} text={instrument.symbol.slice(0, 2)} tone="accent" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-fg-primary">{instrument.name}</span>
                  <span className="block truncate text-caption text-fg-muted">
                    {formatQuantity(h.quantity)} shares · ₹{formatPrice(h.price)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[15px] font-medium text-fg-primary tabular-nums">{formatINR(h.value, 0)}</span>
                  <span className="flex items-center justify-end gap-1.5 font-mono text-caption">
                    <Delta value={h.unrealizedPnl} format="inr" decimals={0} />
                    <Delta value={h.returnPct} showArrow />
                  </span>
                </span>
              </Link>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={tradeHref(instrument.symbol, "BUY")} className={buttonClasses({ variant: "secondary", size: "sm", className: "h-11" })}>
                  Buy
                </Link>
                <Link href={tradeHref(instrument.symbol, "SELL")} className={buttonClasses({ variant: "secondary", size: "sm", className: "h-11" })}>
                  Sell
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function HoldingsEmpty({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn("px-6 py-10 text-center", className)}>
      <p className="text-h3 font-semibold text-fg-primary">You don&apos;t own any shares yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-meta text-fg-secondary">Buy from another team, or accept a proposal sent to you.</p>
      <Link href={`/event/${code}/markets`} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-4" })}>
        Browse the market
      </Link>
    </div>
  );
}
