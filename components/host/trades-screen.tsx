"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { EmptyState, KeyValueList, PageHeader } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JournalTypeBadge, ProposalStatusBadge } from "@/components/market/status";
import { ProposalsTable, TradesTable } from "@/components/market/tables";
import { formatINR, formatPrice } from "@/lib/domain/money";
import type { EventState, ProposalStatus, Trade, TradeProposal } from "@/lib/domain/types";
import { formatClock, formatDateTime, formatQuantity } from "@/lib/format";
import { approveProposal, rejectProposalByHost } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { describeActor, symbolOf, teamNameOf } from "@/lib/mock/selectors";
import { ActivityFeed } from "./activity-feed";
import { hostAction, useHostEvent } from "./host-context";

type Selection = { kind: "trade"; id: string } | { kind: "proposal"; id: string } | null;

const STATUSES: ProposalStatus[] = ["PROPOSED", "ACCEPTED", "PENDING_APPROVAL", "SETTLED", "REJECTED", "REJECTED_BY_HOST", "CANCELLED", "EXPIRED", "FAILED"];

export function TradesMonitorScreen() {
  const { state, eventId } = useHostEvent();
  const now = useNow();
  const [round, setRound] = useState("ALL");
  const [team, setTeam] = useState("ALL");
  const [instrument, setInstrument] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [selection, setSelection] = useState<Selection>(null);
  const [decision, setDecision] = useState<{ proposal: TradeProposal; approve: boolean } | null>(null);

  const matches = (roundId: string | null, teamIds: string[], instrumentId: string) =>
    (round === "ALL" || roundId === round) && (team === "ALL" || teamIds.includes(team)) && (instrument === "ALL" || instrumentId === instrument);

  const trades = state.trades.filter((t) => matches(t.roundId, [t.buyerTeamId, t.sellerTeamId], t.instrumentId));
  const proposals = state.proposals.filter((p) => matches(p.roundId, [p.proposerTeamId, p.counterpartyTeamId], p.instrumentId) && (status === "ALL" || p.status === status));
  const pending = state.proposals.filter((p) => p.status === "PENDING_APPROVAL");
  const name = teamNameOf(state);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Trade monitor" description="Every P2P proposal and settled trade. Click a row for its proposal, ledger postings and audit trail." />
      <Card>
        <Tabs defaultValue={pending.length ? "approvals" : "trades"}>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pr-4">
            <TabsList className="border-b-0">
              <TabsTrigger value="trades" count={trades.length}>Settled trades</TabsTrigger>
              <TabsTrigger value="proposals" count={proposals.length}>Proposals</TabsTrigger>
              <TabsTrigger value="approvals" count={pending.length}>Approval queue</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <Select size="sm" className="w-40" aria-label="Round" value={round} onValueChange={setRound} options={[{ value: "ALL", label: "All rounds" }, ...state.rounds.map((r) => ({ value: r.id, label: `R${r.number} · ${r.name}` }))]} />
            <Select size="sm" className="w-44" aria-label="Team" value={team} onValueChange={setTeam} options={[{ value: "ALL", label: "All teams" }, ...state.teams.map((t) => ({ value: t.id, label: t.name }))]} />
            <Select size="sm" className="w-36" aria-label="Instrument" value={instrument} onValueChange={setInstrument} options={[{ value: "ALL", label: "All stocks" }, ...state.instruments.map((i) => ({ value: i.id, label: i.symbol }))]} />
            <Select size="sm" className="w-44" aria-label="Proposal status" value={status} onValueChange={setStatus} options={[{ value: "ALL", label: "Any proposal status" }, ...STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }))]} />
          </div>
          <TabsContent value="trades">
            <TradesTable state={state} trades={trades} onRowClick={(t) => setSelection({ kind: "trade", id: t.id })} now={now} />
          </TabsContent>
          <TabsContent value="proposals">
            <ProposalsTable state={state} proposals={proposals} onRowClick={(p) => setSelection({ kind: "proposal", id: p.id })} now={now} />
          </TabsContent>
          <TabsContent value="approvals">
            {pending.length === 0 ? (
              <EmptyState title="No trades awaiting approval" description={state.event.rules.approvalEnabled ? `Trades worth ${formatINR(state.event.rules.approvalThreshold ?? 0, 0)} or more appear here after the counterparty accepts.` : "Host approval is disabled. Enable it in Setup → General."} />
            ) : (
              <DataTable
                rows={pending}
                rowKey={(p) => p.id}
                minWidth={980}
                columns={[
                  { key: "id", header: "Proposal", cell: (p) => <button type="button" className="font-mono text-xs text-accent hover:underline" onClick={() => setSelection({ kind: "proposal", id: p.id })}>{p.id}</button> },
                  { key: "seller", header: "Seller", cell: (p) => name(p.side === "SELL" ? p.proposerTeamId : p.counterpartyTeamId) },
                  { key: "buyer", header: "Buyer", cell: (p) => name(p.side === "BUY" ? p.proposerTeamId : p.counterpartyTeamId) },
                  { key: "stock", header: "Stock", cell: (p) => <span className="font-medium">{symbolOf(state)(p.instrumentId)}</span> },
                  { key: "qty", header: "Qty", align: "right", cell: (p) => formatQuantity(p.quantity) },
                  { key: "price", header: "Price", align: "right", cell: (p) => formatPrice(p.price) },
                  { key: "value", header: "Value", align: "right", cell: (p) => <span className="font-semibold">{formatINR(p.price * p.quantity)}</span> },
                  {
                    key: "actions",
                    header: "",
                    align: "right",
                    cell: (p) => (
                      <span className="inline-flex gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => setDecision({ proposal: p, approve: false })}><X className="size-3.5" />Reject</Button>
                        <Button variant="primary" size="sm" onClick={() => setDecision({ proposal: p, approve: true })}><Check className="size-3.5" />Approve</Button>
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={selection !== null} onOpenChange={(open) => !open && setSelection(null)}>
        {selection && <SelectionDrawer state={state} selection={selection} now={now} />}
      </Dialog>

      <ConfirmActionDialog
        open={decision !== null}
        onOpenChange={(open) => !open && setDecision(null)}
        tier={decision?.approve ? "confirm" : "reason"}
        tone={decision?.approve ? "accent" : "warning"}
        title={decision?.approve ? `Approve ${decision.proposal.id}?` : `Reject ${decision?.proposal.id}?`}
        description={decision?.approve ? "Settlement re-checks balances, band and trading state; if anything changed the proposal fails with a reason." : "Both teams see the rejection reason."}
        confirmLabel={decision?.approve ? "Approve & settle" : "Reject trade"}
        onConfirm={({ reason, idempotencyKey }) =>
          decision!.approve
            ? hostAction(approveProposal(eventId, decision!.proposal.id, idempotencyKey), (t) => `Trade ${t.id} settled`)
            : hostAction(rejectProposalByHost(eventId, decision!.proposal.id, reason, idempotencyKey), `Proposal ${decision!.proposal.id} rejected`)
        }
      />
    </div>
  );
}

function SelectionDrawer({ state, selection, now }: { state: EventState; selection: Exclude<Selection, null>; now: number }) {
  const trade: Trade | undefined = selection.kind === "trade" ? state.trades.find((t) => t.id === selection.id) : state.trades.find((t) => t.proposalId === selection.id);
  const proposal = state.proposals.find((p) => p.id === (selection.kind === "proposal" ? selection.id : trade?.proposalId));
  const journal = trade ? state.journals.find((j) => j.id === trade.journalId) : undefined;
  const audit = state.audit.filter((a) => a.refs.proposalId === proposal?.id || (trade && a.refs.tradeId === trade.id));
  const name = teamNameOf(state);
  const symbol = symbolOf(state);

  return (
    <DrawerContent title={trade ? `Trade ${trade.id}` : `Proposal ${proposal?.id}`} description={proposal ? `${symbol(proposal.instrumentId)} · ${formatQuantity(proposal.quantity)} @ ₹${formatPrice(proposal.price)}` : undefined} width="lg">
      <div className="flex flex-col gap-5">
        {proposal && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg-primary">Proposal <ProposalStatusBadge status={proposal.status} /></h3>
            <KeyValueList
              columns={2}
              items={[
                { label: "Proposer", value: `${name(proposal.proposerTeamId)} (${proposal.side === "BUY" ? "buying" : "selling"})` },
                { label: "Counterparty", value: name(proposal.counterpartyTeamId) },
                { label: "Quantity × price", value: `${formatQuantity(proposal.quantity)} × ₹${formatPrice(proposal.price)}` },
                { label: "Value", value: formatINR(proposal.price * proposal.quantity) },
                { label: "Reference at proposal", value: `₹${formatPrice(proposal.referencePriceAtProposal)}` },
                { label: "Created", value: formatDateTime(proposal.createdAt) },
                { label: "Idempotency key", value: <span className="font-mono text-[11px]">{proposal.idempotencyKey.slice(0, 18)}…</span> },
                { label: "Reason", value: proposal.failureReason ?? proposal.rejectionReason ?? "—" },
              ]}
            />
            <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              {proposal.history.map((h, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-fg-muted">→</span>}
                  <ProposalStatusBadge status={h.status} />
                  <span className="text-fg-muted tabular-nums">{formatClock(h.at, true)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {trade && (
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-fg-primary">Settled trade</h3>
            <KeyValueList
              columns={2}
              items={[
                { label: "Buyer", value: name(trade.buyerTeamId) },
                { label: "Seller", value: name(trade.sellerTeamId) },
                { label: "Settled", value: formatDateTime(trade.settledAt) },
                { label: "Value", value: formatINR(trade.value) },
              ]}
            />
          </section>
        )}
        {journal && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg-primary">Ledger journal {journal.id} <JournalTypeBadge type={journal.type} /></h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[460px] text-xs">
                <thead>
                  <tr className="bg-surface-raised text-[10px] tracking-wide text-fg-muted uppercase">
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-left font-medium">Asset</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.postings.map((p, i) => {
                    const cash = p.asset === "CASH";
                    const account = p.account.startsWith("TEAM:") ? name(p.account.slice(5)) : p.account;
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5">{account}</td>
                        <td className="px-3 py-1.5 font-mono">{cash ? "CASH" : symbol(p.asset.slice(11))}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{cash ? formatINR(p.amount) : `${p.amount > 0 ? "+" : ""}${p.amount}`}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{cash ? formatINR(p.balanceAfter) : p.balanceAfter}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-fg-muted">Postings net to zero for cash and for the stock.</p>
          </section>
        )}
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-fg-primary">Audit trail</h3>
          <div className="rounded-md border border-border">
            <ActivityFeed state={state} events={audit} now={now} limit={50} />
          </div>
          {audit.length > 0 && <p className="mt-1.5 text-[11px] text-fg-muted">Actors: {[...new Set(audit.map((a) => describeActor(state, a.actor)))].join(", ")}</p>}
        </section>
      </div>
    </DrawerContent>
  );
}
