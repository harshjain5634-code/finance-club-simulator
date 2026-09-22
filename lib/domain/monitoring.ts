import { changePct, rupees, tradeValue } from "./money";
import type { EventState, Paise, SimEvent, TradeProposal } from "./types";

/**
 * Host monitoring flags (C4 trade monitor / control room). Presentation only: flags never block a trade, change
 * settlement or add an approval step. Mandatory approval stays governed by `rules.approvalEnabled`.
 */

export const DEFAULT_HIGH_VALUE_THRESHOLD: Paise = rupees(50_000);
/** A proposal priced this far from the last traded price is worth a second look. */
export const FAR_FROM_MARKET_PCT = 5;

export type TradeFlag = "HIGH_VALUE" | "FAR_FROM_MARKET";

export function highValueThreshold(event: Pick<SimEvent, "rules">): Paise {
  const configured = event.rules.highValueThreshold;
  return configured != null && configured > 0 ? configured : DEFAULT_HIGH_VALUE_THRESHOLD;
}

export type ProposalMonitor = {
  value: Paise;
  lastPrice: Paise | null;
  /** Signed % of the proposal price versus the last price at the time of evaluation. */
  vsLastPct: number | null;
  flags: TradeFlag[];
};

export function monitorProposal(state: Pick<EventState, "event" | "prices">, proposal: Pick<TradeProposal, "instrumentId" | "price" | "quantity">): ProposalMonitor {
  const value = tradeValue(proposal.price, proposal.quantity);
  const lastPrice = state.prices[proposal.instrumentId]?.price ?? null;
  const vsLastPct = lastPrice ? changePct(lastPrice, proposal.price) : null;
  const flags: TradeFlag[] = [];
  if (vsLastPct !== null && Math.abs(vsLastPct) >= FAR_FROM_MARKET_PCT - 1e-9) flags.push("FAR_FROM_MARKET");
  if (value >= highValueThreshold(state.event)) flags.push("HIGH_VALUE");
  return { value, lastPrice, vsLastPct, flags };
}
