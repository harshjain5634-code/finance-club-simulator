import { appendAudit } from "./audit";
import { createStandingMark, computeLeaderboard } from "./leaderboard";
import { formatPrice } from "./money";
import { recordValuation } from "./portfolio";
import { recordPriceChange } from "./prices";
import { currentRound, roundRemainingMs } from "./trading-gate";
import type { EventState, OpContext, OpResult, Round } from "./types";
import { fail, ok } from "./types";

export type ReadinessItem = { id: string; label: string; done: boolean; detail: string };

export function readiness(state: EventState): ReadinessItem[] {
  const activeTeams = state.teams.filter((t) => t.status === "ACTIVE").length;
  const enabled = state.instruments.filter((i) => i.enabled).length;
  const tradingRounds = state.rounds.filter((r) => r.type === "TRADING").length;
  const readyNews = state.news.filter((n) => n.status === "READY").length;
  return [
    { id: "teams", label: "Teams created", done: activeTeams >= 2, detail: `${activeTeams} active teams` },
    { id: "instruments", label: "Stocks enabled", done: enabled >= 1, detail: `${enabled} of ${state.instruments.length} enabled` },
    { id: "rounds", label: "Rounds configured", done: tradingRounds >= 1, detail: `${state.rounds.length} rounds, ${tradingRounds} trading` },
    {
      id: "allocations",
      label: "Allocations applied",
      done: state.event.allocationsApplied,
      detail: state.event.allocationsApplied ? "Starting portfolios posted to the ledger" : "Not applied yet",
    },
    { id: "news", label: "News prepared", done: readyNews >= 1, detail: `${readyNews} ready to release` },
    { id: "projector", label: "Projector configured", done: state.event.projector.scenes.some((s) => s.enabled), detail: "Scenes enabled" },
  ];
}

const hostOnlyReady = (items: ReadinessItem[]) => items.filter((i) => i.id !== "news" && i.id !== "projector");

export function startEvent(state: EventState, ctx: OpContext): OpResult {
  const { event } = state;
  if (event.status === "LIVE" || event.status === "PAUSED") return fail("ALREADY_STARTED", "The event is already running.");
  if (event.status === "COMPLETED") return fail("COMPLETED", "This event has ended.");
  const missing = hostOnlyReady(readiness(state)).filter((i) => !i.done);
  if (missing.length > 0) return fail("NOT_READY", `Finish setup first: ${missing.map((m) => m.label.toLowerCase()).join(", ")}.`);

  event.status = "LIVE";
  event.startedAt = ctx.now;
  for (const instrument of state.instruments) {
    const snapshot = state.prices[instrument.id];
    state.prices[instrument.id] = { ...snapshot, eventOpenPrice: snapshot.price, roundOpenPrice: snapshot.price };
  }
  state.eventStartMark = createStandingMark(state, ctx.now);
  recordValuation(state, ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "EVENT_STARTED",
    summary: `${event.name} started`,
    before: { status: "READY" },
    after: { status: "LIVE" },
    refs: {},
  });
  return ok();
}

function pauseRunningRound(round: Round, now: number) {
  round.remainingMsAtPause = roundRemainingMs(round, now);
  round.status = "PAUSED";
  round.pausedAt = now;
  round.endsAt = null;
}

function resumePausedRound(round: Round, now: number) {
  round.status = "RUNNING";
  round.endsAt = now + (round.remainingMsAtPause ?? 0);
  round.pausedAt = null;
  round.remainingMsAtPause = null;
}

export function pauseEvent(state: EventState, ctx: OpContext): OpResult {
  if (state.event.status !== "LIVE") return fail("NOT_LIVE", "Only a live event can be paused.");
  const round = currentRound(state);
  const pausedRound = round?.status === "RUNNING";
  if (round && pausedRound) pauseRunningRound(round, ctx.now);
  state.event.status = "PAUSED";
  state.event.pausedAt = ctx.now;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "EVENT_PAUSED",
    summary: pausedRound ? `Event paused (round ${round!.number} timer held)` : "Event paused",
    before: { status: "LIVE" },
    after: { status: "PAUSED" },
    refs: { pausedRound: String(pausedRound) },
  });
  return ok();
}

export function resumeEvent(state: EventState, ctx: OpContext): OpResult {
  if (state.event.status !== "PAUSED") return fail("NOT_PAUSED", "The event is not paused.");
  const round = currentRound(state);
  // Only resume a round that the event pause itself held (both paused at the same instant).
  if (round && round.status === "PAUSED" && round.pausedAt === state.event.pausedAt) resumePausedRound(round, ctx.now);
  state.event.status = "LIVE";
  state.event.pausedAt = null;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "EVENT_RESUMED",
    summary: "Event resumed",
    before: { status: "PAUSED" },
    after: { status: "LIVE" },
    refs: {},
  });
  return ok();
}

export function endEvent(state: EventState, ctx: OpContext, reason: string): OpResult {
  if (state.event.status === "COMPLETED") return ok();
  if (state.event.status !== "LIVE" && state.event.status !== "PAUSED") return fail("NOT_LIVE", "Only a started event can be ended.");
  if (reason.trim().length < 5) return fail("REASON_REQUIRED", "A reason of at least 5 characters is required.");
  const round = currentRound(state);
  if (round && (round.status === "RUNNING" || round.status === "PAUSED")) {
    round.status = "ENDED";
    round.endedAt = ctx.now;
    round.endsAt = null;
  }
  for (const proposal of state.proposals) {
    if (proposal.status === "PROPOSED" || proposal.status === "PENDING_APPROVAL") {
      proposal.status = "CANCELLED";
      proposal.failureReason = "Event ended before settlement.";
      proposal.history.push({ status: "CANCELLED", at: ctx.now, note: "Event ended" });
    }
  }
  state.event.status = "COMPLETED";
  state.event.endedAt = ctx.now;
  state.event.tradingFrozen = false;
  const standings = computeLeaderboard(state);
  recordValuation(state, ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "EVENT_ENDED",
    summary: `${state.event.name} ended · winner ${standings[0]?.teamName ?? "—"}`,
    reason,
    after: { finalStandings: standings.slice(0, 10).map((s) => ({ rank: s.rank, team: s.teamName, returnPct: Number(s.returnPct.toFixed(4)), netWorth: s.netWorth })) },
    refs: {},
  });
  return ok();
}

export function nextPendingRound(state: EventState): Round | null {
  return [...state.rounds].sort((a, b) => a.number - b.number).find((r) => r.status === "PENDING") ?? null;
}

export function startRound(state: EventState, ctx: OpContext): OpResult<Round> {
  if (state.event.status !== "LIVE") return fail("NOT_LIVE", "Start the event (or resume it) before starting a round.");
  const active = currentRound(state);
  if (active && (active.status === "RUNNING" || active.status === "PAUSED")) {
    return fail("ROUND_ACTIVE", `Round ${active.number} is still in progress.`);
  }
  const round = nextPendingRound(state);
  if (!round) return fail("NO_ROUNDS", "There are no more rounds to start.");

  round.status = "RUNNING";
  round.startedAt = ctx.now;
  round.endsAt = ctx.now + round.durationSeconds * 1000;
  state.event.currentRoundId = round.id;
  for (const instrument of state.instruments) {
    const snapshot = state.prices[instrument.id];
    state.prices[instrument.id] = { ...snapshot, roundOpenPrice: snapshot.price };
  }
  state.roundMarks[round.id] = createStandingMark(state, ctx.now);
  recordValuation(state, ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "ROUND_STARTED",
    roundId: round.id,
    summary: `Round ${round.number} · ${round.name} started (${Math.round(round.durationSeconds / 60)} min, ${round.type === "BRIEFING" ? "trading closed" : "trading open"})`,
    after: { status: "RUNNING", endsAt: round.endsAt },
    refs: { roundId: round.id },
  });
  return ok(round);
}

export function pauseRound(state: EventState, ctx: OpContext): OpResult<Round> {
  const round = currentRound(state);
  if (!round || round.status !== "RUNNING") return fail("NOT_RUNNING", "No round is running.");
  pauseRunningRound(round, ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "ROUND_PAUSED",
    roundId: round.id,
    summary: `Round ${round.number} paused with ${Math.ceil((round.remainingMsAtPause ?? 0) / 1000)}s left`,
    refs: { roundId: round.id },
  });
  return ok(round);
}

export function resumeRound(state: EventState, ctx: OpContext): OpResult<Round> {
  if (state.event.status !== "LIVE") return fail("NOT_LIVE", "Resume the event first.");
  const round = currentRound(state);
  if (!round || round.status !== "PAUSED") return fail("NOT_PAUSED", "No round is paused.");
  resumePausedRound(round, ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "ROUND_RESUMED",
    roundId: round.id,
    summary: `Round ${round.number} resumed`,
    refs: { roundId: round.id },
  });
  return ok(round);
}

export function endRound(state: EventState, ctx: OpContext, options: { automatic?: boolean } = {}): OpResult<Round> {
  const round = currentRound(state);
  if (!round || (round.status !== "RUNNING" && round.status !== "PAUSED")) return fail("NOT_ACTIVE", "No round is in progress.");
  round.status = "ENDED";
  round.endedAt = ctx.now;
  round.endsAt = null;
  round.remainingMsAtPause = null;
  recordValuation(state, ctx.now);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "ROUND_ENDED",
    roundId: round.id,
    summary: `Round ${round.number} · ${round.name} ended${options.automatic ? " (timer expired)" : ""}`,
    refs: { roundId: round.id },
  });
  return ok(round);
}

/** Ends the current round if needed, then starts the next pending one. */
export function nextRound(state: EventState, ctx: OpContext): OpResult<Round> {
  const round = currentRound(state);
  if (round && (round.status === "RUNNING" || round.status === "PAUSED")) {
    const ended = endRound(state, ctx);
    if (!ended.ok) return ended;
  }
  return startRound(state, ctx);
}

/** Stand-in for the Phase 4 worker: ends a running round whose timer has reached zero. */
export function endRoundIfExpired(state: EventState, ctx: OpContext): boolean {
  const round = currentRound(state);
  if (!round || round.status !== "RUNNING" || round.endsAt === null || ctx.now < round.endsAt) return false;
  return endRound(state, { ...ctx, actor: { type: "SYSTEM", name: "Round timer" } }, { automatic: true }).ok;
}

export function freezeTrading(state: EventState, ctx: OpContext, note: string | null): OpResult {
  if (state.event.tradingFrozen) return ok();
  if (state.event.status !== "LIVE" && state.event.status !== "PAUSED") return fail("NOT_LIVE", "Trading can only be frozen during a live event.");
  state.event.tradingFrozen = true;
  state.event.tradingFrozenAt = ctx.now;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADING_FROZEN",
    summary: "Trading frozen for all teams",
    reason: note,
    before: { tradingFrozen: false },
    after: { tradingFrozen: true },
    refs: {},
  });
  return ok();
}

export function unfreezeTrading(state: EventState, ctx: OpContext): OpResult {
  if (!state.event.tradingFrozen) return ok();
  state.event.tradingFrozen = false;
  state.event.tradingFrozenAt = null;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TRADING_UNFROZEN",
    summary: "Trading unfrozen",
    before: { tradingFrozen: true },
    after: { tradingFrozen: false },
    refs: {},
  });
  return ok();
}

export function haltInstrument(state: EventState, ctx: OpContext, instrumentId: string, halted: boolean): OpResult {
  const instrument = state.instruments.find((i) => i.id === instrumentId);
  if (!instrument) return fail("NOT_FOUND", "Stock not found.");
  if (instrument.halted === halted) return ok();
  instrument.halted = halted;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: halted ? "INSTRUMENT_HALTED" : "INSTRUMENT_RESUMED",
    summary: `${instrument.symbol} ${halted ? "halted" : "resumed"}`,
    before: { halted: !halted },
    after: { halted },
    refs: { instrumentId },
  });
  return ok();
}

type ManualPriceInput =
  | { instrumentId: string; mode: "SET"; targetPrice: number; reason: string; adjustmentId: string }
  | { instrumentId: string; mode: "PERCENT"; pct: number; reason: string; adjustmentId: string };

export function manualPriceChange(state: EventState, ctx: OpContext, input: ManualPriceInput) {
  const instrument = state.instruments.find((i) => i.id === input.instrumentId);
  if (!instrument) return fail("NOT_FOUND", "Stock not found.");
  if (input.reason.trim().length < 5) return fail("REASON_REQUIRED", "A reason of at least 5 characters is required.");
  const current = state.prices[instrument.id].price;
  const proposed = input.mode === "SET" ? input.targetPrice : current * (1 + input.pct / 100);
  if (!(proposed > 0)) return fail("INVALID_PRICE", "The resulting price must be above zero.");
  const event = recordPriceChange(state, {
    instrumentId: instrument.id,
    proposedPrice: proposed,
    source: "MANUAL",
    configuredImpact: input.mode === "SET" ? { kind: "MANUAL_SET", targetPrice: input.targetPrice } : { kind: "MANUAL_PERCENT", pct: input.pct },
    resolvedImpactPct: input.mode === "SET" ? Number((((input.targetPrice - current) / current) * 100).toFixed(2)) : input.pct,
    manualAdjustmentId: input.adjustmentId,
    reason: input.reason,
    actor: ctx.actor,
    now: ctx.now,
  });
  recordValuation(state, ctx.now);
  return ok({ event, summary: `${instrument.symbol} ₹${formatPrice(event.previousPrice)} → ₹${formatPrice(event.newPrice)}` });
}
