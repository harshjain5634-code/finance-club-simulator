"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DrawerContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { PageHeader, SearchInput } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProposalStatusBadge } from "@/components/market/status";
import { LedgerTable } from "@/components/market/tables";
import { formatINR, formatPrice } from "@/lib/domain/money";
import type { ProposalStatus, TradeProposal } from "@/lib/domain/types";
import { formatClock, formatQuantity } from "@/lib/format";
import { useNow } from "@/lib/mock/hooks";
import { instrumentOf, ledgerForTeam, proposalsForTeam, proposalView, teamNameOf, tradesForTeam } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTerminal } from "./terminal-context";

type StatusFilter = "ALL" | "SETTLED" | "WAITING" | "REJECTED" | "EXPIRED";
const GROUP: Record<ProposalStatus, StatusFilter> = {
  PROPOSED: "WAITING",
  ACCEPTED: "WAITING",
  PENDING_APPROVAL: "WAITING",
  SETTLED: "SETTLED",
  REJECTED: "REJECTED",
  REJECTED_BY_HOST: "REJECTED",
  CANCELLED: "REJECTED",
  FAILED: "REJECTED",
  EXPIRED: "EXPIRED",
};

/**
 * C4 Transactions (section 11): every proposal and trade involving the team with the IDs the host sees, searchable
 * and filterable. Opening a row shows the full timeline (the same record as the audit log). The ledger stays
 * available as the second view.
 */
export function TransactionsScreen() {
  const { state, teamId } = useTerminal();
  const now = useNow();
  const [view, setView] = useState<"ACTIVITY" | "LEDGER">("ACTIVITY");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [side, setSide] = useState("ALL");
  const [stock, setStock] = useState("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const proposals = proposalsForTeam(state, teamId).all;
  const trades = tradesForTeam(state, teamId);
  const ledger = useMemo(() => ledgerForTeam(state, teamId), [state, teamId]);
  const name = teamNameOf(state);

  const rows = proposals.filter((p) => {
    const v = proposalView(state, p, teamId);
    if (status !== "ALL" && GROUP[p.status] !== status) return false;
    if (side !== "ALL" && (side === "BUY") !== v.youBuy) return false;
    if (stock !== "ALL" && p.instrumentId !== stock) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${p.id} ${p.tradeId ?? ""} ${v.symbol} ${v.otherTeam}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const counts = proposals.reduce<Record<StatusFilter, number>>((acc, p) => ({ ...acc, [GROUP[p.status]]: acc[GROUP[p.status]] + 1 }), { ALL: proposals.length, SETTLED: 0, WAITING: 0, REJECTED: 0, EXPIRED: 0 });
  const tradedValue = trades.reduce((sum, t) => sum + t.value, 0);
  const realized = state.realizedPnl[teamId] ?? 0;
  const waitingHost = proposals.filter((p) => p.status === "PENDING_APPROVAL");
  const open = proposals.find((p) => p.id === openId) ?? null;
  const stocks = [...new Set(proposals.map((p) => p.instrumentId))];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Transactions" description="Every proposal, trade and balance change for your team." className="md:hidden" />
      <Card className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
        {[
          ["Settled trades", String(trades.length), `${formatINR(tradedValue, 0)} traded`, undefined],
          ["Realized P&L", `${realized > 0 ? "+" : ""}${formatINR(realized, 0)}`, "From shares you sold", realized > 0 ? "text-positive" : realized < 0 ? "text-negative" : undefined],
          ["Waiting for host", String(waitingHost.length), waitingHost[0] ? `${proposalView(state, waitingHost[0], teamId).symbol} · ${formatINR(waitingHost[0].price * waitingHost[0].quantity, 0)}` : "Nothing waiting", undefined],
          ["Not completed", String(counts.REJECTED + counts.EXPIRED), `${counts.REJECTED} rejected or withdrawn · ${counts.EXPIRED} expired`, undefined],
        ].map(([label, value, sub, tone]) => (
          <div key={label} className="min-w-0 px-5 py-4">
            <p className="text-caption text-fg-muted">{label}</p>
            <p className={cn("mt-1 text-value-s font-semibold text-fg-primary tabular-nums", tone)}>{value}</p>
            <p className="mt-1 truncate text-caption text-fg-muted">{sub}</p>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          size="md"
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "ACTIVITY", label: "Trades & proposals" },
            { value: "LEDGER", label: `Ledger ${ledger.length}` },
          ]}
        />
        {view === "ACTIVITY" && (
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Search ID, stock or team" label="Search transactions" className="w-full sm:w-64" />
            <SegmentedControl
              size="md"
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "ALL", label: `All ${counts.ALL}` },
                { value: "SETTLED", label: `Settled ${counts.SETTLED}` },
                { value: "WAITING", label: `Waiting ${counts.WAITING}` },
                { value: "REJECTED", label: `Rejected ${counts.REJECTED}` },
                { value: "EXPIRED", label: `Expired ${counts.EXPIRED}` },
              ]}
            />
            <Select value={side} onValueChange={setSide} aria-label="Buy or sell" className="w-36" options={[{ value: "ALL", label: "Buy & sell" }, { value: "BUY", label: "Buys" }, { value: "SELL", label: "Sells" }]} />
            <Select value={stock} onValueChange={setStock} aria-label="Stock" className="w-36" options={[{ value: "ALL", label: "All stocks" }, ...stocks.map((id) => ({ value: id, label: instrumentOf(state, id)?.symbol ?? id }))]} />
          </>
        )}
      </div>

      {view === "LEDGER" ? (
        <Card className="overflow-hidden">
          <p className="border-b border-border px-(--panel-p) py-3 text-caption text-fg-muted">Every change to your cash or shares is recorded here and never edited: opening allocation, trades and host adjustments.</p>
          <LedgerTable state={state} rows={ledger} now={now} />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <ul className="divide-y divide-border-subtle md:hidden" aria-label="Trades and proposals">
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-meta text-fg-secondary">{proposals.length === 0 ? "No trades yet. Trades you make or accept appear here with an ID you can quote to the host." : "Nothing matches these filters."}</li>
            ) : (
              rows.map((p) => {
                const v = proposalView(state, p, teamId);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-fg-primary">
                          {v.youBuy ? "Buy" : "Sell"} {formatQuantity(p.quantity)} <span className="font-mono">{v.symbol}</span> {v.youBuy ? "from" : "to"} {v.otherTeam}
                        </span>
                        <span className="block truncate font-mono text-caption text-fg-muted">
                          {formatClock(p.createdAt, true)} · {p.tradeId ?? p.id} · ₹{formatPrice(p.price)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-[14px] text-fg-primary">{formatINR(v.value, 0)}</span>
                        <ProposalStatusBadge status={p.status} />
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <table className="w-full min-w-[860px] border-collapse max-md:hidden">
            <caption className="sr-only">Trades and proposals</caption>
            <thead>
              <tr className="h-9 bg-canvas-subtle text-caption text-fg-muted">
                {["Time", "ID", "Side", "Stock", "Counterparty", "Qty", "Price", "Value", "Status"].map((h, i) => (
                  <th key={h} scope="col" className={cn("px-3 font-medium first:pl-(--panel-p) last:pr-(--panel-p)", i >= 5 && i <= 7 ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-meta text-fg-secondary">
                    {proposals.length === 0 ? "No trades yet. Trades you make or accept appear here with an ID you can quote to the host." : "Nothing matches these filters."}
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const v = proposalView(state, p, teamId);
                  const note = p.status === "PENDING_APPROVAL" ? "accepted, waiting for host" : p.status === "REJECTED" && p.rejectionReason?.startsWith("Countered") ? "countered" : p.counterOfProposalId ? "counter-offer" : p.status === "EXPIRED" ? "no answer in time" : null;
                  return (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      onClick={() => setOpenId(p.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpenId(p.id))}
                      className="group h-(--row-h) cursor-pointer border-t border-border-subtle hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                      aria-label={`Open ${p.tradeId ?? p.id}`}
                    >
                      <td className="pl-(--panel-p) font-mono text-[13px] text-fg-muted">{formatClock(p.createdAt, true)}</td>
                      <td className="px-3 font-mono text-[13px] text-fg-muted">{p.tradeId ?? p.id}</td>
                      <td className="px-3">
                        <span className="inline-grid h-[22px] w-11 place-items-center rounded-xs bg-canvas-subtle text-caption font-medium text-fg-secondary">{v.youBuy ? "Buy" : "Sell"}</span>
                      </td>
                      <td className="px-3 font-mono text-[14px] font-medium text-fg-primary">{v.symbol}</td>
                      <td className="px-3 text-[14px] text-fg-primary">
                        {v.otherTeam}
                        {note && <span className="text-fg-muted"> · {note}</span>}
                      </td>
                      <td className="px-3 text-right font-mono text-[14px] text-fg-primary">{formatQuantity(p.quantity)}</td>
                      <td className="px-3 text-right font-mono text-[14px] text-fg-primary">{formatPrice(p.price)}</td>
                      <td className="px-3 text-right font-mono text-[14px] text-fg-primary">{formatINR(v.value, 0)}</td>
                      <td className="pr-(--panel-p) pl-3">
                        <ProposalStatusBadge status={p.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <p className="border-t border-border px-(--panel-p) py-3 text-caption text-fg-muted">
            Showing {rows.length} of {proposals.length} · times are local · IDs match what the host sees, so you can quote them when asking for help
          </p>
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        {open && <TransactionDrawer proposal={open} teamId={teamId} otherName={name} />}
      </Dialog>
    </div>
  );
}

function TransactionDrawer({ proposal, teamId, otherName }: { proposal: TradeProposal; teamId: string; otherName: (id: string) => string }) {
  const { state } = useTerminal();
  const v = proposalView(state, proposal, teamId);
  const trade = proposal.tradeId ? state.trades.find((t) => t.id === proposal.tradeId) : undefined;
  const counterOf = proposal.counterOfProposalId;
  const counteredBy = state.proposals.find((p) => p.counterOfProposalId === proposal.id);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(proposal.tradeId ?? proposal.id);
      toast.success("ID copied");
    } catch {
      toast.error("Couldn't copy the ID");
    }
  };
  const statusCopy: Partial<Record<ProposalStatus, string>> = {
    PENDING_APPROVAL: "Waiting for host approval. Nothing moves until the host approves; if it's rejected, your cash and shares stay as they are.",
    PROPOSED: `Waiting for ${v.incoming ? "you" : v.otherTeam} to respond.`,
    SETTLED: "Settled. Cash and shares moved for both teams at the same moment.",
    EXPIRED: "Expired without an answer. Nothing moved.",
    REJECTED: proposal.rejectionReason?.startsWith("Countered") ? "Answered with a counter-offer. The original stays here for the record." : "Rejected. Nothing moved.",
    REJECTED_BY_HOST: "Rejected by the host. Nothing moved.",
    CANCELLED: "Withdrawn by the proposing team. Nothing moved.",
    FAILED: `Failed at settlement: ${proposal.failureReason ?? "a check failed"}. Nothing moved.`,
  };

  return (
    <DrawerContent
      title={`${v.youBuy ? "Buy" : "Sell"} ${formatQuantity(proposal.quantity)} ${v.symbol} ${v.youBuy ? "from" : "to"} ${v.otherTeam}`}
      description={<span className="font-mono">{trade ? `${trade.id} · from ${proposal.id}` : proposal.id}</span>}
      footer={
        <>
          <Button variant="ghost" onClick={copy}>
            Copy ID
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className={cn("rounded-md px-4 py-3", proposal.status === "PENDING_APPROVAL" ? "bg-warning-soft" : "bg-canvas-subtle")}>
          <ProposalStatusBadge status={proposal.status} />
          <p className="mt-2 text-meta text-fg-secondary">{statusCopy[proposal.status]}</p>
        </div>
        <dl className="flex flex-col gap-2.5">
          {(
            [
              [v.youBuy ? "You buy" : "You sell", `${formatQuantity(proposal.quantity)} ${v.symbol}`, true],
              ["Price", `₹${formatPrice(proposal.price)}`, true],
              ["Reference price then", `₹${formatPrice(proposal.referencePriceAtProposal)}`, true],
              ["Value", formatINR(v.value, 0), true],
              ["Proposed by", proposal.proposerTeamId === teamId ? "Your team" : otherName(proposal.proposerTeamId), false],
              ...(counterOf ? [["Counter-offer to", counterOf, true]] : []),
              ...(counteredBy ? [["Countered with", counteredBy.id, true]] : []),
            ] as [string, string, boolean][]
          ).map(([k, val, mono]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-[13px] text-fg-secondary">{k}</dt>
              <dd className={cn("text-right text-[13px] text-fg-primary", mono ? "font-mono" : "font-medium")}>{val}</dd>
            </div>
          ))}
        </dl>
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-h3 font-semibold text-fg-primary">Timeline</h3>
            <span className="text-caption text-fg-muted">Same record the host sees</span>
          </div>
          <ol className="mt-3 flex flex-col">
            {proposal.history.map((h, i) => (
              <li key={`${h.status}-${h.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                <span aria-hidden className="flex w-3 flex-col items-center">
                  <span className={cn("mt-1 size-2.5 rounded-full", i === proposal.history.length - 1 && GROUP[proposal.status] === "WAITING" ? "bg-warning" : "bg-fg-muted")} />
                  {i < proposal.history.length - 1 && <span className="w-px flex-1 bg-border" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-caption text-fg-muted">{formatClock(h.at, true)}</span>
                  <span className="block text-[14px] text-fg-primary">
                    {h.status.charAt(0) + h.status.slice(1).toLowerCase().replace(/_/g, " ")}
                    {h.note ? ` · ${h.note}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        {trade && (
          <p className="text-caption text-fg-muted">
            Settled trade {trade.id}: <Delta value={v.youBuy ? -trade.value : trade.value} format="inr" decimals={0} /> cash for you.
          </p>
        )}
      </div>
    </DrawerContent>
  );
}
