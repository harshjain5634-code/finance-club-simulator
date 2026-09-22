"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/misc";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Delta } from "@/components/ui/delta";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import type { HoldingView } from "@/lib/domain/portfolio";
import type { EventState, LeaderboardRow, Trade, TradeProposal } from "@/lib/domain/types";
import { formatClock, formatDateTime, formatQuantity, formatShortDate } from "@/lib/format";
import { instrumentOf, isBuyerFor, symbolOf, teamNameOf, type TeamLedgerRow } from "@/lib/mock/selectors";
import { sharedRanks } from "@/lib/domain/leaderboard";
import { cn } from "@/lib/utils";
import { AdjustmentTypeBadge, JournalTypeBadge, ProposalStatusBadge, SideBadge } from "./status";

export function SymbolMark({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface-raised text-[10px] font-semibold tracking-tight text-fg-secondary", className)}>
      {symbol.slice(0, 2)}
    </span>
  );
}

function roundName(state: EventState, roundId: string | null) {
  const round = state.rounds.find((r) => r.id === roundId);
  return round ? `R${round.number}` : "Pre-event";
}

function timeCell(at: number, now?: number) {
  const sameDay = now ? formatShortDate(at) === formatShortDate(now) : true;
  return (
    <span className="block leading-tight">
      <span className="block text-fg-primary tabular-nums">{formatClock(at, true)}</span>
      {!sameDay && <span className="block text-[11px] text-fg-muted">{formatShortDate(at)}</span>}
    </span>
  );
}

/* ───────── Holdings ───────── */

export function HoldingsTable({ state, holdings, stockHref, showAllocation = true, empty = "No holdings." }: { state: EventState; holdings: HoldingView[]; stockHref?: (symbol: string) => string; showAllocation?: boolean; empty?: ReactNode }) {
  const totals = holdings.reduce((acc, h) => ({ value: acc.value + h.value, basis: acc.basis + h.costBasis }), { value: 0, basis: 0 });
  const columns: Column<HoldingView>[] = [
    {
      key: "company",
      header: "Company",
      sticky: true,
      sortValue: (h) => instrumentOf(state, h.instrumentId)?.name ?? "",
      cell: (h) => {
        const instrument = instrumentOf(state, h.instrumentId)!;
        const content = (
          <span className="flex items-center gap-2.5">
            <SymbolMark symbol={instrument.symbol} />
            <span className="min-w-0">
              <span className="block max-w-48 truncate font-medium text-fg-primary">{instrument.name}</span>
              {/* Phones drop the qty/price columns, so carry those numbers here instead of the sector. */}
              <span className="block text-[11px] text-fg-muted tabular-nums sm:hidden">
                {formatQuantity(h.quantity)} × {formatPrice(h.price)}
              </span>
              <span className="hidden text-[11px] text-fg-muted sm:block">{instrument.sector}</span>
            </span>
          </span>
        );
        return stockHref ? (
          <Link href={stockHref(instrument.symbol)} className="rounded hover:underline hover:decoration-border-strong hover:underline-offset-4">
            {content}
          </Link>
        ) : (
          content
        );
      },
    },
    { key: "symbol", header: "Symbol", hideBelowSm: true, sortValue: (h) => symbolOf(state)(h.instrumentId), cell: (h) => <span className="font-mono text-xs text-fg-secondary">{symbolOf(state)(h.instrumentId)}</span> },
    { key: "qty", header: "Qty", align: "right", hideBelowSm: true, sortValue: (h) => h.quantity, cell: (h) => formatQuantity(h.quantity) },
    { key: "avg", header: "Avg cost", align: "right", hideBelowSm: true, sortValue: (h) => h.averageCost, cell: (h) => <span className="text-fg-secondary">{formatPrice(Math.round(h.averageCost))}</span> },
    { key: "price", header: "Price", align: "right", hideBelowSm: true, sortValue: (h) => h.price, cell: (h) => formatPrice(h.price) },
    { key: "value", header: "Value", align: "right", sortValue: (h) => h.value, cell: (h) => <span className="font-medium text-fg-primary">{formatINR(h.value)}</span> },
    { key: "pnl", header: "Unrealized P&L", align: "right", sortValue: (h) => h.unrealizedPnl, cell: (h) => <Delta value={h.unrealizedPnl} format="inr" /> },
    { key: "ret", header: "Return", align: "right", sortValue: (h) => h.returnPct, cell: (h) => <Delta value={h.returnPct} variant="pill" /> },
    ...(showAllocation
      ? [
          {
            key: "alloc",
            header: "Allocation",
            align: "right" as const,
            hideBelowSm: true,
            sortValue: (h: HoldingView) => h.allocationPct,
            cell: (h: HoldingView) => (
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-hover">
                  <span className="block h-full bg-accent" style={{ width: `${Math.min(100, h.allocationPct)}%` }} />
                </span>
                <span className="w-12 text-right text-fg-secondary">{formatPct(h.allocationPct, { signed: false, decimals: 1 })}</span>
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <DataTable
      rows={holdings}
      columns={columns}
      rowKey={(h) => h.instrumentId}
      initialSort={{ key: "value", direction: "desc" }}
      minWidth={showAllocation ? 1000 : 900}
      minWidthSm={460}
      empty={empty}
      footer={
        holdings.length > 0 ? (
          <tfoot>
            <tr className="border-t border-border-strong bg-surface-raised">
              <td className="sticky left-0 z-10 bg-surface-raised px-4 py-2.5 text-xs font-medium text-fg-secondary">Total</td>
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="px-4 text-right font-semibold text-fg-primary tabular-nums">{formatINR(totals.value)}</td>
              <td className="px-4 text-right tabular-nums">
                <Delta value={totals.value - totals.basis} format="inr" />
              </td>
              <td className="px-4 text-right">
                <Delta value={totals.basis ? ((totals.value - totals.basis) / totals.basis) * 100 : 0} variant="pill" />
              </td>
              {showAllocation && <td className="hidden sm:table-cell" />}
            </tr>
          </tfoot>
        ) : undefined
      }
    />
  );
}

/* ───────── Trades ───────── */

export function TradesTable({ state, trades, perspectiveTeamId, onRowClick, now }: { state: EventState; trades: Trade[]; perspectiveTeamId?: string; onRowClick?: (trade: Trade) => void; now?: number }) {
  const name = teamNameOf(state);
  const columns: Column<Trade>[] = [
    { key: "time", header: "Time", sortValue: (t) => t.settledAt, cell: (t) => timeCell(t.settledAt, now) },
    { key: "id", header: "Trade", sortValue: (t) => t.id, cell: (t) => <span className="font-mono text-xs text-fg-secondary">{t.id}</span> },
    { key: "round", header: "Round", sortValue: (t) => t.roundId ?? "", cell: (t) => <span className="text-fg-secondary">{roundName(state, t.roundId)}</span> },
    {
      key: "stock",
      header: "Stock",
      sortValue: (t) => symbolOf(state)(t.instrumentId),
      cell: (t) => <span className="font-medium text-fg-primary">{symbolOf(state)(t.instrumentId)}</span>,
    },
    ...(perspectiveTeamId
      ? [
          { key: "side", header: "Side", cell: (t: Trade) => <SideBadge buy={t.buyerTeamId === perspectiveTeamId} /> },
          { key: "counterparty", header: "Counterparty", cell: (t: Trade) => name(t.buyerTeamId === perspectiveTeamId ? t.sellerTeamId : t.buyerTeamId) },
        ]
      : [
          { key: "buyer", header: "Buyer", sortValue: (t: Trade) => name(t.buyerTeamId), cell: (t: Trade) => name(t.buyerTeamId) },
          { key: "seller", header: "Seller", sortValue: (t: Trade) => name(t.sellerTeamId), cell: (t: Trade) => name(t.sellerTeamId) },
        ]),
    { key: "qty", header: "Qty", align: "right", sortValue: (t) => t.quantity, cell: (t) => formatQuantity(t.quantity) },
    { key: "price", header: "Price", align: "right", sortValue: (t) => t.price, cell: (t) => formatPrice(t.price) },
    { key: "value", header: "Value", align: "right", sortValue: (t) => t.value, cell: (t) => <span className="font-medium text-fg-primary">{formatINR(t.value)}</span> },
  ];
  return (
    <DataTable
      rows={trades}
      columns={columns}
      rowKey={(t) => t.id}
      initialSort={{ key: "time", direction: "desc" }}
      onRowClick={onRowClick}
      rowLabel={(t) => `Trade ${t.id}`}
      minWidth={860}
      empty="No settled trades yet."
    />
  );
}

/* ───────── Proposals ───────── */

export function ProposalsTable({ state, proposals, perspectiveTeamId, onRowClick, now }: { state: EventState; proposals: TradeProposal[]; perspectiveTeamId?: string; onRowClick?: (p: TradeProposal) => void; now?: number }) {
  const name = teamNameOf(state);
  const columns: Column<TradeProposal>[] = [
    { key: "time", header: "Created", sortValue: (p) => p.createdAt, cell: (p) => timeCell(p.createdAt, now) },
    { key: "id", header: "Proposal", sortValue: (p) => p.id, cell: (p) => <span className="font-mono text-xs text-fg-secondary">{p.id}</span> },
    { key: "round", header: "Round", cell: (p) => <span className="text-fg-secondary">{roundName(state, p.roundId)}</span> },
    ...(perspectiveTeamId
      ? [
          {
            key: "direction",
            header: "Direction",
            cell: (p: TradeProposal) => (
              <span className="text-fg-secondary">{p.proposerTeamId === perspectiveTeamId ? "Outgoing" : "Incoming"}</span>
            ),
          },
          { key: "side", header: "You", cell: (p: TradeProposal) => <SideBadge buy={isBuyerFor(p, perspectiveTeamId)} /> },
          {
            key: "counterparty",
            header: "Counterparty",
            cell: (p: TradeProposal) => name(p.proposerTeamId === perspectiveTeamId ? p.counterpartyTeamId : p.proposerTeamId),
          },
        ]
      : [
          { key: "proposer", header: "Proposer", sortValue: (p: TradeProposal) => name(p.proposerTeamId), cell: (p: TradeProposal) => name(p.proposerTeamId) },
          { key: "side", header: "Side", cell: (p: TradeProposal) => <SideBadge buy={p.side === "BUY"} /> },
          { key: "counterparty", header: "Counterparty", sortValue: (p: TradeProposal) => name(p.counterpartyTeamId), cell: (p: TradeProposal) => name(p.counterpartyTeamId) },
        ]),
    { key: "stock", header: "Stock", sortValue: (p) => symbolOf(state)(p.instrumentId), cell: (p) => <span className="font-medium text-fg-primary">{symbolOf(state)(p.instrumentId)}</span> },
    { key: "qty", header: "Qty", align: "right", sortValue: (p) => p.quantity, cell: (p) => formatQuantity(p.quantity) },
    { key: "price", header: "Price", align: "right", sortValue: (p) => p.price, cell: (p) => formatPrice(p.price) },
    { key: "value", header: "Value", align: "right", sortValue: (p) => p.price * p.quantity, cell: (p) => formatINR(p.price * p.quantity) },
    { key: "status", header: "Status", sortValue: (p) => p.status, cell: (p) => <ProposalStatusBadge status={p.status} /> },
    {
      key: "reason",
      header: "Reason",
      cell: (p) => {
        const reason = p.failureReason ?? p.rejectionReason;
        return reason ? (
          <span className="block max-w-72 truncate text-xs text-fg-secondary" title={reason}>
            {reason}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
  ];
  return (
    <DataTable
      rows={proposals}
      columns={columns}
      rowKey={(p) => p.id}
      initialSort={{ key: "time", direction: "desc" }}
      onRowClick={onRowClick}
      rowLabel={(p) => `Proposal ${p.id}`}
      minWidth={1180}
      empty="No proposals yet."
    />
  );
}

/* ───────── Ledger ───────── */

export function LedgerTable({ state, rows, now }: { state: EventState; rows: TeamLedgerRow[]; now?: number }) {
  const symbol = symbolOf(state);
  const columns: Column<TeamLedgerRow>[] = [
    { key: "time", header: "Time", sortValue: (r) => r.journal.at, cell: (r) => timeCell(r.journal.at, now) },
    { key: "id", header: "Journal", cell: (r) => <span className="font-mono text-xs text-fg-secondary">{r.journal.id}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.journal.type, cell: (r) => <JournalTypeBadge type={r.journal.type} /> },
    {
      key: "memo",
      header: "Description",
      cell: (r) => (
        <span className="block max-w-80 leading-tight">
          <span className="block truncate text-fg-primary">{r.journal.memo}</span>
          {r.journal.reason && <span className="block truncate text-[11px] text-fg-muted">Reason: {r.journal.reason}</span>}
        </span>
      ),
    },
    { key: "cash", header: "Cash change", align: "right", sortValue: (r) => r.cashChange, cell: (r) => (r.cashChange ? <Delta value={r.cashChange} format="inr" /> : <span className="text-fg-muted">—</span>) },
    {
      key: "shares",
      header: "Share changes",
      cell: (r) =>
        r.shareChanges.length ? (
          <span className="block max-w-72 truncate text-xs text-fg-secondary">
            {r.shareChanges.map((s) => `${s.amount > 0 ? "+" : "−"}${Math.abs(s.amount)} ${symbol(s.instrumentId)}`).join(", ")}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { key: "balance", header: "Cash after", align: "right", cell: (r) => (r.cashAfter !== null ? formatINR(r.cashAfter) : <span className="text-fg-muted">—</span>) },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.journal.id} initialSort={{ key: "time", direction: "desc" }} minWidth={1000} empty="No ledger entries yet." />;
}

/* ───────── Adjustments ───────── */

export function AdjustmentsTable({ state, teamId }: { state: EventState; teamId: string }) {
  const rows = state.adjustments.filter((a) => a.teamId === teamId).sort((a, b) => b.at - a.at);
  const symbol = symbolOf(state);
  return (
    <DataTable
      rows={rows}
      rowKey={(a) => a.id}
      minWidth={900}
      empty="No manual adjustments for this team."
      columns={[
        { key: "time", header: "Time", cell: (a) => <span className="tabular-nums">{formatDateTime(a.at)}</span> },
        { key: "id", header: "Ref", cell: (a) => <span className="font-mono text-xs text-fg-secondary">{a.id}</span> },
        { key: "type", header: "Type", cell: (a) => <AdjustmentTypeBadge type={a.adjustmentType} /> },
        { key: "what", header: "Adjustment", cell: (a) => (a.kind === "CASH" ? <Delta value={a.amount} format="inr" /> : <span className="tabular-nums">{a.amount > 0 ? "+" : "−"}{Math.abs(a.amount)} {symbol(a.instrumentId ?? "")}</span>) },
        { key: "beforeAfter", header: "Before → after", cell: (a) => <span className="text-fg-secondary tabular-nums">{a.kind === "CASH" ? `${formatINR(a.before)} → ${formatINR(a.after)}` : `${a.before} → ${a.after}`}</span> },
        { key: "reason", header: "Reason", cell: (a) => <span className="block max-w-72 truncate text-fg-secondary" title={a.reason}>{a.reason}</span> },
      ]}
    />
  );
}

/* ───────── Leaderboard ───────── */

/** `hideFlat` drops the "no change" dash where the component sits inside a sentence rather than a table column. */
export function RankMovement({ movement, hideFlat = false, className }: { movement: number; hideFlat?: boolean; className?: string }) {
  if (movement === 0) {
    if (hideFlat) return null;
    return (
      <span className={cn("text-fg-muted tabular-nums", className)} aria-label="No rank change">
        —
      </span>
    );
  }
  const up = movement > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", up ? "text-positive" : "text-negative", className)} aria-label={`${up ? "Up" : "Down"} ${Math.abs(movement)}`}>
      <svg viewBox="0 0 8 8" aria-hidden className={cn("size-2 fill-current", !up && "rotate-180")}>
        <path d="M4 1 7.5 6.5h-7z" />
      </svg>
      {Math.abs(movement)}
    </span>
  );
}

export function LeaderboardTable({ rows, highlightTeamId, pinnedRow, compact = false }: { rows: LeaderboardRow[]; highlightTeamId?: string; pinnedRow?: LeaderboardRow | null; compact?: boolean }) {
  const ranks = sharedRanks(pinnedRow && !rows.some((r) => r.teamId === pinnedRow.teamId) ? [...rows, pinnedRow] : rows);
  const label = (r: LeaderboardRow) => ranks[r.teamId]?.label ?? `#${r.rank}`;
  const columns: Column<LeaderboardRow>[] = [
    { key: "rank", header: "Rank", sortValue: (r) => r.rank, cell: (r) => <span className="font-semibold text-fg-primary tabular-nums">{label(r)}</span> },
    { key: "move", header: "Move", cell: (r) => <RankMovement movement={r.movement} /> },
    {
      key: "team",
      header: "Team",
      sortValue: (r) => r.teamName,
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.teamName} size="sm" tone={r.teamId === highlightTeamId ? "accent" : "neutral"} />
          <span className={cn("font-medium", r.teamId === highlightTeamId ? "text-accent-text" : "text-fg-primary")}>
            {r.teamName}
            {r.teamId === highlightTeamId && <span className="ml-1.5 text-[11px] font-normal text-fg-muted">(you)</span>}
          </span>
        </span>
      ),
    },
    { key: "worth", header: "Net worth", align: "right", sortValue: (r) => r.netWorth, cell: (r) => <span className="font-medium text-fg-primary">{formatINR(r.netWorth)}</span> },
    { key: "return", header: "Return", align: "right", sortValue: (r) => r.returnPct, cell: (r) => <Delta value={r.returnPct} variant="pill" /> },
    ...(compact ? [] : [{ key: "round", header: "Round P&L", align: "right" as const, sortValue: (r: LeaderboardRow) => r.roundPnl, cell: (r: LeaderboardRow) => <Delta value={r.roundPnl} format="inr" /> }]),
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.teamId}
      minWidth={compact ? 520 : 720}
      rowClassName={(r) => (r.teamId === highlightTeamId ? "bg-accent/6" : undefined)}
      empty="No teams ranked yet."
      footer={
        pinnedRow ? (
          <tfoot>
            <tr className="border-t-2 border-dashed border-border-strong bg-accent/6">
              <td className="px-4 py-2 font-semibold tabular-nums">{label(pinnedRow)}</td>
              <td className="px-4"><RankMovement movement={pinnedRow.movement} /></td>
              <td className="px-4 font-medium text-accent-text">{pinnedRow.teamName} <span className="text-[11px] font-normal text-fg-muted">(you)</span></td>
              <td className="px-4 text-right font-medium tabular-nums">{formatINR(pinnedRow.netWorth)}</td>
              <td className="px-4 text-right"><Delta value={pinnedRow.returnPct} variant="pill" /></td>
              {!compact && <td className="px-4 text-right"><Delta value={pinnedRow.roundPnl} format="inr" /></td>}
            </tr>
          </tfoot>
        ) : undefined
      }
    />
  );
}
