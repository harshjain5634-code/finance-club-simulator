import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_EVENT_ID } from "@/data/scenarios/shared";
import { EVENT_TEMPLATES } from "@/data/templates";
import { computeLeaderboard, participantLeaderboardView, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { reconcile } from "@/lib/domain/ledger";
import { rupees } from "@/lib/domain/money";
import { netWorth, returnPct, teamCash, teamShares } from "@/lib/domain/portfolio";
import { currentRound, deriveMarketState } from "@/lib/domain/trading-gate";
import type { EventState, OpResult } from "@/lib/domain/types";
import * as commands from "../commands";
import { buildExport, EXPORTS, toCsv } from "../exports";
import { proposalsForTeam } from "../selectors";
import { getStoreSnapshot } from "../store";

/**
 * Drives the Phase 1 command layer exactly as the UI does (localStorage-backed store, permission checks,
 * transactions) through the demo workflows in PHASE1_TEST_CHECKLIST.md.
 */

beforeAll(() => {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  };
  Object.assign(globalThis, { window: globalThis, localStorage });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ALPHA = "team-alpha";
const BETA = "team-beta";
const NOVA = "ins-nova";
const VERTEX = "ins-vertex";

function demo(): EventState {
  return getStoreSnapshot()!.events[DEMO_EVENT_ID];
}

function expectOk<T>(result: OpResult<T>): T {
  if (!result.ok) throw new Error(`Expected ok: ${result.message}`);
  return result.value;
}

const key = (() => {
  let n = 0;
  return () => `wf-key-${++n}`;
})();

describe("Phase 1 workflows through the mock command layer", () => {
  it("1–3: creates an event from a template, adds teams and applies allocations", async () => {
    const template = EVENT_TEMPLATES[0];
    const created = expectOk(await commands.createEventFromConfig({ ...template.config, name: "Workflow Cup", code: "WFCUP26" }, template.id));
    let state = getStoreSnapshot()!.events[created.eventId];
    expect(state.event.status).toBe("DRAFT");
    expect(state.event.templateId).toBe(template.id);
    expect(state.instruments).toHaveLength(8);

    expectOk(await commands.addTeams(created.eventId, ["North Desk", "South Desk", "East Desk"]));
    state = getStoreSnapshot()!.events[created.eventId];
    expect(state.teams.map((t) => t.name)).toEqual(["North Desk", "South Desk", "East Desk"]);
    expect(state.teams.every((t) => /^\d{4}$/.test(t.pin))).toBe(true);

    const plan = { mode: state.allocationPlan.mode, distribution: state.allocationPlan.distribution, identical: state.allocationPlan.identical, perTeam: state.allocationPlan.perTeam };
    const applied = expectOk(await commands.applyAllocations(created.eventId, plan, key()));
    state = getStoreSnapshot()!.events[created.eventId];
    expect(applied.journals).toBe(3);
    expect(state.event.status).toBe("READY");
    expect(state.capitalBase[state.teams[0].id]).toBe(rupees(1000000));
    expect(reconcile(state, Date.now()).passed).toBe(true);

    const duplicate = await commands.createEventFromConfig({ ...template.config, name: "Another", code: "WFCUP26" }, template.id);
    expect(duplicate.ok).toBe(false);
  });

  it("4–17: runs rounds and P2P trading with validation, failures and idempotent settlement", async () => {
    expectOk(await commands.resetDemo());
    expect(demo().event.status).toBe("READY");
    expect(demo().teams.find((t) => t.id === ALPHA)?.pin).toBe("4821");

    const sell = (overrides: Partial<commands.ProposeTradeInput> = {}) =>
      commands.proposeTrade(DEMO_EVENT_ID, ALPHA, { counterpartyTeamId: BETA, side: "SELL", instrumentId: NOVA, quantity: 20, price: rupees(525), idempotencyKey: key(), ...overrides });

    // 5. briefing: trading closed
    expectOk(await commands.startEvent(DEMO_EVENT_ID));
    expectOk(await commands.startRound(DEMO_EVENT_ID));
    expect(currentRound(demo())?.type).toBe("BRIEFING");
    expect(deriveMarketState(demo().event, currentRound(demo()), Date.now())).toBe("BRIEFING");
    expect((await sell()).ok).toBe(false);

    // 6. trading round
    expectOk(await commands.nextRound(DEMO_EVENT_ID));
    expect(currentRound(demo())?.name).toBe("Opening Market");

    // 7–8. propose and receive
    const proposal = expectOk(await sell());
    expect(proposalsForTeam(demo(), BETA).incomingOpen.map((p) => p.id)).toEqual([proposal.id]);

    // 9–13 + 17. two simultaneous accepts settle once
    const alphaCash = teamCash(demo(), ALPHA);
    const [first, second] = await Promise.all([commands.acceptProposal(DEMO_EVENT_ID, BETA, proposal.id), commands.acceptProposal(DEMO_EVENT_ID, BETA, proposal.id)]);
    expect(first.ok && second.ok).toBe(true);
    expect(demo().trades.filter((t) => t.proposalId === proposal.id)).toHaveLength(1);
    expect(teamShares(demo(), ALPHA, NOVA)).toBe(180);
    expect(teamShares(demo(), BETA, NOVA)).toBe(220);
    expect(teamCash(demo(), ALPHA)).toBe(alphaCash + rupees(10500));
    expect(demo().journals.filter((j) => j.type === "TRADE")).toHaveLength(1);
    expect(demo().audit.map((a) => a.type)).toEqual(expect.arrayContaining(["TRADE_PROPOSED", "TRADE_ACCEPTED", "TRADE_SETTLED"]));

    // Only the counterparty may accept; teams cannot run host commands.
    const own = expectOk(await sell());
    expect((await commands.acceptProposal(DEMO_EVENT_ID, ALPHA, own.id)).ok).toBe(false);

    // 14. outside the ±10% band
    const outside = await sell({ price: rupees(550.05) });
    expect(outside.ok).toBe(false);

    // 15. shares removed before acceptance → FAILED with explanation
    const big = expectOk(await sell({ quantity: 100 }));
    expectOk(await commands.adjustTeamHolding(DEMO_EVENT_ID, { teamId: ALPHA, instrumentId: NOVA, quantity: -150, adjustmentType: "CORRECTION", reason: "Workflow test correction" }, key()));
    expect((await commands.acceptProposal(DEMO_EVENT_ID, BETA, big.id)).ok).toBe(false);
    const failed = demo().proposals.find((p) => p.id === big.id)!;
    expect(failed.status).toBe("FAILED");
    expect(failed.failureReason).toMatch(/holds only 30 NOVA/);

    // 16. reject, cancel, expiry
    expectOk(await commands.cancelProposal(DEMO_EVENT_ID, ALPHA, own.id));
    const toReject = expectOk(await sell({ quantity: 5 }));
    expectOk(await commands.rejectProposal(DEMO_EVENT_ID, BETA, toReject.id, "Too expensive"));
    const toExpire = expectOk(await sell({ quantity: 5 }));
    vi.spyOn(Date, "now").mockReturnValue(toExpire.expiresAt + 1000);
    expectOk(await commands.runScheduledWork(DEMO_EVENT_ID));
    vi.restoreAllMocks();
    const statuses = Object.fromEntries(demo().proposals.map((p) => [p.id, p.status]));
    expect([statuses[own.id], statuses[toReject.id], statuses[toExpire.id]]).toEqual(["CANCELLED", "REJECTED", "EXPIRED"]);
    expect(reconcile(demo(), Date.now()).passed).toBe(true);
  });

  it("18–30: news, prices, halts, freeze and adjustments", async () => {
    expectOk(await commands.resetDemo());
    expectOk(await commands.startEvent(DEMO_EVENT_ID));
    expectOk(await commands.nextRound(DEMO_EVENT_ID));
    expectOk(await commands.nextRound(DEMO_EVENT_ID));
    const before = computeLeaderboard(demo());

    // 18–22. range news resolves once (+7.34%) and revalues portfolios
    vi.spyOn(Math, "random").mockReturnValue(0.468);
    const release = expectOk(await commands.releaseNews(DEMO_EVENT_ID, "news-03", key()));
    vi.restoreAllMocks();
    expect(release.impacts[0]).toMatchObject({ instrumentId: NOVA, resolvedPct: 7.34, newPrice: rupees(536.7) });
    expect(demo().prices[NOVA].price).toBe(rupees(536.7));
    expect(netWorth(demo(), ALPHA)).toBe(rupees(1000000) + 200 * (rupees(536.7) - rupees(500)));
    expect(computeLeaderboard(demo())[0].returnPct).toBeGreaterThan(before[0].returnPct);
    expect((await commands.releaseNews(DEMO_EVENT_ID, "news-03")).ok).toBe(true);
    expect(demo().newsReleases).toHaveLength(1);

    // 23–24. multi-stock news and circuit clamp
    const multi = expectOk(await commands.releaseNews(DEMO_EVENT_ID, "news-08"));
    expect(multi.impacts).toHaveLength(3);
    const crash = expectOk(await commands.releaseNews(DEMO_EVENT_ID, "news-10"));
    expect(crash.impacts[0]).toMatchObject({ instrumentId: VERTEX, resolvedPct: -12, clamped: true });

    // 25. manual price change needs a reason and records a MANUAL price event
    expect((await commands.setInstrumentPrice(DEMO_EVENT_ID, "ins-orbit", rupees(1300), "")).ok).toBe(false);
    expectOk(await commands.setInstrumentPrice(DEMO_EVENT_ID, "ins-orbit", rupees(1300), "Workflow manual move", key()));
    expect(demo().priceEvents.at(-1)).toMatchObject({ source: "MANUAL", newPrice: rupees(1300), reason: "Workflow manual move" });

    const propose = () => commands.proposeTrade(DEMO_EVENT_ID, ALPHA, { counterpartyTeamId: BETA, side: "SELL", instrumentId: NOVA, quantity: 1, price: demo().prices[NOVA].price, idempotencyKey: key() });

    // 26. halt
    expectOk(await commands.haltInstrument(DEMO_EVENT_ID, NOVA));
    expect((await propose()).ok).toBe(false);
    expectOk(await commands.resumeInstrument(DEMO_EVENT_ID, NOVA));
    expect((await propose()).ok).toBe(true);

    // 27–28. freeze / unfreeze
    expectOk(await commands.freezeTrading(DEMO_EVENT_ID, "Workflow freeze"));
    expect(deriveMarketState(demo().event, currentRound(demo()), Date.now())).toBe("FROZEN");
    expect((await propose()).ok).toBe(false);
    expectOk(await commands.unfreezeTrading(DEMO_EVENT_ID));
    expect((await propose()).ok).toBe(true);

    // 29–30. AWARD changes return, CAPITAL_CHANGE does not
    const returnOf = (teamId: string) => returnPct(netWorth(demo(), teamId), demo().capitalBase[teamId]);
    const alphaBefore = returnOf(ALPHA);
    const betaBefore = returnOf(BETA);
    expectOk(await commands.adjustTeamCash(DEMO_EVENT_ID, { teamId: ALPHA, amount: rupees(20000), adjustmentType: "AWARD", reason: "Best research note" }, key()));
    expectOk(await commands.adjustTeamCash(DEMO_EVENT_ID, { teamId: BETA, amount: rupees(20000), adjustmentType: "CAPITAL_CHANGE", reason: "Late capital top-up" }, key()));
    expect(returnOf(ALPHA)).toBeGreaterThan(alphaBefore + 1.5);
    expect(returnOf(BETA)).toBeLessThan(betaBefore);
    expect(returnOf(BETA)).toBeGreaterThan(betaBefore - 0.2);
    expect(reconcile(demo(), Date.now()).passed).toBe(true);
  });

  it("31–41: round control, leaderboard visibility, reset, end event, audit and CSV export", async () => {
    expectOk(await commands.resetDemo());
    expectOk(await commands.startEvent(DEMO_EVENT_ID));
    expectOk(await commands.startRound(DEMO_EVENT_ID));
    expectOk(await commands.nextRound(DEMO_EVENT_ID));

    // 31–34
    expectOk(await commands.pauseRound(DEMO_EVENT_ID));
    expect(currentRound(demo())?.status).toBe("PAUSED");
    expectOk(await commands.resumeRound(DEMO_EVENT_ID));
    expect(currentRound(demo())?.status).toBe("RUNNING");
    expectOk(await commands.endRound(DEMO_EVENT_ID));
    expect(deriveMarketState(demo().event, currentRound(demo()), Date.now())).toBe("BETWEEN_ROUNDS");
    expectOk(await commands.nextRound(DEMO_EVENT_ID));
    expect(currentRound(demo())?.name).toBe("Expansion");

    // 35–36
    expectOk(await commands.setLeaderboardVisibility(DEMO_EVENT_ID, { participantVisibility: "TOP_N", participantTopN: 3 }));
    const rows = publishedLeaderboard(demo()).rows;
    const view = participantLeaderboardView(rows, demo().event.leaderboard.participantVisibility, 3, rows.at(-1)!.teamId);
    expect(view.mode === "TOP_N" && view.ownPinned).toBe(true);
    expectOk(await commands.freezeLeaderboard(DEMO_EVENT_ID));
    expect(publishedLeaderboard(demo()).frozenAt).not.toBeNull();
    expectOk(await commands.unfreezeLeaderboard(DEMO_EVENT_ID));

    // 37
    expectOk(await commands.adjustTeamCash(DEMO_EVENT_ID, { teamId: ALPHA, amount: rupees(-10000), adjustmentType: "PENALTY", reason: "Rule breach penalty" }, key()));
    expectOk(await commands.resetTeam(DEMO_EVENT_ID, ALPHA, "Reset after dispute", key()));
    expect(teamCash(demo(), ALPHA)).toBe(rupees(505200));
    expect(demo().journals.at(-1)?.type).toBe("RESET");

    // 38–39
    expect((await commands.endEvent(DEMO_EVENT_ID, "")).ok).toBe(false);
    expectOk(await commands.endEvent(DEMO_EVENT_ID, "Event finished on schedule", key()));
    expect(demo().event.status).toBe("COMPLETED");
    expect(publishedLeaderboard(demo()).rows).toHaveLength(12);

    // 40
    const audit = demo().audit;
    expect(audit.filter((a) => a.type === "TEAM_RESET" && a.teamId === ALPHA)).toHaveLength(1);
    expect(audit.filter((a) => a.type === "EVENT_ENDED")[0].reason).toBe("Event finished on schedule");

    // 41
    for (const item of EXPORTS) {
      const table = buildExport(demo(), item.kind);
      expect(table.headers.length).toBeGreaterThan(3);
    }
    expect(buildExport(demo(), "audit").rows.length).toBe(audit.length);
    expect(toCsv({ headers: ["a", "b"], rows: [["x,y", 'say "hi"']] })).toBe('a,b\r\n"x,y","say ""hi"""');
    expect(reconcile(demo(), Date.now()).passed).toBe(true);
  });

  it("42: switches the demo scenario to REAL_SIMULATED", async () => {
    expectOk(await commands.loadDemoScenario("REAL_SIMULATED", "QUICK"));
    const state = demo();
    expect(state.event.universeMode).toBe("REAL_SIMULATED");
    expect(state.instruments.map((i) => i.symbol)).toEqual(["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "ITC", "LT"]);
    expect(state.instruments.every((i) => i.mode === "REAL_SIMULATED" && i.history.length === 60)).toBe(true);
    expect(state.rounds.map((r) => r.durationSeconds)).toEqual([60, 240, 240, 240]);
    expect(state.capitalBase[ALPHA]).toBe(rupees(1000000));
    expect(getStoreSnapshot()!.demo).toEqual({ scenario: "REAL_SIMULATED", timing: "QUICK" });
  });
});
