"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  /**
   * Drop this column below the `sm` breakpoint. Use it for secondary detail so the columns that
   * matter most (value, P&L, return) are on screen without scrolling on a phone.
   */
  hideBelowSm?: boolean;
  className?: string;
  headerClassName?: string;
};

type Sort = { key: string; direction: "asc" | "desc" };

type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: Sort;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  empty?: ReactNode;
  minWidth?: number;
  /** Min width once `hideBelowSm` columns are dropped. Defaults to `minWidth`. */
  minWidthSm?: number;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  maxHeight?: string;
  dense?: boolean;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  onRowClick,
  rowLabel,
  empty,
  minWidth = 640,
  minWidthSm,
  footer,
  rowClassName,
  maxHeight,
  dense = false,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<Sort | undefined>(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * factor;
      return ((left as number) - (right as number)) * factor;
    });
  }, [rows, columns, sort]);

  const toggle = (column: Column<T>) => {
    if (!column.sortValue) return;
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: column.align === "right" ? "desc" : "asc" },
    );
  };

  const cellPad = dense ? "px-3 py-1.5" : "px-4 py-2";
  const alignClass = (align?: Column<T>["align"]) => (align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left");

  return (
    <div className={cn("overflow-auto", className)} style={maxHeight ? { maxHeight } : undefined}>
      <table
        className="w-full min-w-(--tbl-min-sm) border-collapse text-[13px] sm:min-w-(--tbl-min)"
        style={{ "--tbl-min": `${minWidth}px`, "--tbl-min-sm": `${minWidthSm ?? minWidth}px` } as CSSProperties}
      >
        <thead className={cn(maxHeight && "sticky top-0 z-20")}>
          <tr className="border-y border-border bg-surface-raised">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const SortIcon = !active ? ArrowUpDown : sort!.direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "h-9 font-medium whitespace-nowrap",
                    dense ? "px-3" : "px-4",
                    alignClass(column.align),
                    column.sticky && "sticky left-0 z-10 bg-surface-raised",
                    column.hideBelowSm && "hidden sm:table-cell",
                    column.headerClassName,
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(column)}
                      className={cn(
                        "group inline-flex items-center gap-1 rounded text-[11px] tracking-wide uppercase transition-colors",
                        column.align === "right" && "flex-row-reverse",
                        active ? "text-fg-primary" : "text-fg-muted hover:text-fg-secondary",
                      )}
                    >
                      {column.header}
                      <SortIcon aria-hidden className={cn("size-3", active ? "text-accent" : "opacity-0 group-hover:opacity-100")} />
                    </button>
                  ) : (
                    <span className="text-[11px] tracking-wide text-fg-muted uppercase">{column.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[13px] text-fg-muted">
                {empty ?? "Nothing to show yet."}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
              className={cn(
                "group border-b border-border last:border-b-0",
                onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
                rowClassName?.(row),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    cellPad,
                    "whitespace-nowrap transition-colors duration-150 group-hover:bg-surface-hover",
                    alignClass(column.align),
                    column.align === "right" && "tabular-nums",
                    column.sticky && "sticky left-0 z-10 bg-surface",
                    column.hideBelowSm && "hidden sm:table-cell",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}
