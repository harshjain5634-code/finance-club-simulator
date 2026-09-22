import { describe, expect, it } from "vitest";
import { isBalanced, reconcile } from "../ledger";
import { rupees } from "../money";
import * as p2p from "../p2p";
import { adjustCash, adjustHolding, teamCash, teamShares } from "../portfolio";
import { ALPHA, BETA, ctx, expectOk, liveTradingEvent, NOVA, T0, team } from "./helpers";

const NOW = T0 + 5000;

function propose(state: ReturnType<typeof liveTradingEvent>, overrides: Partial<p2p.ProposalInput> = {}) {
  return p2p.proposeTrade(state, ctx(NOW, team(ALPHA)), {
    proposerTeamId: ALPHA,
    counterpartyTeamId: BETA,
    side: "SELL",
    instrumentId: NOVA,
    quantity: 20,
    price: rupees(525),
    idempotencyKey: `key-${Math.random()}`,
    ...overrides,
  });
}

describe("P2P settlement", () => {
  it("settles Alpha selling 20 NOVA @ ₹525 to Beta with one trade, one balanced journal and audit rows", () => {
    const state = liveTradingEvent();
    const alphaCash = teamCash(state, ALPHA);
    const betaCash = teamCash(state, BETA);

    const proposal = expectOk(propose(state));
    expect(proposal.status).toBe("PROPOSED");

    const outcome = expectOk(p2p.acceptProposal(state, ctx(NOW + 1000, team(BETA)), { proposalId: proposal.id, teamId: BETA }));
    expect(outcome.kind).toBe("SETTLED");

    expect(teamShares(state, ALPHA, NOVA)).toBe(180);
    expect(teamShares(state, BETA, NOVA)).toBe(220);
    expect(teamCash(state, ALPHA)).toBe(alphaCash + rupees(10500));
    expect(teamCash(state, BETA)).toBe(betaCash - rupees(10500));

    expect(state.trades).toHaveLength(1);
    const trade = state.trades[0];
    expect(trade).toMatchObject({ buyerTeamId: BETA, sellerTeamId: ALPHA, quantity: 20, price: rupees(525), value: rupees(10500) });

    const journal = state.journals.find((j) => j.id === trade.journalId)!;
    expect(journal.type).toBe("TRADE");
    expect(journal.postings).toHaveLength(4);
    expect(isBalanced(journal.postings)).toBe(true);

    expect(state.proposals[0].status).toBe("SETTLED");
    expect(state.proposals[0].history.map((h) => h.status)).toEqual(["PROPOSED", "ACCEPTED", "SETTLED"]);
    expect(state.audit.map((a) => a.type)).toEqual(expect.arrayContaining(["TRADE_PROPOSED", "TRADE_ACCEPTED", "TRADE_SETTLED"]));
    expect(reconcile(state, NOW).passed).toBe(true);
  });

  it("does not change the reference price", () => {
    const state = liveTradingEvent();
    const before = state.prices[NOVA].price;
    const proposal = expectOk(propose(state, { price: rupees(545) }));
    expectOk(p2p.acceptProposal(state, ctx(NOW, team(BETA)), { proposalId: proposal.id, teamId: BETA }));
    expect(state.prices[NOVA].price).toBe(before);
  });

  it("double accept produces exactly one trade", () => {
    const state = liveTradingEvent();
    const proposal = expectOk(propose(state));
    const first = expectOk(p2p.acceptProposal(state, ctx(NOW, team(BETA)), { proposalId: proposal.id, teamId: BETA }));
    const cashAfterFirst = teamCash(state, BETA);
    const second = expectOk(p2p.acceptProposal(state, ctx(NOW + 10, team(BETA)), { proposalId: proposal.id, teamId: BETA }));

    expect(first.kind).toBe("SETTLED");
    expect(second.kind === "SETTLED" && second.alreadySettled).toBe(true);
    expect(state.trades).toHaveLength(1);
    expect(state.journals.filter((j) => j.type === "TRADE")).toHaveLength(1);
    expect(teamCash(state, BETA)).toBe(cashAfterFirst);
  });

  it("the same idempotency key never creates a second proposal", () => {
    const state = liveTradingEvent();
    const a = expectOk(propose(state, { idempotencyKey: "same" }));
    const b = expectOk(propose(state, { idempotencyKey: "same" }));
    expect(a.id).toBe(b.id);
    expect(state.proposals).toHaveLength(1);
  });

  it("rejects negative cash: FAILED when the buyer can no longer pay at acceptance", () => {
    const state = liveTradingEvent();
    const proposal = expectOk(propose(state, { quantity: 100, price: rupees(540) }));
    expectOk(adjustCash(state, ctx(NOW), { teamId: BETA, amount: -(teamCash(state, BETA) - rupees(1000)), adjustmentType: "PENALTY", reason: "Test penalty" }));

    const result = p2p.acceptProposal(state, ctx(NOW + 1000, team(BETA)), { proposalId: proposal.id, teamId: BETA });
    expect(result.ok).toBe(false);
    expect(state.proposals[0].status).toBe("FAILED");
    expect(state.proposals[0].failureReason).toMatch(/has ₹1,000.00 but the trade needs/);
    expect(teamCash(state, BETA)).toBe(rupees(1000));
    expect(state.trades).toHaveLength(0);
  });

  it("rejects a buy proposal the proposer cannot afford", () => {
    const state = liveTradingEvent();
    const result = p2p.proposeTrade(state, ctx(NOW, team(ALPHA)), {
      proposerTeamId: ALPHA,
      counterpartyTeamId: BETA,
      side: "BUY",
      instrumentId: NOVA,
      quantity: 2000,
      price: rupees(500),
      idempotencyKey: "big-buy",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Not enough cash/);
  });

  it("rejects negative holdings: no short selling, and FAILED if shares are gone at acceptance", () => {
    const state = liveTradingEvent();
    const shortSale = propose(state, { quantity: 201 });
    expect(shortSale.ok).toBe(false);
    if (!shortSale.ok) expect(shortSale.message).toMatch(/no short selling/);

    const proposal = expectOk(propose(state, { quantity: 20 }));
    expectOk(adjustHolding(state, ctx(NOW), { teamId: ALPHA, instrumentId: NOVA, quantity: -190, adjustmentType: "CORRECTION", reason: "Test correction" }));
    const result = p2p.acceptProposal(state, ctx(NOW, team(BETA)), { proposalId: proposal.id, teamId: BETA });
    expect(result.ok).toBe(false);
    const stored = state.proposals.find((p) => p.id === proposal.id)!;
    expect(stored.status).toBe("FAILED");
    expect(stored.failureReason).toMatch(/holds only 10 NOVA/);
    expect(teamShares(state, ALPHA, NOVA)).toBe(10);
  });

  it("enforces the ±10% band around the reference price", () => {
    expect(p2p.priceBand(rupees(525), 10, 5)).toEqual({ min: rupees(472.5), max: rupees(577.5) });
    const state = liveTradingEvent();
    expect(p2p.priceBand(state.prices[NOVA].price, 10, 5)).toEqual({ min: rupees(450), max: rupees(550) });
    const tooHigh = propose(state, { price: rupees(550.05) });
    expect(tooHigh.ok).toBe(false);
    if (!tooHigh.ok) expect(tooHigh.message).toMatch(/within ±10%/);
    expect(propose(state, { price: rupees(550) }).ok).toBe(true);
    expect(propose(state, { price: rupees(450) }).ok).toBe(true);
    expect(propose(state, { price: rupees(449.95) }).ok).toBe(false);
  });

  it("supports reject, cancel and expiry", () => {
    const state = liveTradingEvent();
    const toReject = expectOk(propose(state));
    const toCancel = expectOk(propose(state));
    const toExpire = expectOk(propose(state));

    expectOk(p2p.rejectProposal(state, ctx(NOW, team(BETA)), { proposalId: toReject.id, teamId: BETA, reason: "Price too high" }));
    expect(p2p.cancelProposal(state, ctx(NOW, team(BETA)), { proposalId: toCancel.id, teamId: BETA }).ok).toBe(false);
    expectOk(p2p.cancelProposal(state, ctx(NOW, team(ALPHA)), { proposalId: toCancel.id, teamId: ALPHA }));

    const later = NOW + state.event.rules.proposalExpirySeconds * 1000 + 1;
    expect(p2p.expireDueProposals(state, ctx(later))).toBe(1);
    expect(state.proposals.find((p) => p.id === toExpire.id)?.status).toBe("EXPIRED");
    expect(p2p.acceptProposal(state, ctx(later, team(BETA)), { proposalId: toExpire.id, teamId: BETA }).ok).toBe(false);
    expect(state.proposals.find((p) => p.id === toReject.id)?.status).toBe("REJECTED");
    expect(state.proposals.find((p) => p.id === toCancel.id)?.status).toBe("CANCELLED");
  });

  it("routes large trades to host approval and settles only after approval", () => {
    const state = liveTradingEvent();
    state.event.rules.approvalEnabled = true;
    state.event.rules.approvalThreshold = rupees(10000);
    const proposal = expectOk(propose(state));
    const outcome = expectOk(p2p.acceptProposal(state, ctx(NOW, team(BETA)), { proposalId: proposal.id, teamId: BETA }));
    expect(outcome.kind).toBe("PENDING_APPROVAL");
    expect(state.trades).toHaveLength(0);
    expectOk(p2p.approveProposal(state, ctx(NOW + 5), proposal.id));
    expect(state.trades).toHaveLength(1);
    expect(state.proposals[0].status).toBe("SETTLED");
  });
});

describe("Counter-offers", () => {
  it("rejects the original with a link and sends a new proposal the other way, keeping both records", () => {
    const state = liveTradingEvent();
    const original = expectOk(propose(state, { price: rupees(525) }));

    const counter = expectOk(
      p2p.counterProposal(state, ctx(NOW + 1000, team(BETA)), { originalProposalId: original.id, teamId: BETA, quantity: 15, price: rupees(510), idempotencyKey: "counter-1" }),
    );

    const stored = state.proposals.find((p) => p.id === original.id)!;
    expect(stored.status).toBe("REJECTED");
    expect(stored.rejectionReason).toBe(`Countered with ${counter.id}`);
    expect(counter).toMatchObject({ proposerTeamId: BETA, counterpartyTeamId: ALPHA, side: "BUY", instrumentId: NOVA, quantity: 15, price: rupees(510), status: "PROPOSED", counterOfProposalId: original.id });
    expect(state.proposals).toHaveLength(2);
    expect(state.trades).toHaveLength(0);
    const rejection = state.audit.find((a) => a.type === "TRADE_REJECTED")!;
    expect(rejection.refs).toMatchObject({ proposalId: original.id, counterProposalId: counter.id });
    const proposed = state.audit.filter((a) => a.type === "TRADE_PROPOSED").at(-1)!;
    expect(proposed.refs.counterOfProposalId).toBe(original.id);
  });

  it("settles the counter normally when the original proposer accepts it", () => {
    const state = liveTradingEvent();
    const original = expectOk(propose(state));
    const counter = expectOk(p2p.counterProposal(state, ctx(NOW + 1000, team(BETA)), { originalProposalId: original.id, teamId: BETA, quantity: 10, price: rupees(505), idempotencyKey: "counter-2" }));
    const outcome = expectOk(p2p.acceptProposal(state, ctx(NOW + 2000, team(ALPHA)), { proposalId: counter.id, teamId: ALPHA }));
    expect(outcome.kind).toBe("SETTLED");
    expect(state.trades).toHaveLength(1);
    expect(state.trades[0]).toMatchObject({ buyerTeamId: BETA, sellerTeamId: ALPHA, quantity: 10, price: rupees(505) });
  });

  it("changes nothing when the counter is invalid, and only the receiving team can counter", () => {
    const state = liveTradingEvent();
    const original = expectOk(propose(state));
    const outside = p2p.counterProposal(state, ctx(NOW + 1000, team(BETA)), { originalProposalId: original.id, teamId: BETA, quantity: 10, price: rupees(900), idempotencyKey: "counter-3" });
    expect(outside.ok).toBe(false);
    expect(state.proposals.find((p) => p.id === original.id)!.status).toBe("PROPOSED");
    expect(state.proposals).toHaveLength(1);

    const wrongTeam = p2p.counterProposal(state, ctx(NOW + 1000, team(ALPHA)), { originalProposalId: original.id, teamId: ALPHA, quantity: 10, price: rupees(505), idempotencyKey: "counter-4" });
    expect(wrongTeam.ok).toBe(false);
  });

  it("is idempotent and refuses to counter a proposal that is no longer open", () => {
    const state = liveTradingEvent();
    const original = expectOk(propose(state));
    const args = { originalProposalId: original.id, teamId: BETA, quantity: 10, price: rupees(505), idempotencyKey: "counter-5" };
    const first = expectOk(p2p.counterProposal(state, ctx(NOW + 1000, team(BETA)), args));
    const again = expectOk(p2p.counterProposal(state, ctx(NOW + 1500, team(BETA)), args));
    expect(again.id).toBe(first.id);
    expect(state.proposals).toHaveLength(2);

    const other = p2p.counterProposal(state, ctx(NOW + 2000, team(BETA)), { ...args, idempotencyKey: "counter-6" });
    expect(other.ok).toBe(false);
  });
});
