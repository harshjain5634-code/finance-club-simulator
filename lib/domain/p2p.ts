import { appendAudit } from "./audit";
import { nextId } from "./ids";
import { CASH, instrumentAsset, LedgerError, postJournal, teamAccount } from "./ledger";
import { formatINR, formatPrice, tradeValue } from "./money";
import { applyBuyToBasis, applySellToBasis, recordValuation, teamCash, teamShares } from "./portfolio";
import { checkMarketOpen, checkTradingGate, currentRound } from "./trading-gate";
import type {
  EventState,
  OpContext,
  OpResult,
  Paise,
  ProposalStatus,
  Trade,
  TradeProposal,
  TradeSide,
} from "./types";
import { fail, ok } from "./types";

export const OPEN_STATUSES: ProposalStatus[] = ["PROPOSED", "PENDING_APPROVAL"];
export const FINAL_STATUSES: ProposalStatus[] = ["SETTLED", "REJECTED", "REJECTED_BY_HOST", "CANCELLED", "EXPIRED", "FAILED"];

export function priceBand(reference: Paise, bandPct: number, tick: Paise): { min: Paise; max: Paise } {
  return {
    min: Math.ceil((reference * (1 - bandPct / 100)) / tick) * tick,
    max: Math.floor((reference * (1 + bandPct / 100)) / tick) * tick,
  };
}

export function isWithinBand(price: Paise, reference: Paise, bandPct: number, tick: Paise): boolean {
  const band = priceBand(reference, bandPct, tick);
  return price >= band.min && price <= band.max;
}

export function buyerAndSeller(proposal: Pick<TradeProposal, "side" | "proposerTeamId" | "counterpartyTeamId">) {
  return proposal.side === "BUY"
    ? { buyerTeamId: proposal.proposerTeamId, sellerTeamId: proposal.counterpartyTeamId }
    : { buyerTeamId: proposal.counterpartyTeamId, sellerTeamId: proposal.proposerTeamId };
}

export type ProposalInput = {
  proposerTeamId: string;
  counterpartyTeamId: string;
  side: TradeSide;
  instrumentId: string;
  quantity: number;
  price: Paise;
  idempotencyKey: string;
  /** Links a counter-offer to the proposal it answers (see counterProposal). */
  counterOfProposalId?: string | null;
};

export type ValidationIssue = { field: "quantity" | "price" | "counterparty" | "instrument" | "market" | "resources" | "limit"; message: string };

/** Checks a proposal from the proposer's side. The counterparty's resources are verified at acceptance. */
export function validateProposal(state: EventState, input: ProposalInput, now: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { rules } = state.event;
  const proposer = state.teams.find((t) => t.id === input.proposerTeamId);
  const counterparty = state.teams.find((t) => t.id === input.counterpartyTeamId);
  const instrument = state.instruments.find((i) => i.id === input.instrumentId);

  if (!proposer) issues.push({ field: "market", message: "Your team was not found." });
  if (!counterparty || counterparty.id === input.proposerTeamId) {
    issues.push({ field: "counterparty", message: "Choose another team as the counterparty." });
  } else if (counterparty.status !== "ACTIVE") {
    issues.push({ field: "counterparty", message: `${counterparty.name} is disabled.` });
  }
  if (!instrument) issues.push({ field: "instrument", message: "Choose a stock." });

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    issues.push({ field: "quantity", message: "Quantity must be a whole number of shares greater than zero." });
  }
  if (!Number.isInteger(input.price) || input.price <= 0 || input.price % rules.tickSize !== 0) {
    issues.push({ field: "price", message: `Price must be a positive multiple of ₹${(rules.tickSize / 100).toFixed(2)}.` });
  }

  if (proposer && instrument) {
    const gate = checkTradingGate({ event: state.event, round: currentRound(state), teams: [proposer], instrument, now });
    if (!gate.ok) issues.push({ field: "market", message: gate.message });

    const reference = state.prices[instrument.id].price;
    if (input.price > 0 && !isWithinBand(input.price, reference, rules.priceBandPct, rules.tickSize)) {
      const band = priceBand(reference, rules.priceBandPct, rules.tickSize);
      issues.push({
        field: "price",
        message: `Price must be within ±${rules.priceBandPct}% of the ₹${formatPrice(reference)} reference (₹${formatPrice(band.min)} – ₹${formatPrice(band.max)}).`,
      });
    }

    if (Number.isInteger(input.quantity) && input.quantity > 0) {
      if (input.side === "SELL") {
        const held = teamShares(state, proposer.id, instrument.id);
        if (held < input.quantity) {
          issues.push({ field: "resources", message: `You hold ${held} ${instrument.symbol}; no short selling.` });
        }
      } else if (teamCash(state, proposer.id) < tradeValue(input.price, input.quantity)) {
        issues.push({ field: "resources", message: `Not enough cash: ${formatINR(teamCash(state, proposer.id))} available.` });
      }
    }
  }

  const open = state.proposals.filter((p) => p.proposerTeamId === input.proposerTeamId && p.status === "PROPOSED").length;
  if (open >= rules.maxOpenOutgoingProposals) {
    issues.push({ field: "limit", message: `You already have ${open} open proposals (limit ${rules.maxOpenOutgoingProposals}).` });
  }
  return issues;
}

export function proposeTrade(state: EventState, ctx: OpContext, input: ProposalInput): OpResult<TradeProposal> {
  const duplicate = state.proposals.find(
    (p) => p.proposerTeamId === input.proposerTeamId && p.idempotencyKey === input.idempotencyKey,
  );
  if (duplicate) return ok(duplicate);

  const issues = validateProposal(state, input, ctx.now);
  if (issues.length > 0) return fail("INVALID_PROPOSAL", issues[0].message);

  const instrument = state.instruments.find((i) => i.id === input.instrumentId)!;
  const proposal: TradeProposal = {
    id: nextId(state, "PRP", 1000),
    roundId: state.event.currentRoundId,
    idempotencyKey: input.idempotencyKey,
    proposerTeamId: input.proposerTeamId,
    counterpartyTeamId: input.counterpartyTeamId,
    side: input.side,
    instrumentId: input.instrumentId,
    quantity: input.quantity,
    price: input.price,
    referencePriceAtProposal: state.prices[input.instrumentId].price,
    createdAt: ctx.now,
    expiresAt: ctx.now + state.event.rules.proposalExpirySeconds * 1000,
    status: "PROPOSED",
    history: [{ status: "PROPOSED", at: ctx.now, note: null }],
    tradeId: null,
    failureReason: null,
    rejectionReason: null,
    counterOfProposalId: input.counterOfProposalId ?? null,
  };
  state.proposals.push(proposal);

  const names = teamNames(state);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_PROPOSED",
    teamId: input.proposerTeamId,
    summary: `${names(input.proposerTeamId)} proposed to ${input.side === "BUY" ? "buy" : "sell"} ${input.quantity} ${instrument.symbol} @ ₹${formatPrice(input.price)} ${input.side === "BUY" ? "from" : "to"} ${names(input.counterpartyTeamId)}`,
    after: { status: "PROPOSED", quantity: input.quantity, price: input.price, value: tradeValue(input.price, input.quantity) },
    refs: {
      proposalId: proposal.id,
      instrumentId: instrument.id,
      counterpartyTeamId: input.counterpartyTeamId,
      ...(input.counterOfProposalId ? { counterOfProposalId: input.counterOfProposalId } : {}),
    },
  });
  return ok(proposal);
}

function teamNames(state: EventState) {
  return (teamId: string) => state.teams.find((t) => t.id === teamId)?.name ?? teamId;
}

function transition(proposal: TradeProposal, status: ProposalStatus, at: number, note: string | null = null) {
  proposal.status = status;
  proposal.history.push({ status, at, note });
}

function markFailed(state: EventState, ctx: OpContext, proposal: TradeProposal, reason: string) {
  transition(proposal, "FAILED", ctx.now, reason);
  proposal.failureReason = reason;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_FAILED",
    teamId: proposal.counterpartyTeamId,
    summary: `Proposal ${proposal.id} failed at settlement`,
    reason,
    refs: { proposalId: proposal.id },
  });
}

export type AcceptOutcome =
  | { kind: "SETTLED"; trade: Trade; alreadySettled: boolean }
  | { kind: "PENDING_APPROVAL"; proposal: TradeProposal };

export function expireIfDue(state: EventState, ctx: OpContext, proposal: TradeProposal): boolean {
  if (proposal.status !== "PROPOSED" || ctx.now < proposal.expiresAt) return false;
  transition(proposal, "EXPIRED", ctx.now, "Expired without a response");
  appendAudit(state, {
    at: ctx.now,
    actor: { type: "SYSTEM", name: "Proposal expiry" },
    type: "TRADE_EXPIRED",
    teamId: proposal.proposerTeamId,
    summary: `Proposal ${proposal.id} expired`,
    refs: { proposalId: proposal.id },
  });
  return true;
}

export function expireDueProposals(state: EventState, ctx: OpContext): number {
  return state.proposals.filter((p) => expireIfDue(state, ctx, p)).length;
}

/** Re-validates everything against the latest state and settles atomically, or marks FAILED. */
function settle(state: EventState, ctx: OpContext, proposal: TradeProposal): OpResult<Trade> {
  const existing = state.trades.find((t) => t.proposalId === proposal.id);
  if (existing) return ok(existing);

  const { buyerTeamId, sellerTeamId } = buyerAndSeller(proposal);
  const buyer = state.teams.find((t) => t.id === buyerTeamId);
  const seller = state.teams.find((t) => t.id === sellerTeamId);
  const instrument = state.instruments.find((i) => i.id === proposal.instrumentId);
  const { rules } = state.event;

  const failWith = (reason: string) => {
    markFailed(state, ctx, proposal, reason);
    return fail("SETTLEMENT_FAILED", reason, true);
  };

  if (!buyer || !seller || !instrument) return failWith("A team or stock in this proposal no longer exists.");
  const gate = checkTradingGate({ event: state.event, round: currentRound(state), teams: [buyer, seller], instrument, now: ctx.now });
  if (!gate.ok) return failWith(gate.message);

  const reference = state.prices[instrument.id].price;
  if (!isWithinBand(proposal.price, reference, rules.priceBandPct, rules.tickSize)) {
    const band = priceBand(reference, rules.priceBandPct, rules.tickSize);
    return failWith(
      `The reference price moved to ₹${formatPrice(reference)}; ₹${formatPrice(proposal.price)} is outside the allowed ₹${formatPrice(band.min)} – ₹${formatPrice(band.max)}.`,
    );
  }

  const value = tradeValue(proposal.price, proposal.quantity);
  const sellerShares = teamShares(state, seller.id, instrument.id);
  if (sellerShares < proposal.quantity) {
    return failWith(`${seller.name} holds only ${sellerShares} ${instrument.symbol} but the trade needs ${proposal.quantity}.`);
  }
  const buyerCash = teamCash(state, buyer.id);
  if (buyerCash < value) {
    return failWith(`${buyer.name} has ${formatINR(buyerCash)} but the trade needs ${formatINR(value)}.`);
  }

  const tradeId = nextId(state, "TRD", 7000);
  let journalId: string;
  try {
    journalId = postJournal(
      state,
      {
        type: "TRADE",
        referenceId: tradeId,
        memo: `${proposal.quantity} ${instrument.symbol} @ ₹${formatPrice(proposal.price)}`,
        postings: [
          { account: teamAccount(buyer.id), asset: CASH, amount: -value },
          { account: teamAccount(seller.id), asset: CASH, amount: value },
          { account: teamAccount(seller.id), asset: instrumentAsset(instrument.id), amount: -proposal.quantity },
          { account: teamAccount(buyer.id), asset: instrumentAsset(instrument.id), amount: proposal.quantity },
        ],
      },
      { at: ctx.now, actor: ctx.actor },
    ).id;
  } catch (error) {
    if (error instanceof LedgerError) return failWith(error.message);
    throw error;
  }

  applySellToBasis(state, seller.id, instrument.id, proposal.quantity, sellerShares, value);
  applyBuyToBasis(state, buyer.id, instrument.id, value);

  const trade: Trade = {
    id: tradeId,
    roundId: state.event.currentRoundId,
    proposalId: proposal.id,
    instrumentId: instrument.id,
    buyerTeamId: buyer.id,
    sellerTeamId: seller.id,
    quantity: proposal.quantity,
    price: proposal.price,
    value,
    settledAt: ctx.now,
    journalId,
  };
  state.trades.push(trade);
  proposal.tradeId = trade.id;
  transition(proposal, "SETTLED", ctx.now);

  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_SETTLED",
    teamId: buyer.id,
    summary: `${seller.name} sold ${proposal.quantity} ${instrument.symbol} to ${buyer.name} @ ₹${formatPrice(proposal.price)}`,
    before: {
      buyerCash,
      sellerCash: teamCash(state, seller.id) - value,
      buyerShares: teamShares(state, buyer.id, instrument.id) - proposal.quantity,
      sellerShares,
    },
    after: {
      buyerCash: teamCash(state, buyer.id),
      sellerCash: teamCash(state, seller.id),
      buyerShares: teamShares(state, buyer.id, instrument.id),
      sellerShares: teamShares(state, seller.id, instrument.id),
    },
    refs: { proposalId: proposal.id, tradeId: trade.id, journalId, sellerTeamId: seller.id },
  });
  recordValuation(state, ctx.now);
  return ok(trade);
}

/**
 * Counterparty accepts. Idempotent: a repeated accept on a settled proposal returns the same trade,
 * and a proposal can never produce a second trade.
 */
export function acceptProposal(
  state: EventState,
  ctx: OpContext,
  input: { proposalId: string; teamId: string },
): OpResult<AcceptOutcome> {
  const proposal = state.proposals.find((p) => p.id === input.proposalId);
  if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
  if (proposal.counterpartyTeamId !== input.teamId) return fail("FORBIDDEN", "Only the counterparty can accept this proposal.");

  if (proposal.status === "SETTLED") {
    const trade = state.trades.find((t) => t.id === proposal.tradeId);
    if (trade) return ok({ kind: "SETTLED", trade, alreadySettled: true });
  }
  if (proposal.status === "PENDING_APPROVAL") return ok({ kind: "PENDING_APPROVAL", proposal });
  if (expireIfDue(state, ctx, proposal)) return fail("EXPIRED", "This proposal has expired.", true);
  if (proposal.status !== "PROPOSED") {
    return fail("NOT_OPEN", `This proposal is already ${proposal.status.toLowerCase().replace(/_/g, " ")}.`);
  }

  const market = checkMarketOpen(state.event, currentRound(state), ctx.now);
  if (!market.ok) return fail(market.code, market.message);

  transition(proposal, "ACCEPTED", ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_ACCEPTED",
    teamId: input.teamId,
    summary: `${teamNames(state)(input.teamId)} accepted proposal ${proposal.id}`,
    refs: { proposalId: proposal.id },
  });

  const { rules } = state.event;
  const value = tradeValue(proposal.price, proposal.quantity);
  if (rules.approvalEnabled && rules.approvalThreshold !== null && value >= rules.approvalThreshold) {
    transition(proposal, "PENDING_APPROVAL", ctx.now, `Trade value ${formatINR(value)} requires host approval`);
    appendAudit(state, {
      at: ctx.now,
      actor: { type: "SYSTEM", name: "Approval rules" },
      type: "TRADE_APPROVAL_REQUESTED",
      teamId: proposal.proposerTeamId,
      summary: `Proposal ${proposal.id} (${formatINR(value)}) sent for host approval`,
      refs: { proposalId: proposal.id },
    });
    return ok({ kind: "PENDING_APPROVAL", proposal });
  }

  const settled = settle(state, ctx, proposal);
  if (!settled.ok) return settled;
  return ok({ kind: "SETTLED", trade: settled.value, alreadySettled: false });
}

export function rejectProposal(
  state: EventState,
  ctx: OpContext,
  input: { proposalId: string; teamId: string; reason?: string },
): OpResult<TradeProposal> {
  const proposal = state.proposals.find((p) => p.id === input.proposalId);
  if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
  if (proposal.counterpartyTeamId !== input.teamId) return fail("FORBIDDEN", "Only the counterparty can reject this proposal.");
  if (proposal.status === "REJECTED") return ok(proposal);
  if (expireIfDue(state, ctx, proposal)) return fail("EXPIRED", "This proposal has already expired.", true);
  if (proposal.status !== "PROPOSED") return fail("NOT_OPEN", "This proposal is no longer open.");

  transition(proposal, "REJECTED", ctx.now, input.reason ?? null);
  proposal.rejectionReason = input.reason ?? null;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_REJECTED",
    teamId: input.teamId,
    summary: `${teamNames(state)(input.teamId)} rejected proposal ${proposal.id}`,
    reason: input.reason ?? null,
    refs: { proposalId: proposal.id },
  });
  return ok(proposal);
}

export function cancelProposal(
  state: EventState,
  ctx: OpContext,
  input: { proposalId: string; teamId: string },
): OpResult<TradeProposal> {
  const proposal = state.proposals.find((p) => p.id === input.proposalId);
  if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
  if (proposal.proposerTeamId !== input.teamId) return fail("FORBIDDEN", "Only the proposing team can cancel.");
  if (proposal.status === "CANCELLED") return ok(proposal);
  if (proposal.status !== "PROPOSED") return fail("NOT_OPEN", "Only open proposals can be cancelled.");

  transition(proposal, "CANCELLED", ctx.now, "Cancelled by proposer");
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_CANCELLED",
    teamId: input.teamId,
    summary: `${teamNames(state)(input.teamId)} cancelled proposal ${proposal.id}`,
    refs: { proposalId: proposal.id },
  });
  return ok(proposal);
}

export function approveProposal(state: EventState, ctx: OpContext, proposalId: string): OpResult<Trade> {
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
  if (proposal.status === "SETTLED") {
    const trade = state.trades.find((t) => t.id === proposal.tradeId);
    if (trade) return ok(trade);
  }
  if (proposal.status !== "PENDING_APPROVAL") return fail("NOT_PENDING", "This proposal is not awaiting approval.");
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_APPROVED",
    summary: `Host approved proposal ${proposal.id}`,
    refs: { proposalId: proposal.id },
  });
  return settle(state, ctx, proposal);
}

export function rejectByHost(state: EventState, ctx: OpContext, proposalId: string, reason: string): OpResult<TradeProposal> {
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
  if (proposal.status !== "PENDING_APPROVAL") return fail("NOT_PENDING", "This proposal is not awaiting approval.");
  if (reason.trim().length < 5) return fail("REASON_REQUIRED", "A reason of at least 5 characters is required.");
  transition(proposal, "REJECTED_BY_HOST", ctx.now, reason);
  proposal.rejectionReason = reason;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_REJECTED_BY_HOST",
    summary: `Host rejected proposal ${proposal.id}`,
    reason,
    refs: { proposalId: proposal.id },
  });
  return ok(proposal);
}

/**
 * Counter-offer (no negotiation engine): the counterparty answers an open proposal with a new proposal on the
 * same stock, going the other way, at its own quantity and price. In one transaction the original is marked
 * REJECTED with a "Countered with …" note and the new proposal records counterOfProposalId, so history keeps
 * both records and the audit trail links them. Nothing is created unless the new proposal is valid.
 */
export function counterProposal(
  state: EventState,
  ctx: OpContext,
  input: { originalProposalId: string; teamId: string; quantity: number; price: Paise; idempotencyKey: string },
): OpResult<TradeProposal> {
  const original = state.proposals.find((p) => p.id === input.originalProposalId);
  if (!original) return fail("NOT_FOUND", "Proposal not found.");
  if (original.counterpartyTeamId !== input.teamId) return fail("FORBIDDEN", "Only the team that received this proposal can counter it.");

  const replay = state.proposals.find((p) => p.proposerTeamId === input.teamId && p.idempotencyKey === input.idempotencyKey);
  if (replay) return ok(replay);

  if (expireIfDue(state, ctx, original)) return fail("EXPIRED", "This proposal has already expired.", true);
  if (original.status !== "PROPOSED") return fail("NOT_OPEN", "This proposal is no longer open.");

  const counterInput: ProposalInput = {
    proposerTeamId: input.teamId,
    counterpartyTeamId: original.proposerTeamId,
    side: original.side === "BUY" ? "SELL" : "BUY",
    instrumentId: original.instrumentId,
    quantity: input.quantity,
    price: input.price,
    idempotencyKey: input.idempotencyKey,
    counterOfProposalId: original.id,
  };
  const issues = validateProposal(state, counterInput, ctx.now);
  if (issues.length > 0) return fail("INVALID_PROPOSAL", issues[0].message);

  const created = proposeTrade(state, ctx, counterInput);
  if (!created.ok) return created;

  const note = `Countered with ${created.value.id}`;
  transition(original, "REJECTED", ctx.now, note);
  original.rejectionReason = note;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADE_REJECTED",
    teamId: input.teamId,
    summary: `${teamNames(state)(input.teamId)} countered proposal ${original.id} with ${created.value.id}`,
    reason: note,
    refs: { proposalId: original.id, counterProposalId: created.value.id },
  });
  return created;
}
