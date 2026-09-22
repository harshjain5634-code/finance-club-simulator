"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { HoldingRows, HoldingsEmpty } from "@/components/market/holding-rows";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { formatClock, formatQuantity } from "@/lib/format";
import { instrumentOf, ledgerForTeam, proposalsForTeam, teamNameOf, teamSummary, tradesForTeam } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { useTerminal } from "./terminal-context";

type Filter = "ALL" | "UP" | "DOWN" | "FLAT";
type Group = "STOCK" | "SECTOR";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: React.ReactNode; tone?: "positive" | "negative" }) {
  return (
    <Card className="min-w-0 px-5 py-4">
      <p className="text-[13px] font-medium text-fg-muted">{label}</p>
      <p className={cn("mt-1.5 truncate text-value-m font-semibold tracking-[-0.01em] tabular-nums", tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-fg-primary")}>{value}</p>
      <div className="mt-1 truncate text-caption text-fg-secondary">{sub}</div>
    </Card>
  );
}

/**
 * C4 Portfolio (section 09): money summary, the full holdings table with totals, allocation as one-hue ranked bars
 * (length carries the value, so no colour legend; cash kept separate because it doesn't move with prices), and
 * the recent activity that changed holdings or cash.
 */
export function PortfolioScreen() {
  const { state, code, teamId } = useTerminal();
  const summary = useMemo(() => teamSummary(state, teamId)!, [state, teamId]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [group, setGroup] = useState<Group>("STOCK");

  const invested = summary.holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const profit = summary.netWorth - summary.capitalBase;
  const up = summary.holdings.filter((h) => h.unrealizedPnl > 0);
  const down = summary.holdings.filter((h) => h.unrealizedPnl < 0);
  const flat = summary.holdings.filter((h) => h.unrealizedPnl === 0);
  const shown = filter === "UP" ? up : filter === "DOWN" ? down : filter === "FLAT" ? flat : summary.holdings;
  const share = (v: number) => (summary.netWorth ? (v / summary.netWorth) * 100 : 0);

  const allocation = useMemo(() => {
    if (group === "STOCK") {
      return summary.holdings
        .map((h) => ({ key: h.instrumentId, label: instrumentOf(state, h.instrumentId)?.symbol ?? h.instrumentId, value: h.value }))
        .sort((a, b) => b.value - a.value);
    }
    const bySector = new Map<string, number>();
    for (const h of summary.holdings) {
      const sector = instrumentOf(state, h.instrumentId)?.sector ?? "Other";
      bySector.set(sector, (bySector.get(sector) ?? 0) + h.value);
    }
    return [...bySector.entries()].map(([label, value]) => ({ key: label, label, value })).sort((a, b) => b.value - a.value);
  }, [group, summary.holdings, state]);
  const scaleMax = Math.max(50, ...allocation.map((a) => share(a.value)), share(summary.cash));

  const activity = useMemo(() => {
    const name = teamNameOf(state);
    const items: { key: string; at: number; tag: string; title: string; sub: string; status: string; tone: "neutral" | "warning" }[] = [];
    for (const p of proposalsForTeam(state, teamId).pendingApproval) {
      const inst = instrumentOf(state, p.instrumentId);
      const buy = p.side === "BUY" ? p.proposerTeamId === teamId : p.counterpartyTeamId === teamId;
      const other = name(p.proposerTeamId === teamId ? p.counterpartyTeamId : p.proposerTeamId);
      items.push({ key: p.id, at: p.createdAt, tag: buy ? "Buy" : "Sell", title: `${formatQuantity(p.quantity)} ${inst?.symbol} ${buy ? "from" : "to"} ${other} at ₹${formatPrice(p.price)}`, sub: `${formatClock(p.createdAt, true)} · ${p.id} · ${formatINR(p.price * p.quantity, 0)} · waiting for a host check`, status: "Waiting for host", tone: "warning" });
    }
    for (const t of tradesForTeam(state, teamId).slice(0, 4)) {
      const inst = instrumentOf(state, t.instrumentId);
      const buy = t.buyerTeamId === teamId;
      items.push({ key: t.id, at: t.settledAt, tag: buy ? "Buy" : "Sell", title: `${formatQuantity(t.quantity)} ${inst?.symbol} ${buy ? "from" : "to"} ${name(buy ? t.sellerTeamId : t.buyerTeamId)} at ₹${formatPrice(t.price)}`, sub: `${formatClock(t.settledAt, true)} · ${t.id} · ${formatINR(t.value, 0)}`, status: "Settled", tone: "neutral" });
    }
    const opening = ledgerForTeam(state, teamId).find((row) => row.journal.type === "ALLOCATION");
    if (opening) items.push({ key: opening.journal.id, at: opening.journal.at, tag: "Start", title: `Opening portfolio · ${opening.shareChanges.length} stocks`, sub: `${formatClock(opening.journal.at, true)} · assigned by the host`, status: "Settled", tone: "neutral" });
    return items.sort((a, b) => b.at - a.at).slice(0, 5);
  }, [state, teamId]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Portfolio" description="Valued at current prices." className="md:hidden" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi
          label="Net worth"
          value={formatINR(summary.netWorth, 0)}
          sub={
            <>
              <Delta value={profit} format="inr" decimals={0} showArrow /> <span className={profit > 0 ? "text-positive" : profit < 0 ? "text-negative" : undefined}>· {formatPct(summary.returnPct, { signed: false })}</span> since the start
            </>
          }
        />
        <Kpi label="Cash" value={formatINR(summary.cash, 0)} sub={`${share(summary.cash).toFixed(1)}% of net worth · ready to trade`} />
        <Kpi label="Unrealized P&L" value={`${summary.unrealizedPnl > 0 ? "+" : ""}${formatINR(summary.unrealizedPnl, 0)}`} tone={summary.unrealizedPnl > 0 ? "positive" : summary.unrealizedPnl < 0 ? "negative" : undefined} sub={`On ${formatINR(invested, 0)} invested in ${summary.holdings.length} stocks`} />
        <Kpi label="Realized P&L" value={`${summary.realizedPnl > 0 ? "+" : ""}${formatINR(summary.realizedPnl, 0)}`} tone={summary.realizedPnl > 0 ? "positive" : summary.realizedPnl < 0 ? "negative" : undefined} sub="From shares you have sold" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-(--panel-p) py-4">
          <div className="mr-auto">
            <h2 className="text-h2 font-semibold text-fg-primary">Holdings</h2>
            <p className="text-caption text-fg-muted">
              {summary.holdings.length} {summary.holdings.length === 1 ? "stock" : "stocks"} · {formatINR(summary.holdingsValue, 0)} market value
            </p>
          </div>
          <SegmentedControl
            size="md"
            label="Filter holdings"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: `All ${summary.holdings.length}` },
              { value: "UP", label: `Gaining ${up.length}` },
              { value: "DOWN", label: `Losing ${down.length}` },
              { value: "FLAT", label: `Flat ${flat.length}` },
            ]}
          />
        </div>
        <div className="max-md:px-3 max-md:pb-3">{summary.holdings.length === 0 ? <HoldingsEmpty code={code} /> : <HoldingRows state={state} holdings={shown} code={code} variant="full" />}</div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="text-h3 font-semibold text-fg-primary">Where your money is</h2>
              <p className="text-caption text-fg-muted">Share of net worth · {formatINR(summary.netWorth, 0)}</p>
            </div>
            <SegmentedControl
              size="md"
              label="Group allocation"
              value={group}
              onChange={setGroup}
              options={[
                { value: "STOCK", label: "By stock" },
                { value: "SECTOR", label: "By sector" },
              ]}
            />
          </div>
          <ul className="mt-4 flex flex-col gap-2.5" aria-label="Allocation">
            <AllocationBar label="Cash" pct={share(summary.cash)} value={summary.cash} scaleMax={scaleMax} muted />
            <li aria-hidden className="h-px bg-border-subtle" />
            {allocation.map((a) => (
              <AllocationBar key={a.key} label={a.label} pct={share(a.value)} value={a.value} scaleMax={scaleMax} />
            ))}
          </ul>
          <p className="mt-4 text-caption text-fg-muted">One colour, ranked by size: the bar length is the value. Cash is separate because it doesn&apos;t move with prices.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-h3 font-semibold text-fg-primary">Recent activity</h2>
              <p className="text-caption text-fg-muted">Trades that changed your holdings or cash</p>
            </div>
            <Link href={`/event/${code}/transactions`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
              All transactions <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="mt-4 rounded-md bg-canvas-subtle px-4 py-6 text-center text-meta text-fg-secondary">No trades yet. Trades you make or accept appear here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border-subtle">
              {activity.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3">
                  <span className="grid h-6 w-12 shrink-0 place-items-center rounded-xs bg-canvas-subtle text-caption font-medium text-fg-secondary">{item.tag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-fg-primary">{item.title}</span>
                    <span className="block truncate font-mono text-caption text-fg-muted">{item.sub}</span>
                  </span>
                  <Badge tone={item.tone} dot={item.tone === "warning"}>
                    {item.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function AllocationBar({ label, pct, value, scaleMax, muted = false }: { label: string; pct: number; value: number; scaleMax: number; muted?: boolean }) {
  return (
    <li className="grid grid-cols-[88px_minmax(0,1fr)_56px_96px] items-center gap-3">
      <span className="truncate text-[13px] font-medium text-fg-primary">{label}</span>
      <span className="h-2 overflow-hidden rounded-xs bg-canvas-subtle">
        <span className={cn("block h-full rounded-xs", muted ? "bg-fg-muted" : "bg-fg-secondary")} style={{ width: `${Math.max(1, (pct / scaleMax) * 100)}%` }} />
      </span>
      <span className="text-right font-mono text-[13px] text-fg-primary">{pct.toFixed(1)}%</span>
      <span className="text-right font-mono text-[13px] text-fg-secondary">{formatINR(value, 0)}</span>
    </li>
  );
}
