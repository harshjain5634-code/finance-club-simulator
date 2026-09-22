import { describe, expect, it } from "vitest";
import { rupees } from "../money";
import { DEFAULT_HIGH_VALUE_THRESHOLD, highValueThreshold, monitorProposal } from "../monitoring";
import * as p2p from "../p2p";
import { ALPHA, BETA, ctx, expectOk, liveTradingEvent, NOVA, T0, team } from "./helpers";

describe("Host monitoring flags", () => {
  it("defaults the high-value threshold to ₹50,000 and honours a configured value", () => {
    const state = liveTradingEvent();
    expect(highValueThreshold(state.event)).toBe(DEFAULT_HIGH_VALUE_THRESHOLD);
    expect(DEFAULT_HIGH_VALUE_THRESHOLD).toBe(rupees(50_000));
    state.event.rules.highValueThreshold = rupees(10_000);
    expect(highValueThreshold(state.event)).toBe(rupees(10_000));
    state.event.rules.highValueThreshold = 0;
    expect(highValueThreshold(state.event)).toBe(DEFAULT_HIGH_VALUE_THRESHOLD);
  });

  it("flags value at or above the threshold and prices ≥5% from the last price", () => {
    const state = liveTradingEvent();
    const last = state.prices[NOVA].price;
    const atThreshold = monitorProposal(state, { instrumentId: NOVA, price: last, quantity: Math.ceil(DEFAULT_HIGH_VALUE_THRESHOLD / last) });
    expect(atThreshold.flags).toContain("HIGH_VALUE");
    expect(atThreshold.flags).not.toContain("FAR_FROM_MARKET");

    const small = monitorProposal(state, { instrumentId: NOVA, price: last, quantity: 1 });
    expect(small.flags).toEqual([]);
    expect(small.vsLastPct).toBe(0);

    const far = monitorProposal(state, { instrumentId: NOVA, price: Math.round(last * 1.05), quantity: 1 });
    expect(far.flags).toEqual(["FAR_FROM_MARKET"]);
  });

  it("is monitoring only: a flagged proposal still settles without any approval step", () => {
    const state = liveTradingEvent();
    expect(state.event.rules.approvalEnabled).toBe(false);
    const last = state.prices[NOVA].price;
    const quantity = Math.ceil(DEFAULT_HIGH_VALUE_THRESHOLD / last);
    const proposal = expectOk(
      p2p.proposeTrade(state, ctx(T0 + 1000, team(ALPHA)), { proposerTeamId: ALPHA, counterpartyTeamId: BETA, side: "SELL", instrumentId: NOVA, quantity, price: last, idempotencyKey: "hv-1" }),
    );
    expect(monitorProposal(state, proposal).flags).toContain("HIGH_VALUE");
    const outcome = expectOk(p2p.acceptProposal(state, ctx(T0 + 2000, team(BETA)), { proposalId: proposal.id, teamId: BETA }));
    expect(outcome.kind).toBe("SETTLED");
  });
});

describe("Monitoring history", () => {
  it("judges finished proposals against the price when proposed, not today's price", () => {
    const state = liveTradingEvent();
    const ref = state.prices[NOVA].price;
    const settled = { instrumentId: NOVA, price: ref, quantity: 1, status: "SETTLED" as const, referencePriceAtProposal: ref };
    state.prices[NOVA].price = Math.round(ref * 1.2);
    expect(monitorProposal(state, settled).flags).toEqual([]);
    expect(monitorProposal(state, { ...settled, status: "PENDING_APPROVAL" }).flags).toEqual(["FAR_FROM_MARKET"]);
  });
});
