import type { EventState, Instrument, MarketState, Round, SimEvent, Team } from "./types";

export type GateCode =
  | "EVENT_NOT_STARTED"
  | "EVENT_PAUSED"
  | "EVENT_COMPLETED"
  | "NO_ACTIVE_ROUND"
  | "BRIEFING_ROUND"
  | "ROUND_PAUSED"
  | "ROUND_TIME_UP"
  | "TRADING_FROZEN"
  | "TEAM_DISABLED"
  | "INSTRUMENT_DISABLED"
  | "INSTRUMENT_HALTED"
  | "INSTRUMENT_NOT_TRADABLE";

export type GateResult = { ok: true } | { ok: false; code: GateCode; message: string };

export function currentRound(state: Pick<EventState, "event" | "rounds">): Round | null {
  if (!state.event.currentRoundId) return null;
  return state.rounds.find((r) => r.id === state.event.currentRoundId) ?? null;
}

export function roundRemainingMs(round: Round, now: number): number {
  if (round.status === "RUNNING" && round.endsAt !== null) return Math.max(0, round.endsAt - now);
  if (round.status === "PAUSED" && round.remainingMsAtPause !== null) return round.remainingMsAtPause;
  if (round.status === "PENDING") return round.durationSeconds * 1000;
  return 0;
}

/** Event-level gate shared by every trade path: event live, round running with time left, not frozen. */
export function checkMarketOpen(event: SimEvent, round: Round | null, now: number): GateResult {
  if (event.status === "DRAFT" || event.status === "READY") {
    return { ok: false, code: "EVENT_NOT_STARTED", message: "The event has not started yet." };
  }
  if (event.status === "COMPLETED") return { ok: false, code: "EVENT_COMPLETED", message: "The event has ended." };
  if (event.status === "PAUSED") return { ok: false, code: "EVENT_PAUSED", message: "The host has paused the event." };
  if (event.tradingFrozen) return { ok: false, code: "TRADING_FROZEN", message: "Trading is frozen by the host." };
  if (!round || round.status === "PENDING" || round.status === "ENDED") {
    return { ok: false, code: "NO_ACTIVE_ROUND", message: "No trading round is running." };
  }
  if (round.status === "PAUSED") return { ok: false, code: "ROUND_PAUSED", message: "The round is paused." };
  if (round.type === "BRIEFING") {
    return { ok: false, code: "BRIEFING_ROUND", message: "Trading is closed during the market briefing." };
  }
  if (roundRemainingMs(round, now) <= 0) return { ok: false, code: "ROUND_TIME_UP", message: "The round timer has ended." };
  return { ok: true };
}

export function checkTradingGate(input: {
  event: SimEvent;
  round: Round | null;
  teams: Team[];
  instrument: Instrument | undefined;
  now: number;
}): GateResult {
  const market = checkMarketOpen(input.event, input.round, input.now);
  if (!market.ok) return market;

  for (const team of input.teams) {
    if (team.status !== "ACTIVE") {
      return { ok: false, code: "TEAM_DISABLED", message: `${team.name} is disabled by the host.` };
    }
  }

  const instrument = input.instrument;
  if (!instrument || !instrument.enabled) {
    return { ok: false, code: "INSTRUMENT_DISABLED", message: "This stock is not enabled for trading." };
  }
  if (instrument.halted) return { ok: false, code: "INSTRUMENT_HALTED", message: `${instrument.symbol} is halted.` };
  const tradable = input.round?.tradableInstrumentIds;
  if (tradable && tradable !== "ALL" && !tradable.includes(instrument.id)) {
    return { ok: false, code: "INSTRUMENT_NOT_TRADABLE", message: `${instrument.symbol} is not tradable this round.` };
  }
  return { ok: true };
}

export function deriveMarketState(event: SimEvent, round: Round | null, now: number): MarketState {
  if (event.status === "COMPLETED") return "COMPLETED";
  if (event.status === "DRAFT" || event.status === "READY") return "NOT_STARTED";
  if (event.status === "PAUSED") return "PAUSED";
  if (event.tradingFrozen) return "FROZEN";
  if (!round || round.status === "PENDING" || round.status === "ENDED") return "BETWEEN_ROUNDS";
  if (round.status === "PAUSED") return "PAUSED";
  if (roundRemainingMs(round, now) <= 0) return "BETWEEN_ROUNDS";
  return round.type === "BRIEFING" ? "BRIEFING" : "OPEN";
}

export const MARKET_STATE_LABEL: Record<MarketState, string> = {
  NOT_STARTED: "Pre-event",
  BRIEFING: "Briefing",
  OPEN: "Market open",
  PAUSED: "Paused",
  FROZEN: "Trading frozen",
  BETWEEN_ROUNDS: "Between rounds",
  COMPLETED: "Event completed",
};
