import { appendAudit } from "./audit";
import { nextId } from "./ids";
import { ADJUSTMENTS, CASH, getBalance, instrumentAsset, LedgerError, postJournal, teamAccount, TREASURY, type PostingDraft } from "./ledger";
import { formatINR } from "./money";
import type {
  AdjustmentType,
  AllocationRow,
  EventState,
  HostAdjustment,
  OpContext,
  OpResult,
  Paise,
} from "./types";
import { fail, ok } from "./types";

export function teamCash(state: EventState, teamId: string): Paise {
  return getBalance(state.balances, teamAccount(teamId), CASH);
}

export function teamShares(state: EventState, teamId: string, instrumentId: string): number {
  return getBalance(state.balances, teamAccount(teamId), instrumentAsset(instrumentId));
}

export function holdingsValue(state: EventState, teamId: string): Paise {
  return state.instruments.reduce(
    (sum, instrument) => sum + teamShares(state, teamId, instrument.id) * (state.prices[instrument.id]?.price ?? 0),
    0,
  );
}

export function netWorth(state: EventState, teamId: string): Paise {
  return teamCash(state, teamId) + holdingsValue(state, teamId);
}

export function returnPct(value: Paise, capitalBase: Paise): number {
  if (capitalBase <= 0) return 0;
  return ((value - capitalBase) / capitalBase) * 100;
}

export type HoldingView = {
  instrumentId: string;
  quantity: number;
  averageCost: Paise;
  costBasis: Paise;
  price: Paise;
  value: Paise;
  unrealizedPnl: Paise;
  returnPct: number;
  allocationPct: number;
};

export function teamHoldings(state: EventState, teamId: string): HoldingView[] {
  const worth = netWorth(state, teamId);
  return state.instruments.flatMap((instrument) => {
    const quantity = teamShares(state, teamId, instrument.id);
    if (quantity <= 0) return [];
    const basis = state.costBasis[teamId]?.[instrument.id] ?? 0;
    const price = state.prices[instrument.id]?.price ?? 0;
    const value = quantity * price;
    return [
      {
        instrumentId: instrument.id,
        quantity,
        averageCost: basis / quantity,
        costBasis: basis,
        price,
        value,
        unrealizedPnl: value - basis,
        returnPct: basis > 0 ? ((value - basis) / basis) * 100 : 0,
        allocationPct: worth > 0 ? (value / worth) * 100 : 0,
      },
    ];
  });
}

export function unrealizedPnl(state: EventState, teamId: string): Paise {
  return teamHoldings(state, teamId).reduce((sum, h) => sum + h.unrealizedPnl, 0);
}

function setBasis(state: EventState, teamId: string, instrumentId: string, basis: Paise) {
  state.costBasis[teamId] = { ...(state.costBasis[teamId] ?? {}), [instrumentId]: Math.max(0, Math.round(basis)) };
}

/** Weighted-average cost: buys add to basis, sells release basis proportionally and realize P&L. */
export function applyBuyToBasis(state: EventState, teamId: string, instrumentId: string, cost: Paise) {
  setBasis(state, teamId, instrumentId, (state.costBasis[teamId]?.[instrumentId] ?? 0) + cost);
}

export function applySellToBasis(
  state: EventState,
  teamId: string,
  instrumentId: string,
  quantitySold: number,
  quantityBefore: number,
  proceeds: Paise,
): Paise {
  const basis = state.costBasis[teamId]?.[instrumentId] ?? 0;
  const released = quantityBefore > 0 ? Math.round((basis * quantitySold) / quantityBefore) : 0;
  setBasis(state, teamId, instrumentId, basis - released);
  const realized = proceeds - released;
  state.realizedPnl[teamId] = (state.realizedPnl[teamId] ?? 0) + realized;
  return realized;
}

export function allocationValue(state: EventState, row: AllocationRow): Paise {
  return (
    row.cash +
    Object.entries(row.shares).reduce(
      (sum, [instrumentId, qty]) =>
        sum + qty * (state.instruments.find((i) => i.id === instrumentId)?.startingPrice ?? 0),
      0,
    )
  );
}

export function allocationRowFor(state: EventState, teamId: string): AllocationRow {
  const plan = state.allocationPlan;
  const base = plan.distribution === "IDENTICAL" ? plan.identical : (plan.perTeam[teamId] ?? plan.identical);
  return {
    cash: base.cash,
    shares: plan.mode === "CASH_ONLY" ? {} : base.shares,
  };
}

export function supplyUsage(state: EventState): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const team of state.teams) {
    const row = allocationRowFor(state, team.id);
    for (const [instrumentId, qty] of Object.entries(row.shares)) usage[instrumentId] = (usage[instrumentId] ?? 0) + qty;
  }
  return usage;
}

/** Posts the ALLOCATION journal for one team: treasury → team for cash and each stock. */
export function allocateToTeam(state: EventState, ctx: OpContext, teamId: string, row: AllocationRow) {
  const account = teamAccount(teamId);
  const postings: PostingDraft[] = [
    { account: TREASURY, asset: CASH, amount: -row.cash },
    { account, asset: CASH, amount: row.cash },
  ];
  for (const [instrumentId, qty] of Object.entries(row.shares)) {
    if (qty <= 0) continue;
    postings.push({ account: TREASURY, asset: instrumentAsset(instrumentId), amount: -qty });
    postings.push({ account, asset: instrumentAsset(instrumentId), amount: qty });
    const price = state.instruments.find((i) => i.id === instrumentId)?.startingPrice ?? 0;
    applyBuyToBasis(state, teamId, instrumentId, qty * price);
  }
  const journal = postJournal(
    state,
    { type: "ALLOCATION", referenceId: `ALLOC-${teamId}`, memo: "Starting allocation", postings },
    { at: ctx.now, actor: ctx.actor },
  );
  state.capitalBase[teamId] = (state.capitalBase[teamId] ?? 0) + allocationValue(state, row);
  state.realizedPnl[teamId] = state.realizedPnl[teamId] ?? 0;
  state.allocationPlan.applied[teamId] = { cash: row.cash, shares: { ...row.shares } };
  return journal;
}

export function applyAllocations(state: EventState, ctx: OpContext): OpResult<{ journals: number }> {
  if (state.event.allocationsApplied) return fail("ALREADY_APPLIED", "Allocations have already been applied.");
  if (state.event.status !== "DRAFT" && state.event.status !== "READY") {
    return fail("EVENT_STARTED", "Allocations can only be applied before the event starts.");
  }
  if (state.teams.length === 0) return fail("NO_TEAMS", "Add teams before applying allocations.");
  const usage = supplyUsage(state);
  for (const instrument of state.instruments) {
    if ((usage[instrument.id] ?? 0) > instrument.supply) {
      return fail("SUPPLY_EXCEEDED", `${instrument.symbol} allocation exceeds available supply (${instrument.supply}).`);
    }
  }

  let journals = 0;
  for (const team of state.teams) {
    allocateToTeam(state, ctx, team.id, allocationRowFor(state, team.id));
    journals += 1;
  }
  state.event.allocationsApplied = true;
  state.allocationPlan.appliedAt = ctx.now;
  if (state.event.status === "DRAFT") state.event.status = "READY";

  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "ALLOCATION_APPLIED",
    summary: `Starting allocations applied to ${journals} teams`,
    after: {
      mode: state.allocationPlan.mode,
      distribution: state.allocationPlan.distribution,
      supplyUsed: usage,
    },
    refs: {},
  });
  recordValuation(state, ctx.now);
  return ok({ journals });
}

export const ADJUSTMENT_LABEL: Record<AdjustmentType, string> = {
  CAPITAL_CHANGE: "Capital change",
  AWARD: "Award",
  PENALTY: "Penalty",
  CORRECTION: "Correction",
};

function validateAdjustmentSign(type: AdjustmentType, amount: number): string | null {
  if (amount === 0) return "Amount cannot be zero.";
  if (type === "AWARD" && amount < 0) return "An award must add value.";
  if (type === "PENALTY" && amount > 0) return "A penalty must remove value.";
  return null;
}

type CashAdjustmentInput = { teamId: string; amount: Paise; adjustmentType: AdjustmentType; reason: string };

/**
 * Host cash adjustment. CAPITAL_CHANGE moves the capital base with the cash (return unchanged);
 * AWARD / PENALTY / CORRECTION leave the base untouched, so they flow into return.
 */
export function adjustCash(state: EventState, ctx: OpContext, input: CashAdjustmentInput): OpResult<HostAdjustment> {
  const team = state.teams.find((t) => t.id === input.teamId);
  if (!team) return fail("TEAM_NOT_FOUND", "Team not found.");
  if (input.reason.trim().length < 5) return fail("REASON_REQUIRED", "A reason of at least 5 characters is required.");
  const signError = validateAdjustmentSign(input.adjustmentType, input.amount);
  if (signError) return fail("INVALID_AMOUNT", signError);

  const before = teamCash(state, team.id);
  const adjustmentId = nextId(state, "ADJ", 3000);
  let journalId: string;
  try {
    const journal = postJournal(
      state,
      {
        type: "ADJUSTMENT",
        referenceId: adjustmentId,
        memo: `${ADJUSTMENT_LABEL[input.adjustmentType]}: cash ${formatINR(input.amount)}`,
        reason: input.reason,
        postings: [
          { account: ADJUSTMENTS, asset: CASH, amount: -input.amount },
          { account: teamAccount(team.id), asset: CASH, amount: input.amount },
        ],
      },
      { at: ctx.now, actor: ctx.actor },
    );
    journalId = journal.id;
  } catch (error) {
    if (error instanceof LedgerError && error.code === "NEGATIVE_BALANCE") {
      return fail("NEGATIVE_CASH", `This would leave ${team.name} with negative cash.`);
    }
    throw error;
  }

  if (input.adjustmentType === "CAPITAL_CHANGE") {
    state.capitalBase[team.id] = (state.capitalBase[team.id] ?? 0) + input.amount;
  }

  const adjustment: HostAdjustment = {
    id: adjustmentId,
    teamId: team.id,
    kind: "CASH",
    adjustmentType: input.adjustmentType,
    instrumentId: null,
    amount: input.amount,
    before,
    after: before + input.amount,
    valueAtAdjustment: input.amount,
    reason: input.reason,
    at: ctx.now,
    actor: ctx.actor,
    journalId,
    roundId: state.event.currentRoundId,
  };
  state.adjustments.push(adjustment);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "CASH_ADJUSTED",
    teamId: team.id,
    summary: `${ADJUSTMENT_LABEL[input.adjustmentType]} of ${formatINR(input.amount)} for ${team.name}`,
    reason: input.reason,
    before: { cash: before, capitalBase: state.capitalBase[team.id] - (input.adjustmentType === "CAPITAL_CHANGE" ? input.amount : 0) },
    after: { cash: before + input.amount, capitalBase: state.capitalBase[team.id] },
    refs: { adjustmentId, journalId },
  });
  recordValuation(state, ctx.now);
  return ok(adjustment);
}

type HoldingAdjustmentInput = {
  teamId: string;
  instrumentId: string;
  quantity: number;
  adjustmentType: AdjustmentType;
  reason: string;
};

export function adjustHolding(
  state: EventState,
  ctx: OpContext,
  input: HoldingAdjustmentInput,
): OpResult<HostAdjustment> {
  const team = state.teams.find((t) => t.id === input.teamId);
  const instrument = state.instruments.find((i) => i.id === input.instrumentId);
  if (!team || !instrument) return fail("NOT_FOUND", "Team or stock not found.");
  if (!Number.isInteger(input.quantity)) return fail("WHOLE_SHARES", "Only whole shares can be adjusted.");
  if (input.reason.trim().length < 5) return fail("REASON_REQUIRED", "A reason of at least 5 characters is required.");
  const signError = validateAdjustmentSign(input.adjustmentType, input.quantity);
  if (signError) return fail("INVALID_AMOUNT", signError);

  const before = teamShares(state, team.id, instrument.id);
  if (before + input.quantity < 0) {
    return fail("NEGATIVE_SHARES", `${team.name} holds only ${before} ${instrument.symbol}.`);
  }

  const price = state.prices[instrument.id].price;
  const value = input.quantity * price;
  const adjustmentId = nextId(state, "ADJ", 3000);
  const journal = postJournal(
    state,
    {
      type: "ADJUSTMENT",
      referenceId: adjustmentId,
      memo: `${ADJUSTMENT_LABEL[input.adjustmentType]}: ${input.quantity > 0 ? "+" : ""}${input.quantity} ${instrument.symbol}`,
      reason: input.reason,
      postings: [
        { account: ADJUSTMENTS, asset: instrumentAsset(instrument.id), amount: -input.quantity },
        { account: teamAccount(team.id), asset: instrumentAsset(instrument.id), amount: input.quantity },
      ],
    },
    { at: ctx.now, actor: ctx.actor },
  );

  if (input.quantity > 0) {
    applyBuyToBasis(state, team.id, instrument.id, value);
  } else {
    const basis = state.costBasis[team.id]?.[instrument.id] ?? 0;
    const released = before > 0 ? Math.round((basis * -input.quantity) / before) : 0;
    state.costBasis[team.id] = { ...(state.costBasis[team.id] ?? {}), [instrument.id]: basis - released };
  }
  if (input.adjustmentType === "CAPITAL_CHANGE") {
    state.capitalBase[team.id] = (state.capitalBase[team.id] ?? 0) + value;
  }

  const adjustment: HostAdjustment = {
    id: adjustmentId,
    teamId: team.id,
    kind: "HOLDING",
    adjustmentType: input.adjustmentType,
    instrumentId: instrument.id,
    amount: input.quantity,
    before,
    after: before + input.quantity,
    valueAtAdjustment: value,
    reason: input.reason,
    at: ctx.now,
    actor: ctx.actor,
    journalId: journal.id,
    roundId: state.event.currentRoundId,
  };
  state.adjustments.push(adjustment);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "HOLDING_ADJUSTED",
    teamId: team.id,
    summary: `${ADJUSTMENT_LABEL[input.adjustmentType]}: ${input.quantity > 0 ? "+" : ""}${input.quantity} ${instrument.symbol} for ${team.name}`,
    reason: input.reason,
    before: { quantity: before },
    after: { quantity: before + input.quantity, valueAtPrice: value },
    refs: { adjustmentId, journalId: journal.id, instrumentId: instrument.id },
  });
  recordValuation(state, ctx.now);
  return ok(adjustment);
}

/**
 * Restores a team to exactly what it received at allocation via a RESET journal.
 * History is preserved: nothing is deleted, the reset is just another balanced journal.
 */
export function resetTeam(state: EventState, ctx: OpContext, teamId: string, reason: string): OpResult<{ journalId: string | null }> {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return fail("TEAM_NOT_FOUND", "Team not found.");
  if (reason.trim().length < 5) return fail("REASON_REQUIRED", "A reason of at least 5 characters is required.");
  const target = state.allocationPlan.applied[teamId] ?? { cash: 0, shares: {} };
  const account = teamAccount(teamId);

  const postings: PostingDraft[] = [];
  const cashDiff = target.cash - teamCash(state, teamId);
  if (cashDiff !== 0) {
    postings.push({ account: ADJUSTMENTS, asset: CASH, amount: -cashDiff }, { account, asset: CASH, amount: cashDiff });
  }
  for (const instrument of state.instruments) {
    const diff = (target.shares[instrument.id] ?? 0) - teamShares(state, teamId, instrument.id);
    if (diff !== 0) {
      postings.push(
        { account: ADJUSTMENTS, asset: instrumentAsset(instrument.id), amount: -diff },
        { account, asset: instrumentAsset(instrument.id), amount: diff },
      );
    }
  }

  const before = { cash: teamCash(state, teamId), netWorth: netWorth(state, teamId), capitalBase: state.capitalBase[teamId] ?? 0 };
  let journalId: string | null = null;
  if (postings.length > 0) {
    journalId = postJournal(
      state,
      { type: "RESET", referenceId: `RESET-${teamId}-${ctx.now}`, memo: "Team reset to starting allocation", reason, postings },
      { at: ctx.now, actor: ctx.actor },
    ).id;
  }

  state.costBasis[teamId] = {};
  for (const [instrumentId, qty] of Object.entries(target.shares)) {
    const price = state.instruments.find((i) => i.id === instrumentId)?.startingPrice ?? 0;
    if (qty > 0) setBasis(state, teamId, instrumentId, qty * price);
  }
  state.realizedPnl[teamId] = 0;
  state.capitalBase[teamId] = allocationValue(state, target);

  for (const proposal of state.proposals) {
    const involved = proposal.proposerTeamId === teamId || proposal.counterpartyTeamId === teamId;
    if (involved && (proposal.status === "PROPOSED" || proposal.status === "PENDING_APPROVAL")) {
      proposal.status = "CANCELLED";
      proposal.failureReason = "Cancelled because a team was reset by the host.";
      proposal.history.push({ status: "CANCELLED", at: ctx.now, note: "Team reset" });
    }
  }

  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TEAM_RESET",
    teamId,
    summary: `${team.name} reset to starting allocation`,
    reason,
    before,
    after: { cash: target.cash, netWorth: netWorth(state, teamId), capitalBase: state.capitalBase[teamId] },
    refs: journalId ? { journalId } : {},
  });
  recordValuation(state, ctx.now);
  return ok({ journalId });
}

const MAX_VALUATIONS = 720;

/** Net-worth snapshot for charts; taken after every material change. */
export function recordValuation(state: EventState, now: number) {
  const snapshot = {
    t: now,
    netWorth: Object.fromEntries(state.teams.map((team) => [team.id, netWorth(state, team.id)])),
  };
  const last = state.valuations[state.valuations.length - 1];
  if (last && now - last.t < 250) state.valuations[state.valuations.length - 1] = snapshot;
  else state.valuations.push(snapshot);
  if (state.valuations.length > MAX_VALUATIONS) state.valuations.splice(0, state.valuations.length - MAX_VALUATIONS);
}
