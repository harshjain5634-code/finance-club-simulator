"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { HoldingRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "name" | "symbol" | "quantity" | "averagePrice" | "currentPrice" | "currentValue" | "pnl" | "returnPct";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const columns: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Company", numeric: false },
  { key: "symbol", label: "Symbol", numeric: false },
  { key: "quantity", label: "Qty", numeric: true },
  { key: "averagePrice", label: "Avg. price", numeric: true },
  { key: "currentPrice", label: "Current price", numeric: true },
  { key: "currentValue", label: "Current value", numeric: true },
  { key: "pnl", label: "P&L", numeric: true },
  { key: "returnPct", label: "Return", numeric: true },
];

export function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  const [sort, setSort] = useState<Sort>({ key: "currentValue", direction: "desc" });

  const rows = useMemo(() => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...holdings].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * factor;
      return ((left as number) - (right as number)) * factor;
    });
  }, [holdings, sort]);

  const totals = useMemo(() => {
    const invested = holdings.reduce((sum, h) => sum + h.investedValue, 0);
    const current = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    return { invested, current, pnl: current - invested, returnPct: ((current - invested) / invested) * 100 };
  }, [holdings]);

  function toggleSort(key: SortKey, numeric: boolean) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: numeric ? "desc" : "asc" },
    );
  }

  return (
    <Card>
      <CardHeader
        title="Holdings"
        subtitle={
          <>
            {holdings.length} positions · Invested <span className="tabular-nums">{formatCurrency(totals.invested)}</span>
          </>
        }
        action={
          <Link href="/portfolio" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            View portfolio
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line bg-surface-raised">
              {columns.map((column, index) => {
                const active = sort.key === column.key;
                const SortIcon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "h-9 px-4 font-medium whitespace-nowrap",
                      column.numeric ? "text-right" : "text-left",
                      index === 0 && "sticky left-0 z-10 bg-surface-raised",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key, column.numeric)}
                      className={cn(
                        "group inline-flex items-center gap-1 rounded text-[11px] tracking-wide uppercase transition-colors",
                        column.numeric && "flex-row-reverse",
                        active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
                      )}
                    >
                      {column.label}
                      <SortIcon
                        aria-hidden
                        className={cn("size-3", active ? "text-accent" : "opacity-0 group-hover:opacity-100")}
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="group border-b border-line last:border-b-0">
                <td className="sticky left-0 z-10 bg-surface px-4 py-2 transition-colors duration-150 group-hover:bg-surface-hover">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-raised text-[10px] font-semibold text-fg-muted">
                      {row.symbol.slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-52 truncate font-medium text-fg">{row.name}</p>
                      <p className="text-[11px] text-fg-subtle">{row.sector}</p>
                    </div>
                  </div>
                </td>
                <Cell className="font-mono text-xs text-fg-muted">{row.symbol}</Cell>
                <Cell numeric>{row.quantity}</Cell>
                <Cell numeric className="text-fg-muted">
                  {formatNumber(row.averagePrice)}
                </Cell>
                <Cell numeric>
                  <span className="block text-fg">{formatNumber(row.currentPrice)}</span>
                  <Delta value={row.dayChangePct} className="text-[11px]" />
                </Cell>
                <Cell numeric className="font-medium text-fg">
                  {formatCurrency(row.currentValue)}
                </Cell>
                <Cell numeric>
                  <Delta value={row.pnl} format="currency" />
                </Cell>
                <Cell numeric>
                  <Delta value={row.returnPct} variant="pill" />
                </Cell>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong bg-surface-raised">
              <td className="sticky left-0 z-10 bg-surface-raised px-4 py-2.5 text-xs font-medium text-fg-muted">
                Total
              </td>
              <td colSpan={4} />
              <Cell numeric className="font-semibold text-fg">
                {formatCurrency(totals.current)}
              </Cell>
              <Cell numeric className="font-medium">
                <Delta value={totals.pnl} format="currency" />
              </Cell>
              <Cell numeric>
                <Delta value={totals.returnPct} variant="pill" />
              </Cell>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function Cell({ numeric, className, children }: { numeric?: boolean; className?: string; children: ReactNode }) {
  return (
    <td
      className={cn(
        "px-4 py-2 whitespace-nowrap transition-colors duration-150 group-hover:bg-surface-hover",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}
