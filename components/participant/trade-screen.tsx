"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, Check, CircleAlert, Clock, Inbox, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProposalStatusBadge } from "@/components/market/status";
import { isWithinBand, priceBand, validateProposal } from "@/lib/domain/p2p";
import { formatINR, formatPrice, tradeValue } from "@/lib/domain/money";
import { teamCash, teamShares } from "@/lib/domain/portfolio";
import { checkMarketOpen, currentRound } from "@/lib/domain/trading-gate";
import type { EventState, TradeProposal, TradeSide } from "@/lib/domain/types";
import { formatDuration, formatQuantity } from "@/lib/format";
import { acceptProposal, cancelProposal, proposeTrade, rejectProposal } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { instrumentOf, isBuyerFor, proposalsForTeam, teamNameOf } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTerminal } from "./terminal-context";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function TradeScreen() {
  const { state, teamId, team } = useTerminal();
  const proposals = proposalsForTeam(state, teamId);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Trade"
        description="Peer-to-peer market: agree a deal with another team, propose it here, and it settles the moment they accept."
        meta={<Badge tone="outline">P2P · ±{state.event.rules.priceBandPct}% band · whole shares · no short selling</Badge>}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <ProposalForm state={state} teamId={teamId} teamName={team.name} />
        </div>
        <div className="flex flex-col gap-3 xl:col-span-7">
          <ProposalList
            title="Incoming proposals"
            icon={<Inbox className="size-3.5" />}
            proposals={proposals.incomingOpen}
            state={state}
            teamId={teamId}
            empty="No proposals are waiting for you."
            direction="incoming"
          />
          <ProposalList
            title="Outgoing proposals"
            icon={<Send className="size-3.5" />}
            proposals={proposals.outgoingOpen}
            state={state}
            teamId={teamId}
            empty="You have no open proposals."
            direction="outgoing"
          />
          <RecentOutcomes state={state} teamId={teamId} proposals={proposals.all.filter((p) => !["PROPOSED", "PENDING_APPROVAL"].includes(p.status)).slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}

function ProposalForm({ state, teamId, teamName }: { state: EventState; teamId: string; teamName: string }) {
  const searchParams = useSearchParams();
  const now = useNow();
  const enabled = state.instruments.filter((i) => i.enabled);
  const initialSymbol = searchParams.get("symbol")?.toUpperCase();
  const initialInstrument = enabled.find((i) => i.symbol === initialSymbol) ?? enabled[0];

  const [side, setSide] = useState<TradeSide>(searchParams.get("side") === "BUY" ? "BUY" : "SELL");
  const [instrumentId, setInstrumentId] = useState(initialInstrument?.id ?? "");
  const [quantityText, setQuantityText] = useState("20");
  const [price, setPrice] = useState<number | null>(initialInstrument ? state.prices[initialInstrument.id].price : null);
  const [counterpartyId, setCounterpartyId] = useState(state.teams.find((t) => t.id !== teamId && t.status === "ACTIVE")?.id ?? "");
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [pending, setPending] = useState(false);

  const instrument = instrumentOf(state, instrumentId);
  const reference = instrument ? state.prices[instrument.id].price : 0;
  const band = priceBand(reference, state.event.rules.priceBandPct, state.event.rules.tickSize);
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
  const value = price !== null && Number.isFinite(quantity) ? tradeValue(price, quantity) : 0;
  const cash = teamCash(state, teamId);
  const held = instrument ? teamShares(state, teamId, instrument.id) : 0;
  const openOutgoing = state.proposals.filter((p) => p.proposerTeamId === teamId && p.status === "PROPOSED").length;
  const market = checkMarketOpen(state.event, currentRound(state), now);

  const issues =
    instrument && price !== null
      ? validateProposal(state, { proposerTeamId: teamId, counterpartyTeamId: counterpartyId, side, instrumentId: instrument.id, quantity, price, idempotencyKey }, now)
      : [{ field: "price" as const, message: "Enter a price." }];

  const checks = [
    { label: "Trading open", ok: market.ok, detail: market.ok ? "Round running" : market.message },
    {
      label: "Price within band",
      ok: price !== null && reference > 0 && isWithinBand(price, reference, state.event.rules.priceBandPct, state.event.rules.tickSize) && price % state.event.rules.tickSize === 0,
      detail: `₹${formatPrice(band.min)} – ₹${formatPrice(band.max)}`,
    },
    side === "BUY"
      ? { label: "Cash available", ok: value > 0 && cash >= value, detail: `${formatINR(cash)} available` }
      : { label: "Shares available", ok: Number.isFinite(quantity) && quantity > 0 && held >= quantity, detail: `${formatQuantity(held)} ${instrument?.symbol ?? ""} held` },
    { label: "Open proposal limit", ok: openOutgoing < state.event.rules.maxOpenOutgoingProposals, detail: `${openOutgoing} of ${state.event.rules.maxOpenOutgoingProposals} used` },
  ];

  const submit = async () => {
    if (!instrument || price === null || issues.length > 0) return;
    setPending(true);
    const result = await proposeTrade(state.event.id, teamId, { counterpartyTeamId: counterpartyId, side, instrumentId: instrument.id, quantity, price, idempotencyKey });
    setPending(false);
    if (result.ok) {
      toast.success(`Proposal ${result.value.id} sent`, `${side === "BUY" ? "Buy" : "Sell"} ${quantity} ${instrument.symbol} @ ₹${formatPrice(price)} with ${teamNameOf(state)(counterpartyId)}.`);
      setIdempotencyKey(newKey());
    } else {
      toast.error("Proposal not sent", result.message);
    }
  };

  return (
    <Card>
      <CardHeader title="Propose a transaction" subtitle={`As ${teamName}`} icon={<ArrowLeftRight className="size-3.5" />} divider />
      <form
        className="flex flex-col gap-4 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Side">
          <SegmentedControl
            options={[
              { value: "BUY", label: "Buy from team" },
              { value: "SELL", label: "Sell to team" },
            ]}
            value={side}
            onChange={setSide}
            label="Trade side"
            size="md"
            className="w-full [&>button]:flex-1"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Stock" htmlFor="trade-instrument">
            <Select
              id="trade-instrument"
              value={instrumentId}
              onValueChange={(id) => {
                setInstrumentId(id);
                setPrice(state.prices[id].price);
              }}
              options={enabled.map((i) => ({ value: i.id, label: `${i.symbol} · ${i.name}`, disabled: i.halted, hint: i.halted ? "Halted" : `₹${formatPrice(state.prices[i.id].price)}` }))}
            />
          </Field>
          <Field label="Counterparty team" htmlFor="trade-counterparty">
            <Select
              id="trade-counterparty"
              value={counterpartyId}
              onValueChange={setCounterpartyId}
              options={state.teams.filter((t) => t.id !== teamId).map((t) => ({ value: t.id, label: t.name, disabled: t.status !== "ACTIVE", hint: t.status !== "ACTIVE" ? "Disabled" : undefined }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Quantity (shares)" htmlFor="trade-qty" error={quantityText && !(quantity > 0) ? "Whole shares only" : undefined}>
            <Input id="trade-qty" inputMode="numeric" value={quantityText} onChange={(e) => setQuantityText(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <Field
            label="Price per share"
            htmlFor="trade-price"
            aside={
              <button type="button" onClick={() => setPrice(reference)} className="rounded text-[11px] text-accent hover:underline">
                Use reference
              </button>
            }
          >
            <MoneyInput id="trade-price" value={price} onValueChange={setPrice} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
          <div className="bg-surface-raised px-3 py-2">
            <p className="text-fg-muted">Reference</p>
            <p className="mt-0.5 font-medium text-fg-primary tabular-nums">₹{formatPrice(reference)}</p>
          </div>
          <div className="bg-surface-raised px-3 py-2">
            <p className="text-fg-muted">Allowed (±{state.event.rules.priceBandPct}%)</p>
            <p className="mt-0.5 font-medium text-fg-primary tabular-nums">
              ₹{formatPrice(band.min)} – ₹{formatPrice(band.max)}
            </p>
          </div>
          <div className="bg-surface-raised px-3 py-2">
            <p className="text-fg-muted">Total value</p>
            <p className="mt-0.5 font-semibold text-fg-primary tabular-nums">{formatINR(value)}</p>
          </div>
        </div>

        <ul className="flex flex-col gap-1.5" aria-label="Live validation">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-2 text-xs">
              <span className={cn("grid size-4 shrink-0 place-items-center rounded-full", check.ok ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning")}>
                {check.ok ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
              </span>
              <span className="text-fg-primary">{check.label}</span>
              <span className="ml-auto text-fg-muted tabular-nums">{check.detail}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-surface-hover">
              <Clock className="size-2.5" />
            </span>
            Counterparty cash/shares are verified when they accept · expires after {Math.round(state.event.rules.proposalExpirySeconds / 60)} min
          </li>
        </ul>

        {issues.length > 0 && price !== null && (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-fg-primary" role="status">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            {issues[0].message}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={pending || issues.length > 0} className="w-full">
          {pending ? "Sending…" : `Propose ${side === "BUY" ? "buy" : "sell"} · ${Number.isFinite(quantity) ? formatQuantity(quantity) : 0} ${instrument?.symbol ?? ""}`}
        </Button>
      </form>
    </Card>
  );
}

function ProposalList({
  title,
  icon,
  proposals,
  state,
  teamId,
  empty,
  direction,
}: {
  title: string;
  icon: React.ReactNode;
  proposals: TradeProposal[];
  state: EventState;
  teamId: string;
  empty: string;
  direction: "incoming" | "outgoing";
}) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} subtitle={`${proposals.length} open`} divider />
      {proposals.length === 0 ? (
        <EmptyState title={empty} className="py-7" />
      ) : (
        <ul className="divide-y divide-border">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} state={state} teamId={teamId} direction={direction} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProposalCard({ proposal, state, teamId, direction }: { proposal: TradeProposal; state: EventState; teamId: string; direction: "incoming" | "outgoing" }) {
  const now = useNow();
  const [pending, setPending] = useState<"accept" | "reject" | "cancel" | null>(null);
  const instrument = instrumentOf(state, proposal.instrumentId)!;
  const name = teamNameOf(state);
  const youBuy = isBuyerFor(proposal, teamId);
  const other = direction === "incoming" ? proposal.proposerTeamId : proposal.counterpartyTeamId;
  const value = proposal.price * proposal.quantity;
  const remaining = proposal.expiresAt - now;
  const reference = state.prices[instrument.id].price;
  const stillInBand = isWithinBand(proposal.price, reference, state.event.rules.priceBandPct, state.event.rules.tickSize);

  const run = async (action: "accept" | "reject" | "cancel") => {
    setPending(action);
    const result =
      action === "accept"
        ? await acceptProposal(state.event.id, teamId, proposal.id)
        : action === "reject"
          ? await rejectProposal(state.event.id, teamId, proposal.id)
          : await cancelProposal(state.event.id, teamId, proposal.id);
    setPending(null);
    if (!result.ok) {
      toast.error(action === "accept" ? "Could not settle trade" : `Could not ${action} proposal`, result.message);
      return;
    }
    if (action === "accept" && "kind" in (result.value as object)) {
      const outcome = result.value as { kind: string; alreadySettled?: boolean };
      if (outcome.kind === "PENDING_APPROVAL") toast.info("Sent for host approval", "This trade is above the approval threshold.");
      else if (!outcome.alreadySettled) toast.success(`Trade settled with ${name(other)}`, `You ${youBuy ? "bought" : "sold"} ${proposal.quantity} ${instrument.symbol} @ ₹${formatPrice(proposal.price)}.`);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <span className="font-mono">{proposal.id}</span>
          <span aria-hidden>·</span>
          <span>{direction === "incoming" ? `From ${name(other)}` : `To ${name(other)}`}</span>
          {proposal.status === "PENDING_APPROVAL" ? (
            <ProposalStatusBadge status={proposal.status} />
          ) : (
            <span className={cn("inline-flex items-center gap-1 tabular-nums", remaining < 30_000 ? "text-warning" : "text-fg-secondary")}>
              <Clock className="size-3" />
              {formatDuration(remaining)}
            </span>
          )}
        </div>
        <p className="mt-1 text-[14px] text-fg-primary">
          You <span className={cn("font-semibold", youBuy ? "text-accent" : "text-fg-primary")}>{youBuy ? "buy" : "sell"}</span>{" "}
          <span className="font-semibold tabular-nums">{formatQuantity(proposal.quantity)}</span> <span className="font-semibold">{instrument.symbol}</span> @{" "}
          <span className="font-semibold tabular-nums">₹{formatPrice(proposal.price)}</span>
        </p>
        <p className="mt-0.5 text-xs text-fg-muted tabular-nums">
          {youBuy ? "You pay" : "You receive"} {formatINR(value)} · reference ₹{formatPrice(reference)}
          {!stillInBand && <span className="text-warning"> · now outside the allowed band</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {direction === "incoming" ? (
          <>
            <Button variant="ghost" size="md" onClick={() => run("reject")} disabled={pending !== null}>
              Reject
            </Button>
            <Button variant="primary" size="md" onClick={() => run("accept")} disabled={pending !== null}>
              {pending === "accept" ? "Settling…" : "Accept & settle"}
            </Button>
          </>
        ) : (
          proposal.status === "PROPOSED" && (
            <Button variant="secondary" size="md" onClick={() => run("cancel")} disabled={pending !== null}>
              {pending === "cancel" ? "Cancelling…" : "Cancel"}
            </Button>
          )
        )}
      </div>
    </li>
  );
}

function RecentOutcomes({ state, teamId, proposals }: { state: EventState; teamId: string; proposals: TradeProposal[] }) {
  const name = teamNameOf(state);
  if (proposals.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Recent outcomes" subtitle="Latest closed proposals" divider />
      <ul className="divide-y divide-border">
        {proposals.map((p) => {
          const instrument = instrumentOf(state, p.instrumentId);
          const reason = p.failureReason ?? p.rejectionReason;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <ProposalStatusBadge status={p.status} />
              <span className="text-fg-primary">
                {isBuyerFor(p, teamId) ? "Buy" : "Sell"} {formatQuantity(p.quantity)} {instrument?.symbol} @ ₹{formatPrice(p.price)}
              </span>
              <span className="text-xs text-fg-muted">with {name(p.proposerTeamId === teamId ? p.counterpartyTeamId : p.proposerTeamId)}</span>
              {reason && <span className="w-full text-xs text-fg-secondary">{reason}</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
