"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Clock, Flag, Hourglass, Inbox, PauseCircle, Send, Snowflake, Timer } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { HelpText, StatePanel } from "@/components/ui/guidance";
import { MoneyInput } from "@/components/ui/money-input";
import { PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProposalStatusBadge } from "@/components/market/status";
import { useRoundClock } from "@/components/market/round-clock";
import { isWithinBand, priceBand, validateProposal } from "@/lib/domain/p2p";
import { formatINR, formatPrice, tradeValue } from "@/lib/domain/money";
import { teamCash, teamShares } from "@/lib/domain/portfolio";
import { checkMarketOpen, currentRound } from "@/lib/domain/trading-gate";
import type { EventState, MarketState, TradeProposal, TradeSide } from "@/lib/domain/types";
import { formatDuration, formatQuantity } from "@/lib/format";
import { acceptProposal, cancelProposal, proposeTrade, rejectProposal } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { instrumentOf, isBuyerFor, proposalsForTeam, teamNameOf } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTerminal } from "./terminal-context";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function TradeScreen() {
  const { state, teamId, team, code } = useTerminal();
  const { marketState } = useRoundClock(state);
  const proposals = proposalsForTeam(state, teamId);
  const open = marketState === "OPEN" && team.status === "ACTIVE";
  const outcomes = proposals.all.filter((p) => !["PROPOSED", "PENDING_APPROVAL", "ACCEPTED"].includes(p.status)).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trade" description="Agree a deal with another team, then send them a proposal. Nothing settles until they accept." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">{open ? <ProposalForm state={state} teamId={teamId} /> : <TradingClosed state={state} marketState={marketState} teamDisabled={team.status !== "ACTIVE"} code={code} />}</div>
        <div className="flex flex-col gap-4 xl:col-span-7">
          <ProposalList
            title="Needs your response"
            icon={<Inbox className="size-3.5" />}
            proposals={proposals.incomingOpen}
            state={state}
            teamId={teamId}
            direction="incoming"
            canRespond={open}
            empty="No proposals are waiting for you. When another team sends one, it appears here."
          />
          <ProposalList
            title="Waiting for the other team"
            icon={<Send className="size-3.5" />}
            proposals={proposals.outgoingOpen}
            state={state}
            teamId={teamId}
            direction="outgoing"
            canRespond={open}
            empty="You have no open proposals."
          />
          {outcomes.length > 0 && <RecentOutcomes state={state} teamId={teamId} proposals={outcomes} />}
        </div>
      </div>
    </div>
  );
}

const CLOSED_COPY: Partial<Record<MarketState, { icon: ReactNode; eyebrow: string; title: string; body: string }>> = {
  PAUSED: { icon: <PauseCircle className="size-5" />, eyebrow: "Trading is paused", title: "The host has paused the round", body: "The timer is on hold. Trading reopens the moment the host resumes the round." },
  FROZEN: { icon: <Snowflake className="size-5" />, eyebrow: "Trading is frozen", title: "The host has frozen all trading", body: "Proposals can't be sent or accepted until the market reopens. Your portfolio is safe." },
  BRIEFING: { icon: <Timer className="size-5" />, eyebrow: "Market briefing", title: "Trading opens in the next round", body: "Use this time to read the news and plan your first trades." },
  BETWEEN_ROUNDS: { icon: <Hourglass className="size-5" />, eyebrow: "Between rounds", title: "The next round starts soon", body: "Trading reopens when the host starts the next round." },
  NOT_STARTED: { icon: <Clock className="size-5" />, eyebrow: "Not started", title: "Trading opens when the first round begins", body: "Explore the markets and your starting portfolio in the meantime." },
  COMPLETED: { icon: <Flag className="size-5" />, eyebrow: "Event complete", title: "Trading has closed", body: "Final standings are on the leaderboard." },
};

function TradingClosed({ marketState, teamDisabled, code }: { state: EventState; marketState: MarketState; teamDisabled: boolean; code: string }) {
  const copy = teamDisabled
    ? { icon: <CircleAlert className="size-5" />, eyebrow: "Team disabled", title: "Your team can't trade right now", body: "Speak to the host. You can still watch the market." }
    : (CLOSED_COPY[marketState] ?? CLOSED_COPY.BETWEEN_ROUNDS!);
  const warning = teamDisabled || marketState === "PAUSED" || marketState === "FROZEN";
  return (
    <Card>
      <StatePanel
        icon={copy.icon}
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.body}
        tone={warning ? "warning" : "neutral"}
        action={
          <>
            <Link href={`/event/${code}/news`} className={buttonClasses({ variant: "secondary" })}>
              Read the news
            </Link>
            <Link href={`/event/${code}/${marketState === "COMPLETED" ? "leaderboard" : "markets"}`} className={buttonClasses({ variant: "ghost" })}>
              {marketState === "COMPLETED" ? "Leaderboard" : "View markets"}
            </Link>
          </>
        }
      />
    </Card>
  );
}

function ProposalForm({ state, teamId }: { state: EventState; teamId: string }) {
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
  const counterparty = teamNameOf(state)(counterpartyId);
  const market = checkMarketOpen(state.event, currentRound(state), now);
  const inBand = price !== null && reference > 0 && isWithinBand(price, reference, state.event.rules.priceBandPct, state.event.rules.tickSize);

  const issues =
    instrument && price !== null
      ? validateProposal(state, { proposerTeamId: teamId, counterpartyTeamId: counterpartyId, side, instrumentId: instrument.id, quantity, price, idempotencyKey }, now)
      : [{ field: "price" as const, message: "Enter a price per share." }];

  const submit = async () => {
    if (!instrument || price === null || issues.length > 0) return;
    setPending(true);
    const result = await proposeTrade(state.event.id, teamId, { counterpartyTeamId: counterpartyId, side, instrumentId: instrument.id, quantity, price, idempotencyKey });
    setPending(false);
    if (result.ok) {
      toast.success(`Proposal sent to ${counterparty}`, `It settles when ${counterparty} accepts. You'll see it under "Waiting for the other team".`);
      setIdempotencyKey(newKey());
    } else {
      toast.error("Proposal not sent", result.message);
    }
  };

  return (
    <Card>
      <CardHeader title="New proposal" subtitle="Step through the form and send it to the other team" divider />
      <form
        className="flex flex-col gap-4 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="I want to">
          <SegmentedControl
            options={[
              { value: "BUY", label: "Buy shares" },
              { value: "SELL", label: "Sell shares" },
            ]}
            value={side}
            onChange={setSide}
            label="Trade side"
            size="md"
            className="w-full [&>button]:h-8 [&>button]:flex-1"
          />
        </Field>

        <Field
          label="Stock"
          htmlFor="trade-instrument"
          hint={instrument ? `Reference ₹${formatPrice(reference)} · ${side === "SELL" ? `you hold ${formatQuantity(held)}` : `cash ${formatINR(cash, 0)}`}` : undefined}
        >
          <Select
            id="trade-instrument"
            value={instrumentId}
            onValueChange={(id) => {
              setInstrumentId(id);
              setPrice(state.prices[id].price);
            }}
            options={enabled.map((i) => ({ value: i.id, label: `${i.symbol} · ${i.name}`, disabled: i.halted, hint: i.halted ? "Halted by host" : `₹${formatPrice(state.prices[i.id].price)}` }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="trade-qty">
            <Input id="trade-qty" inputMode="numeric" value={quantityText} onChange={(e) => setQuantityText(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <Field
            label="Price per share"
            htmlFor="trade-price"
            aside={
              <button type="button" onClick={() => setPrice(reference)} className="rounded text-[11px] text-accent-text hover:underline">
                Use reference
              </button>
            }
          >
            <MoneyInput id="trade-price" value={price} onValueChange={setPrice} aria-invalid={price !== null && !inBand} />
          </Field>
        </div>
        <p className={cn("-mt-2 text-xs tabular-nums", price !== null && !inBand ? "text-warning" : "text-fg-muted")}>
          Allowed price: ₹{formatPrice(band.min)} – ₹{formatPrice(band.max)} (±{state.event.rules.priceBandPct}% of reference)
        </p>

        <Field label="With team" htmlFor="trade-counterparty">
          <Select
            id="trade-counterparty"
            value={counterpartyId}
            onValueChange={setCounterpartyId}
            options={state.teams.filter((t) => t.id !== teamId).map((t) => ({ value: t.id, label: t.name, disabled: t.status !== "ACTIVE", hint: t.status !== "ACTIVE" ? "Disabled" : undefined }))}
          />
        </Field>

        <div className="rounded-lg border border-border bg-surface-raised/60 px-4 py-3">
          <p className="text-[14px] text-fg-primary">
            You <span className="font-semibold">{side === "BUY" ? "buy" : "sell"}</span>{" "}
            <span className="font-semibold tabular-nums">{Number.isFinite(quantity) ? formatQuantity(quantity) : 0}</span> <span className="font-semibold">{instrument?.symbol ?? "—"}</span>{" "}
            {side === "BUY" ? "from" : "to"} <span className="font-semibold">{counterparty}</span>
          </p>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <span className="text-xs text-fg-muted tabular-nums">at ₹{price !== null ? formatPrice(price) : "—"} per share</span>
            <span className="text-right leading-tight">
              <span className="block text-[11px] text-fg-muted">{side === "BUY" ? "You pay" : "You receive"}</span>
              <span className="block text-lg font-semibold text-fg-primary tabular-nums">{formatINR(value)}</span>
            </span>
          </div>
        </div>

        {issues.length > 0 && price !== null && market.ok && (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-[13px] text-fg-primary" role="status">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            {issues[0].message}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={pending || issues.length > 0} className="w-full">
          <Send className="size-4" />
          {pending ? "Sending…" : `Send proposal to ${counterparty}`}
        </Button>
        <HelpText>
          {counterparty} must accept before anything settles. Proposals expire after {Math.round(state.event.rules.proposalExpirySeconds / 60)} minutes.
        </HelpText>
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
  canRespond,
}: {
  title: string;
  icon: ReactNode;
  proposals: TradeProposal[];
  state: EventState;
  teamId: string;
  empty: string;
  direction: "incoming" | "outgoing";
  canRespond: boolean;
}) {
  return (
    <Card className={cn(direction === "incoming" && proposals.length > 0 && "border-accent/40")}>
      <CardHeader title={title} icon={icon} subtitle={proposals.length ? `${proposals.length} open` : undefined} divider />
      {proposals.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-fg-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} state={state} teamId={teamId} direction={direction} canRespond={canRespond} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProposalCard({ proposal, state, teamId, direction, canRespond }: { proposal: TradeProposal; state: EventState; teamId: string; direction: "incoming" | "outgoing"; canRespond: boolean }) {
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
      toast.error(action === "accept" ? "Trade could not settle" : `Could not ${action} the proposal`, result.message);
      return;
    }
    if (action === "accept") {
      const outcome = result.value as { kind: string; alreadySettled?: boolean };
      if (outcome.kind === "PENDING_APPROVAL") toast.info("Sent to the host for approval", "Large trades need host approval before they settle.");
      else if (!outcome.alreadySettled) toast.success(`Trade settled with ${name(other)}`, `You ${youBuy ? "bought" : "sold"} ${proposal.quantity} ${instrument.symbol} at ₹${formatPrice(proposal.price)}.`);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-fg-primary">
          <span className="font-semibold">{direction === "incoming" ? name(other) : `To ${name(other)}`}</span>
          <span className="text-fg-secondary">{direction === "incoming" ? " offers: you " : ": you "}</span>
          <span className={cn("font-semibold", youBuy ? "text-accent-text" : "text-fg-primary")}>{youBuy ? "buy" : "sell"}</span>{" "}
          <span className="font-semibold tabular-nums">{formatQuantity(proposal.quantity)}</span> <span className="font-semibold">{instrument.symbol}</span>
          <span className="text-fg-secondary"> at </span>
          <span className="font-semibold tabular-nums">₹{formatPrice(proposal.price)}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted tabular-nums">
          <span>
            {youBuy ? "You pay" : "You receive"} {formatINR(value)}
          </span>
          <span aria-hidden>·</span>
          {proposal.status === "PENDING_APPROVAL" ? (
            <ProposalStatusBadge status={proposal.status} />
          ) : (
            <span className={cn("inline-flex items-center gap-1", remaining < 30_000 && "text-warning")}>
              <Clock className="size-3" /> expires in {formatDuration(remaining)}
            </span>
          )}
          {!stillInBand && <span className="text-warning">· price now outside the allowed band</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {direction === "incoming" ? (
          <>
            <Button variant="ghost" onClick={() => run("reject")} disabled={pending !== null}>
              Decline
            </Button>
            <Button variant="primary" onClick={() => run("accept")} disabled={pending !== null || !canRespond} title={canRespond ? undefined : "Trading is closed right now"}>
              {pending === "accept" ? "Settling…" : "Accept & settle"}
            </Button>
          </>
        ) : (
          proposal.status === "PROPOSED" && (
            <Button variant="secondary" onClick={() => run("cancel")} disabled={pending !== null}>
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
  return (
    <Card>
      <CardHeader title="Recent outcomes" divider />
      <ul className="divide-y divide-border">
        {proposals.map((p) => {
          const instrument = instrumentOf(state, p.instrumentId);
          const reason = p.failureReason ?? p.rejectionReason;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <ProposalStatusBadge status={p.status} />
              <span className="text-fg-primary">
                {isBuyerFor(p, teamId) ? "Buy" : "Sell"} {formatQuantity(p.quantity)} {instrument?.symbol} at ₹{formatPrice(p.price)}
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
