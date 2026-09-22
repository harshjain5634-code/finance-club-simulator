"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, ArrowRight, CircleAlert, Clock, Inbox, Reply, Send, Snowflake, X } from "lucide-react";
import { Button, ButtonKbd, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProposalStatusBadge } from "@/components/market/status";
import { useRoundClock } from "@/components/market/round-clock";
import { computeLeaderboard } from "@/lib/domain/leaderboard";
import { isWithinBand, priceBand, validateProposal, type ValidationIssue } from "@/lib/domain/p2p";
import { formatINR, formatPrice, tradeValue } from "@/lib/domain/money";
import { teamCash, teamShares } from "@/lib/domain/portfolio";
import type { EventState, MarketState, TradeProposal, TradeSide } from "@/lib/domain/types";
import { formatDuration, formatQuantity } from "@/lib/format";
import { acceptProposal, cancelProposal, counterProposal, proposeTrade, rejectProposal } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { instrumentOf, proposalsForTeam, proposalView, teamNameOf } from "@/lib/mock/selectors";
import { useOnlineTeams } from "@/lib/mock/runtime";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTerminal } from "./terminal-context";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const rupee = (paise: number) => `₹${formatPrice(paise)}`;
const expiryLabel = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}` : formatDuration(seconds * 1000));

const CLOSED_COPY: Partial<Record<MarketState, { title: string; body: string }>> = {
  FROZEN: { title: "The host has frozen trading", body: "You can prepare this proposal now; Send unlocks when trading reopens. Nothing is lost." },
  PAUSED: { title: "The event is paused", body: "You can prepare this proposal now; Send unlocks when the host resumes the round." },
  BRIEFING: { title: "Trading opens when Round 1 starts", body: "Use the briefing to plan: you can fill in a proposal now and send it once the round opens." },
  BETWEEN_ROUNDS: { title: "Between rounds", body: "Trading reopens when the host starts the next round. You can prepare a proposal now." },
  NOT_STARTED: { title: "The event hasn't started", body: "Explore the stocks and plan your first trade. Send unlocks when Round 1 starts." },
  COMPLETED: { title: "The event is over", body: "Trading has closed. Final standings are on the leaderboard." },
};

/**
 * C4 Trade (section 07). Left: the proposal ticket as numbered steps (counterparty → stock → side → quantity and
 * price → review → send) with a plain-English summary and inline fixes. Right: proposals that need a response,
 * offers waiting for other teams, and history. Counter creates a new linked proposal; history is never edited.
 */
export function TradeScreen() {
  const { state, teamId, team, code } = useTerminal();
  const { marketState } = useRoundClock(state);
  const searchParams = useSearchParams();
  const router = useRouter();
  const proposals = proposalsForTeam(state, teamId);
  const open = marketState === "OPEN" && team.status === "ACTIVE";
  // Waiting on someone else: what we sent, plus trades we accepted that now wait for a host check.
  const waiting = proposals.all.filter((p) => (p.proposerTeamId === teamId && (p.status === "PROPOSED" || p.status === "PENDING_APPROVAL")) || (p.counterpartyTeamId === teamId && p.status === "PENDING_APPROVAL"));
  const history = proposals.all.filter((p) => !["PROPOSED", "PENDING_APPROVAL", "ACCEPTED"].includes(p.status)).slice(0, 12);
  const counterId = searchParams.get("counter");
  const counterOf = counterId ? (proposals.incomingOpen.find((p) => p.id === counterId) ?? null) : null;
  const focusId = searchParams.get("proposal");

  const startCounter = (proposal: TradeProposal) => router.replace(`/event/${code}/trade?counter=${proposal.id}`, { scroll: false });
  const endCounter = () => router.replace(`/event/${code}/trade`, { scroll: false });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Trade" description="Agree a price with another team, then send a proposal. Nothing settles until they accept." className="md:hidden" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        <div className="order-2 xl:order-1">
          <ProposalTicket key={counterOf?.id ?? "new"} state={state} teamId={teamId} canSend={open} marketState={marketState} teamDisabled={team.status !== "ACTIVE"} counterOf={counterOf} onCounterDone={endCounter} code={code} />
        </div>
        <div className="order-1 min-w-0 xl:order-2">
          <Tabs defaultValue={proposals.incomingOpen.length > 0 || waiting.length === 0 ? "incoming" : "waiting"}>
            <TabsList className="border-b-0 px-0">
              <TabsTrigger value="incoming" count={proposals.incomingOpen.length || undefined}>
                Needs your response
              </TabsTrigger>
              <TabsTrigger value="waiting" count={waiting.length || undefined}>
                Waiting for others
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <span className="ml-auto hidden text-caption text-fg-muted sm:block">
                {proposals.outgoingOpen.filter((p) => p.status === "PROPOSED").length} / {state.event.rules.maxOpenOutgoingProposals} open
              </span>
            </TabsList>
            <TabsContent value="incoming" className="mt-4 flex flex-col gap-4">
              {proposals.incomingOpen.length === 0 ? (
                <EmptyList icon={<Inbox className="size-5" />} title="Nothing waiting for you" body={`Proposals from other teams show here. They expire after ${Math.round(state.event.rules.proposalExpirySeconds / 60)} minutes.`} />
              ) : (
                proposals.incomingOpen.map((p) => (
                  <IncomingProposal key={p.id} state={state} teamId={teamId} proposal={p} canRespond={open} focused={p.id === focusId} countering={p.id === counterOf?.id} onCounter={() => startCounter(p)} />
                ))
              )}
              {waiting.length > 0 && (
                <>
                  <h2 className="mt-2 flex items-center gap-2 text-h3 font-semibold text-fg-primary">
                    Waiting for other teams <span className="text-caption font-medium text-fg-muted">{waiting.length}</span>
                  </h2>
                  {waiting.map((p) => (
                    <OutgoingProposal key={p.id} state={state} teamId={teamId} proposal={p} />
                  ))}
                </>
              )}
            </TabsContent>
            <TabsContent value="waiting" className="mt-4 flex flex-col gap-4">
              {waiting.length === 0 ? (
                <EmptyList icon={<Send className="size-5" />} title="No offers waiting" body="Proposals you send appear here until the other team answers or they expire." />
              ) : (
                waiting.map((p) => <OutgoingProposal key={p.id} state={state} teamId={teamId} proposal={p} />)
              )}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              {history.length === 0 ? (
                <EmptyList icon={<ArrowLeftRight className="size-5" />} title="No history yet" body="Settled, rejected and expired proposals appear here. Full details are in Transactions." />
              ) : (
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-border-subtle">
                    {history.map((p) => (
                      <HistoryRow key={p.id} state={state} teamId={teamId} proposal={p} />
                    ))}
                  </ul>
                  <Link href={`/event/${code}/transactions`} className="flex items-center gap-1 border-t border-border px-4 py-3 text-[13px] font-medium text-accent-text hover:underline">
                    All transactions <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function EmptyList({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-lg bg-canvas-subtle text-fg-secondary">{icon}</span>
      <p className="mt-3 text-h3 font-semibold text-fg-primary">{title}</p>
      <p className="mt-1 max-w-sm text-meta text-fg-secondary">{body}</p>
    </div>
  );
}

function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="flex w-full items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-canvas-subtle text-caption font-semibold text-fg-secondary">{n}</span>
        <span className="text-[14px] font-medium text-fg-primary">{title}</span>
        {aside && <span className="ml-auto text-caption text-fg-muted">{aside}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-caption text-negative">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function ProposalTicket({
  state,
  teamId,
  canSend,
  marketState,
  teamDisabled,
  counterOf,
  onCounterDone,
  code,
}: {
  state: EventState;
  teamId: string;
  canSend: boolean;
  marketState: MarketState;
  teamDisabled: boolean;
  counterOf: TradeProposal | null;
  onCounterDone: () => void;
  code: string;
}) {
  const searchParams = useSearchParams();
  const now = useNow();
  const online = useOnlineTeams(state.event.id);
  const enabled = state.instruments.filter((i) => i.enabled);
  const standings = useMemo(() => computeLeaderboard(state), [state]);
  const initialSymbol = searchParams.get("symbol")?.toUpperCase();
  const initialInstrument = counterOf ? instrumentOf(state, counterOf.instrumentId) : (enabled.find((i) => i.symbol === initialSymbol) ?? enabled[0]);
  const otherTeams = state.teams.filter((t) => t.id !== teamId);

  const [side, setSide] = useState<TradeSide>(counterOf ? (counterOf.side === "BUY" ? "SELL" : "BUY") : searchParams.get("side") === "SELL" ? "SELL" : "BUY");
  const [instrumentId, setInstrumentId] = useState(initialInstrument?.id ?? "");
  const [quantityText, setQuantityText] = useState(counterOf ? String(counterOf.quantity) : "");
  const [price, setPrice] = useState<number | null>(counterOf ? counterOf.price : initialInstrument ? state.prices[initialInstrument.id].price : null);
  const [counterpartyId, setCounterpartyId] = useState(counterOf ? counterOf.proposerTeamId : (otherTeams.find((t) => t.status === "ACTIVE")?.id ?? ""));
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);
  const ticketRef = useRef<HTMLElement>(null);

  // Counter mode opens below the proposal list on narrow screens: bring the ticket into view and focus price.
  useEffect(() => {
    if (!counterOf) return;
    ticketRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    ticketRef.current?.querySelector<HTMLInputElement>("#trade-price")?.focus({ preventScroll: true });
  }, [counterOf]);

  const instrument = instrumentOf(state, instrumentId);
  const reference = instrument ? state.prices[instrument.id].price : 0;
  const { rules } = state.event;
  const band = priceBand(reference, rules.priceBandPct, rules.tickSize);
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
  const hasQuantity = Number.isFinite(quantity) && quantity > 0;
  const value = price !== null && hasQuantity ? tradeValue(price, quantity) : 0;
  const cash = teamCash(state, teamId);
  const held = instrument ? teamShares(state, teamId, instrument.id) : 0;
  const counterparty = teamNameOf(state)(counterpartyId);
  const inBand = price !== null && reference > 0 && isWithinBand(price, reference, rules.priceBandPct, rules.tickSize);
  const maxBuy = price ? Math.floor(cash / price) : 0;

  const issues: ValidationIssue[] =
    instrument && price !== null && hasQuantity
      ? validateProposal(state, { proposerTeamId: teamId, counterpartyTeamId: counterpartyId, side, instrumentId: instrument.id, quantity, price, idempotencyKey }, now)
      : [];
  const blocking = issues.filter((i) => i.field !== "market");
  const priceIssue = issues.find((i) => i.field === "price");
  const quantityIssue = issues.find((i) => i.field === "quantity");
  const resourceIssue = issues.find((i) => i.field === "resources");
  const limitIssue = issues.find((i) => i.field === "limit");
  const otherIssue = issues.find((i) => i.field === "counterparty" || i.field === "instrument");
  const ready = hasQuantity && price !== null && blocking.length === 0 && canSend;
  const closed = !canSend ? (teamDisabled ? { title: "Your team is disabled", body: "Speak to the host. You can still watch the market." } : CLOSED_COPY[marketState]) : null;

  const submit = async () => {
    setTouched(true);
    if (!instrument || price === null || !ready) return;
    setPending(true);
    const result = counterOf
      ? await counterProposal(state.event.id, teamId, { originalProposalId: counterOf.id, quantity, price, idempotencyKey })
      : await proposeTrade(state.event.id, teamId, { counterpartyTeamId: counterpartyId, side, instrumentId: instrument.id, quantity, price, idempotencyKey });
    setPending(false);
    if (result.ok) {
      toast.success(
        counterOf ? `Counter-offer sent to ${counterparty}` : `Proposal sent to ${counterparty}`,
        `${side === "BUY" ? "Buy" : "Sell"} ${formatQuantity(quantity)} ${instrument.symbol} at ${rupee(price)} · expires in ${expiryLabel(rules.proposalExpirySeconds)}. Nothing settles until they accept.`,
      );
      setIdempotencyKey(newKey());
      setQuantityText("");
      setTouched(false);
      if (counterOf) onCounterDone();
    } else {
      toast.error(counterOf ? "Counter-offer not sent" : "Proposal not sent", result.message);
    }
  };

  const sentence = hasQuantity && price !== null && instrument ? `You are ${side === "BUY" ? "buying" : "selling"} ${formatQuantity(quantity)} ${instrument.symbol} shares ${side === "BUY" ? "from" : "to"} ${counterparty} at ${rupee(price)} each for ${formatINR(value)}.` : null;
  const cashAfter = side === "BUY" ? cash - value : cash + value;
  const sharesAfter = side === "BUY" ? held + (hasQuantity ? quantity : 0) : held - (hasQuantity ? quantity : 0);

  return (
    <Card ref={ticketRef} className={cn("scroll-mt-24 p-6", counterOf && "border-accent")}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-labelledby="ticket-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ticket-title" className="text-h2 font-semibold text-fg-primary">
              {counterOf ? `Counter ${counterparty}'s offer` : "New proposal"}
            </h2>
            {counterOf && <p className="mt-1 text-caption text-fg-secondary">Sends {counterparty} a new proposal and rejects theirs ({counterOf.id}). Both stay in your history.</p>}
          </div>
          {counterOf ? (
            <Button variant="ghost" size="sm" onClick={onCounterDone}>
              <X /> Cancel counter
            </Button>
          ) : (
            <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm bg-canvas-subtle px-2.5 text-caption font-medium whitespace-nowrap text-fg-secondary">
              <ArrowLeftRight className="size-3.5" aria-hidden /> Peer-to-peer
            </span>
          )}
        </div>

        {closed && (
          <div role="status" className="flex gap-3 rounded-md bg-warning-soft px-4 py-3">
            <Snowflake className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="text-[15px] font-medium text-fg-primary">{closed.title}</p>
              <p className="mt-0.5 text-meta text-fg-secondary">{closed.body}</p>
            </div>
          </div>
        )}

        <Step n={1} title="Who are you trading with?" aside={`${otherTeams.length} teams`}>
          <Select
            aria-label="Team you are trading with"
            value={counterpartyId}
            onValueChange={setCounterpartyId}
            disabled={!!counterOf}
            options={otherTeams.map((t) => {
              const rank = standings.find((r) => r.teamId === t.id)?.rank;
              return {
                value: t.id,
                label: t.name,
                disabled: t.status !== "ACTIVE",
                hint: t.status !== "ACTIVE" ? "Disabled by host" : `${rank ? `#${rank}` : ""}${online.has(t.id) ? " · online" : ""}`,
              };
            })}
          />
          {otherIssue?.field === "counterparty" && <FieldError>{otherIssue.message}</FieldError>}
        </Step>

        <Step n={2} title="Which stock?" aside={`${enabled.length} stocks`}>
          <Select
            aria-label="Stock"
            value={instrumentId}
            disabled={!!counterOf}
            onValueChange={(id) => {
              setInstrumentId(id);
              setPrice(state.prices[id].price);
            }}
            options={enabled.map((i) => ({ value: i.id, label: `${i.symbol} · ${i.name}`, disabled: i.halted, hint: i.halted ? "Halted by host" : `last ${rupee(state.prices[i.id].price)}` }))}
          />
        </Step>

        <Step n={3} title="Buy or sell?">
          <SegmentedControl
            options={[
              { value: "BUY", label: `Buy from ${counterparty}`, disabled: !!counterOf && side !== "BUY" },
              { value: "SELL", label: `Sell to ${counterparty}`, disabled: !!counterOf && side !== "SELL" },
            ]}
            value={side}
            onChange={setSide}
            label="Buy or sell"
            size="md"
            className="w-full [&>button]:flex-1"
          />
        </Step>

        <Step n={4} title="How many, at what price?" aside={instrument ? (side === "SELL" ? `you hold ${formatQuantity(held)} ${instrument.symbol}` : `cash ${formatINR(cash, 0)}`) : undefined}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="trade-qty" className="text-[13px] font-medium text-fg-primary">
                Quantity
              </label>
              <Input
                id="trade-qty"
                inputMode="numeric"
                placeholder="0"
                value={quantityText}
                onChange={(e) => {
                  setQuantityText(e.target.value.replace(/[^\d]/g, ""));
                  setTouched(true);
                }}
                aria-invalid={touched && (!!quantityIssue || (side === "SELL" && !!resourceIssue))}
                className="font-mono"
              />
              {quantityIssue && touched ? (
                <FieldError>{quantityIssue.message}</FieldError>
              ) : side === "SELL" && resourceIssue && touched ? (
                <FieldError>
                  You hold {formatQuantity(held)} {instrument?.symbol}. No short selling: sell {formatQuantity(held)} or fewer.
                </FieldError>
              ) : (
                <p className="text-caption text-fg-muted">Whole shares only</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="trade-price" className="text-[13px] font-medium text-fg-primary">
                  Price per share
                </label>
                <button type="button" onClick={() => setPrice(reference)} className="tap-target rounded-xs text-caption font-medium text-accent-text hover:underline">
                  Use last price
                </button>
              </div>
              <MoneyInput id="trade-price" value={price} onValueChange={setPrice} aria-invalid={price !== null && !inBand} aria-describedby="trade-price-help" />
              {priceIssue && price !== null ? (
                <FieldError>
                  Must be between {rupee(band.min)} and {rupee(band.max)} (±{rules.priceBandPct}% of {rupee(reference)}).
                </FieldError>
              ) : (
                <p id="trade-price-help" className="font-mono text-caption text-fg-muted">
                  Allowed {rupee(band.min)} – {rupee(band.max)}
                </p>
              )}
            </div>
          </div>
        </Step>

        <Step n={5} title="Review">
          {side === "BUY" && resourceIssue && hasQuantity && price !== null ? (
            <div role="alert" className="rounded-md bg-negative-soft px-4 py-3">
              <p className="text-[15px] font-medium text-fg-primary">
                You need {formatINR(value, 0)} ({formatQuantity(quantity)} × {rupee(price)}) but have {formatINR(cash, 0)}
              </p>
              <p className="mt-1 text-meta text-fg-secondary">Lower the quantity to {formatQuantity(maxBuy)} shares or less, or lower the price. Cash is only spent when the other team accepts.</p>
              {maxBuy > 0 && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => setQuantityText(String(maxBuy))}>
                  Use max {formatQuantity(maxBuy)}
                </Button>
              )}
            </div>
          ) : limitIssue ? (
            <div role="alert" className="rounded-md bg-warning-soft px-4 py-3">
              <p className="text-[15px] font-medium text-fg-primary">Proposal limit reached</p>
              <p className="mt-1 text-meta text-fg-secondary">{limitIssue.message} Withdraw one to send another; expired ones free up automatically.</p>
            </div>
          ) : sentence ? (
            <div className="rounded-md bg-accent-soft px-4 py-4">
              <p className="text-[16px] leading-6 font-medium text-fg-primary">{sentence}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-caption">
                <dt className="text-fg-secondary">Cash</dt>
                <dd className="font-mono text-[13px] text-fg-primary">
                  <span className="text-fg-muted">{formatINR(cash, 0)}</span> → {formatINR(cashAfter, 0)}
                </dd>
                <dt className="text-fg-secondary">{instrument?.symbol}</dt>
                <dd className="font-mono text-[13px] text-fg-primary">
                  <span className="text-fg-muted">{formatQuantity(held)} shares</span> → {formatQuantity(sharesAfter)} shares
                </dd>
                <dt className="text-fg-secondary">vs last price</dt>
                <dd className="font-mono text-[13px] text-fg-primary">
                  <span className="text-fg-muted">{rupee(reference)}</span> →{" "}
                  {price === reference ? "same as last" : `${rupee(Math.abs(price! - reference))} ${price! > reference ? "above" : "below"} (${((Math.abs(price! - reference) / reference) * 100).toFixed(1)}%)`}
                </dd>
              </dl>
              <p className="mt-3 text-caption text-fg-secondary">
                P2P trades never move the market price. {counterparty} has {expiryLabel(rules.proposalExpirySeconds)} to accept.
              </p>
            </div>
          ) : (
            <p className="rounded-md bg-canvas-subtle px-4 py-3 text-meta text-fg-secondary">Enter a quantity to see exactly what you pay or receive and what you hold afterwards.</p>
          )}
        </Step>

        <Button type="submit" variant="primary" size="lg" disabled={pending || !ready} className="w-full" aria-keyshortcuts="Enter">
          <Send />
          {pending ? "Sending…" : !canSend ? "Send when trading reopens" : counterOf ? `Send counter-offer to ${counterparty}` : `Send proposal to ${counterparty}`}
          {canSend && <ButtonKbd variant="primary">↵</ButtonKbd>}
        </Button>
        {!canSend && marketState === "COMPLETED" && (
          <Link href={`/event/${code}/leaderboard`} className={buttonClasses({ variant: "ghost", className: "-mt-3" })}>
            Final standings
          </Link>
        )}
      </form>
    </Card>
  );
}

function useProposalAction(state: EventState, teamId: string, proposal: TradeProposal) {
  const [pending, setPending] = useState<"accept" | "reject" | "cancel" | null>(null);
  const view = proposalView(state, proposal, teamId);
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
      toast.error(action === "accept" ? "Trade could not settle" : action === "reject" ? "Could not reject the proposal" : "Could not withdraw the proposal", result.message);
      return;
    }
    if (action === "accept") {
      const outcome = result.value as { kind: string; alreadySettled?: boolean };
      if (outcome.kind === "PENDING_APPROVAL") toast.info("Sent to the host for approval", "Large trades wait for a host check before they settle.");
      else if (!outcome.alreadySettled) toast.success(`Trade settled with ${view.otherTeam}`, `You ${view.youBuy ? "bought" : "sold"} ${formatQuantity(proposal.quantity)} ${view.symbol} at ${rupee(proposal.price)}.`);
    } else if (action === "reject") toast.info(`Rejected ${view.otherTeam}'s proposal`);
    else toast.info("Proposal withdrawn");
  };
  return { pending, run, view };
}

function IncomingProposal({ state, teamId, proposal, canRespond, focused, countering, onCounter }: { state: EventState; teamId: string; proposal: TradeProposal; canRespond: boolean; focused: boolean; countering: boolean; onCounter: () => void }) {
  const now = useNow();
  const ref = useRef<HTMLElement>(null);
  const { pending, run, view } = useProposalAction(state, teamId, proposal);
  const remaining = proposal.expiresAt - now;
  const expiring = remaining <= 30_000;
  const instrument = instrumentOf(state, proposal.instrumentId)!;
  const { approvalEnabled, approvalThreshold } = state.event.rules;
  const needsApproval = approvalEnabled && approvalThreshold !== null && proposal.price * proposal.quantity >= approvalThreshold;

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA"].includes(target.tagName) || event.metaKey || event.ctrlKey || !canRespond || pending) return;
    if (event.key === "a" || event.key === "A") {
      event.preventDefault();
      void run("accept");
    } else if (event.key === "c" || event.key === "C") {
      event.preventDefault();
      onCounter();
    }
  };

  return (
    <article
      ref={ref}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label={view.sentence}
      className={cn("rounded-lg border p-5 focus:outline-none focus-visible:ring-3 focus-visible:ring-accent/25", expiring ? "border-warning bg-warning-soft" : "border-accent bg-surface", (focused || countering) && "ring-3 ring-accent/20")}
    >
      <div className="flex items-center gap-2">
        <Inbox className="size-4 text-accent-text" aria-hidden />
        <p className="text-[13px] font-medium text-accent-text">
          {proposal.counterOfProposalId ? "Counter-offer from" : "Incoming from"} {view.otherTeam}
        </p>
        <span className={cn("ml-auto inline-flex items-center gap-1 font-mono text-caption", expiring ? "text-warning" : "text-fg-muted")}>
          <Clock className="size-3.5" aria-hidden />
          expires in {formatDuration(Math.min(Math.max(0, remaining), state.event.rules.proposalExpirySeconds * 1000))}
        </span>
      </div>
      <p className="mt-3 text-[16px] leading-6 font-semibold text-fg-primary">{view.sentence} each.</p>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
        {[
          [view.youBuy ? "You pay" : "You receive", formatINR(view.value, 0)],
          ["Cash after", formatINR(view.cashAfter, 0)],
          [`${instrument.symbol} after`, `${formatQuantity(view.sharesAfter)} shares`],
          ["vs last price", view.vsLast === 0 ? "same" : `${rupee(Math.abs(view.vsLast))} ${view.vsLast > 0 ? "above" : "below"}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-canvas-subtle px-3 py-2">
            <dt className="text-caption text-fg-muted">{k}</dt>
            <dd className="mt-0.5 font-mono text-[14px] font-medium text-fg-primary">{v}</dd>
          </div>
        ))}
      </dl>
      {!view.youBuy && view.sharesNow < proposal.quantity && (
        <p className="mt-3 text-caption text-negative">You hold {formatQuantity(view.sharesNow)} {instrument.symbol}, so this can&apos;t settle unless you get more shares first.</p>
      )}
      {view.youBuy && view.cashAfter < 0 && <p className="mt-3 text-caption text-negative">You don&apos;t have enough cash for this: it would fail at settlement.</p>}
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        <Button variant="primary" onClick={() => run("accept")} disabled={pending !== null || !canRespond} title={canRespond ? undefined : "Trading is closed right now"}>
          {pending === "accept" ? (needsApproval ? "Accepting…" : "Settling…") : needsApproval ? "Accept" : "Accept & settle"}
          <ButtonKbd variant="primary">A</ButtonKbd>
        </Button>
        <Button variant="secondary" onClick={onCounter} disabled={pending !== null || !canRespond}>
          <Reply /> Counter
          <ButtonKbd>C</ButtonKbd>
        </Button>
        <Button variant="ghost" onClick={() => run("reject")} disabled={pending !== null}>
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      <p className="mt-3 text-caption text-fg-muted">{needsApproval ? `Trades of ${formatINR(state.event.rules.approvalThreshold ?? 0, 0)} or more wait for a quick host check after you accept, then settle.` : "Accepting settles immediately and can't be undone."} Counter sends {view.otherTeam} a new proposal and rejects this one.</p>
    </article>
  );
}

function OutgoingProposal({ state, teamId, proposal }: { state: EventState; teamId: string; proposal: TradeProposal }) {
  const now = useNow();
  const { pending, run, view } = useProposalAction(state, teamId, proposal);
  const remaining = proposal.expiresAt - now;
  const expiring = proposal.status === "PROPOSED" && remaining <= 30_000;
  return (
    <article className={cn("rounded-lg border bg-surface p-5", expiring ? "border-warning" : "border-border")}>
      <div className="flex items-center gap-2">
        <Send className="size-4 text-fg-secondary" aria-hidden />
        <p className="text-[13px] font-medium text-fg-secondary">
          {proposal.proposerTeamId === teamId ? `Sent to ${view.otherTeam}` : `From ${view.otherTeam} · you accepted`}
          {proposal.counterOfProposalId ? " · counter-offer" : ""}
        </p>
        <span className="ml-auto">
          {proposal.status === "PENDING_APPROVAL" ? (
            <ProposalStatusBadge status={proposal.status} />
          ) : (
            <span className={cn("inline-flex items-center gap-1 font-mono text-caption", expiring ? "text-warning" : "text-fg-muted")}>
              <Clock className="size-3.5" aria-hidden />
              expires in {formatDuration(Math.min(Math.max(0, remaining), state.event.rules.proposalExpirySeconds * 1000))}
            </span>
          )}
        </span>
      </div>
      <p className="mt-3 text-[16px] leading-6 font-semibold text-fg-primary">{view.sentence} each.</p>
      <div className="mt-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-caption text-fg-secondary">
          {proposal.status === "PENDING_APPROVAL" ? "Accepted · waiting for a host check before it settles" : `Waiting for ${view.otherTeam} · you will ${view.youBuy ? "pay" : "receive"} ${formatINR(view.value, 0)} if they accept`}
        </p>
        {proposal.status === "PROPOSED" && (
          <Button variant="ghost" size="sm" onClick={() => run("cancel")} disabled={pending !== null}>
            {pending === "cancel" ? "Withdrawing…" : "Withdraw"}
          </Button>
        )}
      </div>
    </article>
  );
}

function HistoryRow({ state, teamId, proposal }: { state: EventState; teamId: string; proposal: TradeProposal }) {
  const view = proposalView(state, proposal, teamId);
  const reason = proposal.failureReason ?? proposal.rejectionReason;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <Avatar name={view.otherTeam} size="sm" />
      <span className="min-w-0 flex-1 text-[14px] text-fg-primary">
        {view.youBuy ? "Buy" : "Sell"} {formatQuantity(proposal.quantity)} {view.symbol} at {rupee(proposal.price)} <span className="text-fg-muted">with {view.otherTeam}</span>
      </span>
      <span className="font-mono text-caption text-fg-muted">{proposal.id}</span>
      <ProposalStatusBadge status={proposal.status} />
      {reason && <span className="w-full pl-9 text-caption text-fg-secondary">{reason}</span>}
    </li>
  );
}
