import { describe, expect, it } from "vitest";
import { compareStandings, computeLeaderboard, participantLeaderboardView, rankTeams } from "../leaderboard";
import { isBalanced, LedgerError, postJournal, reconcile, teamAccount, CASH, TREASURY } from "../ledger";
import * as lifecycle from "../lifecycle";
import { rupees } from "../money";
import { releaseNews, resolveImpactPct } from "../news";
import { adjustCash, netWorth, resetTeam, returnPct, teamCash, teamShares } from "../portfolio";
import { applyPriceRules, roundToTick } from "../prices";
import { checkTradingGate, currentRound, deriveMarketState } from "../trading-gate";
import { ALPHA, BETA, ctx, expectOk, liveTradingEvent, NOVA, readyEvent, T0, VERTEX } from "./helpers";

const NOW = T0 + 10_000;

describe("ledger", () => {
  it("keeps every journal balanced and projections reconciled after allocation", () => {
    const state = readyEvent();
    expect(state.journals).toHaveLength(12);
    expect(state.journals.every((j) => isBalanced(j.postings))).toBe(true);
    const report = reconcile(state, NOW);
    expect(report.passed).toBe(true);
    expect(report.checks.map((c) => c.label)).toEqual(["Ledger balanced", "Cash projections match", "Holdings projections match", "No negative team balances"]);
  });

  it("refuses unbalanced journals and negative team balances without writing anything", () => {
    const state = readyEvent();
    const before = structuredClone(state.balances);
    expect(() =>
      postJournal(state, { type: "ADJUSTMENT", referenceId: "x", memo: "bad", postings: [{ account: teamAccount(ALPHA), asset: CASH, amount: 100 }] }, { at: NOW, actor: { type: "SYSTEM", name: "t" } }),
    ).toThrow(LedgerError);
    expect(() =>
      postJournal(
        state,
        {
          type: "ADJUSTMENT",
          referenceId: "y",
          memo: "overdraft",
          postings: [
            { account: TREASURY, asset: CASH, amount: 1 + teamCash(state, ALPHA) },
            { account: teamAccount(ALPHA), asset: CASH, amount: -(1 + teamCash(state, ALPHA)) },
          ],
        },
        { at: NOW, actor: { type: "SYSTEM", name: "t" } },
      ),
    ).toThrow(/negative/);
    expect(state.balances).toEqual(before);
  });

  it("detects a projection that drifted from the ledger", () => {
    const state = readyEvent();
    state.balances[teamAccount(ALPHA)][CASH] += 1;
    const report = reconcile(state, NOW);
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "cash")?.passed).toBe(false);
  });
});

describe("price pipeline", () => {
  const limits = { floor: rupees(250), ceiling: rupees(1000), circuitPct: 10, roundOpenPrice: rupees(500), tickSize: 5 };

  it("rounds to the ₹0.05 tick", () => {
    expect(roundToTick(53672.4)).toBe(53670);
    expect(roundToTick(53673)).toBe(53675);
    expect(applyPriceRules(rupees(500) * 1.0734, { ...limits, circuitPct: null }).price).toBe(rupees(536.7));
  });

  it("clamps at the circuit limit relative to the round open price", () => {
    const up = applyPriceRules(rupees(500) * 1.15, limits);
    expect(up.price).toBe(rupees(550));
    expect(up.clampReasons).toContain("CIRCUIT_UPPER");
    const down = applyPriceRules(rupees(500) * 0.85, limits);
    expect(down.price).toBe(rupees(450));
    expect(down.clampReasons).toContain("CIRCUIT_LOWER");
  });

  it("applies the price floor", () => {
    const result = applyPriceRules(rupees(200), { ...limits, circuitPct: null });
    expect(result.price).toBe(rupees(250));
    expect(result.clampReasons).toEqual(["FLOOR"]);
  });

  it("applies the price ceiling", () => {
    const result = applyPriceRules(rupees(1200), { ...limits, circuitPct: null });
    expect(result.price).toBe(rupees(1000));
    expect(result.clampReasons).toEqual(["CEILING"]);
  });
});

describe("news engine", () => {
  it("applies a fixed impact exactly", () => {
    const state = liveTradingEvent();
    const release = expectOk(releaseNews(state, ctx(NOW), "news-01"));
    expect(release.impacts).toHaveLength(1);
    expect(release.impacts[0]).toMatchObject({ resolvedPct: 4, previousPrice: rupees(1240), newPrice: rupees(1289.6), clamped: false });
    expect(state.prices["ins-orbit"].price).toBe(rupees(1289.6));
  });

  it("resolves a range impact once and stores the exact number", () => {
    const state = liveTradingEvent();
    const release = expectOk(releaseNews(state, ctx(NOW, undefined, () => 0.468), "news-03"));
    const impact = release.impacts[0];
    expect(impact.configured).toEqual({ kind: "NEWS_RANGE", minPct: 5, maxPct: 10 });
    expect(impact.resolvedPct).toBe(7.34);
    expect(impact.newPrice).toBe(rupees(536.7));
    const priceEvent = state.priceEvents.find((e) => e.id === impact.priceEventId)!;
    expect(priceEvent).toMatchObject({ source: "NEWS", resolvedImpactPct: 7.34, previousPrice: rupees(500), newPrice: rupees(536.7), newsReleaseId: release.id });

    const again = expectOk(releaseNews(state, ctx(NOW + 1, undefined, () => 0.99), "news-03"));
    expect(again.id).toBe(release.id);
    expect(state.newsReleases).toHaveLength(1);
    expect(state.prices[NOVA].price).toBe(rupees(536.7));
  });

  it("keeps range draws within the configured bounds", () => {
    const impact = { id: "i", instrumentId: NOVA, direction: "DOWN" as const, mode: "RANGE" as const, fixedPct: null, minPct: 2, maxPct: 4, timing: "IMMEDIATE" as const };
    for (const r of [0, 0.25, 0.999]) {
      const pct = resolveImpactPct(impact, () => r);
      expect(pct).toBeLessThanOrEqual(-2);
      expect(pct).toBeGreaterThanOrEqual(-4);
    }
  });

  it("moves several stocks from one multi-stock story and clamps at the circuit", () => {
    const state = liveTradingEvent();
    expectOk(lifecycle.nextRound(state, ctx(NOW)));
    expectOk(lifecycle.nextRound(state, ctx(NOW)));
    expect(currentRound(state)?.name).toBe("Market Crisis");

    const multi = expectOk(releaseNews(state, ctx(NOW + 1), "news-08"));
    expect(multi.impacts.map((i) => [i.instrumentId, i.resolvedPct])).toEqual([
      [VERTEX, -5],
      [NOVA, -2],
      ["ins-apex", -3],
    ]);
    expect(state.prices[VERTEX].price).toBe(rupees(608));

    const crash = expectOk(releaseNews(state, ctx(NOW + 2), "news-10"));
    expect(crash.impacts[0].resolvedPct).toBe(-12);
    expect(crash.impacts[0].clamped).toBe(true);
    expect(crash.impacts[0].clampReasons).toContain("CIRCUIT_LOWER");
    expect(state.prices[VERTEX].price).toBe(rupees(576));
  });
});

describe("leaderboard", () => {
  it("ranks by percentage return using net worth and capital base", () => {
    const state = liveTradingEvent();
    expect(state.capitalBase[ALPHA]).toBe(rupees(1000000));
    expect(netWorth(state, ALPHA)).toBe(rupees(1000000));
    expectOk(releaseNews(state, ctx(NOW, undefined, () => 0.468), "news-03"));
    const expectedWorth = rupees(505200) + 200 * rupees(536.7) + rupees(494800) - 200 * rupees(500);
    expect(netWorth(state, ALPHA)).toBe(expectedWorth);
    expect(returnPct(netWorth(state, ALPHA), state.capitalBase[ALPHA])).toBeCloseTo(0.734, 6);
  });

  it("an AWARD raises return but a CAPITAL_CHANGE does not", () => {
    const state = liveTradingEvent();
    expectOk(adjustCash(state, ctx(NOW), { teamId: ALPHA, amount: rupees(10000), adjustmentType: "AWARD", reason: "Best pitch award" }));
    expectOk(adjustCash(state, ctx(NOW), { teamId: BETA, amount: rupees(10000), adjustmentType: "CAPITAL_CHANGE", reason: "Late capital top-up" }));
    const board = computeLeaderboard(state);
    const alpha = board.find((r) => r.teamId === ALPHA)!;
    const beta = board.find((r) => r.teamId === BETA)!;
    expect(alpha.returnPct).toBeCloseTo(1, 6);
    expect(beta.returnPct).toBeCloseTo(0, 6);
    expect(beta.capitalBase).toBe(rupees(1010000));
    expect(alpha.rank).toBe(1);
  });

  it("breaks ties by net worth, then team name", () => {
    const rows = rankTeams([
      { teamId: "b", teamName: "Beta", netWorth: 110, capitalBase: 100 },
      { teamId: "a", teamName: "Alpha", netWorth: 110, capitalBase: 100 },
      { teamId: "c", teamName: "Charlie", netWorth: 220, capitalBase: 200 },
    ]);
    expect(rows.map((r) => r.teamName)).toEqual(["Charlie", "Alpha", "Beta"]);
    expect(compareStandings(rows[1], rows[2])).toBeLessThan(0);
  });

  it("TOP_N pins the participant's own row when outside the top N", () => {
    const rows = computeLeaderboard(liveTradingEvent());
    const last = rows[rows.length - 1];
    const view = participantLeaderboardView(rows, "TOP_N", 3, last.teamId);
    expect(view.mode).toBe("TOP_N");
    if (view.mode === "TOP_N") {
      expect(view.rows).toHaveLength(3);
      expect(view.ownPinned).toBe(true);
    }
    expect(participantLeaderboardView(rows, "HIDDEN", 3, last.teamId).rows).toHaveLength(0);
  });
});

describe("trading gate and rounds", () => {
  it("blocks trading before the event, during briefing, when frozen, paused, halted, disabled or out of time", () => {
    const ready = readyEvent();
    const nova = () => ready.instruments.find((i) => i.id === NOVA);
    const gate = (s: typeof ready, now = NOW) =>
      checkTradingGate({ event: s.event, round: currentRound(s), teams: s.teams.filter((t) => t.id === ALPHA), instrument: s.instruments.find((i) => i.id === NOVA), now });

    expect(gate(ready)).toMatchObject({ ok: false, code: "EVENT_NOT_STARTED" });
    expect(nova()).toBeDefined();

    expectOk(lifecycle.startEvent(ready, ctx(NOW)));
    expect(gate(ready)).toMatchObject({ ok: false, code: "NO_ACTIVE_ROUND" });
    expectOk(lifecycle.startRound(ready, ctx(NOW)));
    expect(gate(ready)).toMatchObject({ ok: false, code: "BRIEFING_ROUND" });
    expect(deriveMarketState(ready.event, currentRound(ready), NOW)).toBe("BRIEFING");

    expectOk(lifecycle.nextRound(ready, ctx(NOW)));
    expect(gate(ready)).toEqual({ ok: true });
    expect(deriveMarketState(ready.event, currentRound(ready), NOW)).toBe("OPEN");

    expectOk(lifecycle.freezeTrading(ready, ctx(NOW), null));
    expect(gate(ready)).toMatchObject({ ok: false, code: "TRADING_FROZEN" });
    expectOk(lifecycle.unfreezeTrading(ready, ctx(NOW)));

    expectOk(lifecycle.haltInstrument(ready, ctx(NOW), NOVA, true));
    expect(gate(ready)).toMatchObject({ ok: false, code: "INSTRUMENT_HALTED" });
    expectOk(lifecycle.haltInstrument(ready, ctx(NOW), NOVA, false));

    ready.teams.find((t) => t.id === ALPHA)!.status = "DISABLED";
    expect(gate(ready)).toMatchObject({ ok: false, code: "TEAM_DISABLED" });
    ready.teams.find((t) => t.id === ALPHA)!.status = "ACTIVE";

    expectOk(lifecycle.pauseRound(ready, ctx(NOW)));
    expect(gate(ready)).toMatchObject({ ok: false, code: "ROUND_PAUSED" });
    expectOk(lifecycle.resumeRound(ready, ctx(NOW + 60_000)));

    const round = currentRound(ready)!;
    expect(gate(ready, round.endsAt! + 1)).toMatchObject({ ok: false, code: "ROUND_TIME_UP" });
  });

  it("pausing holds the remaining time and resuming restores it", () => {
    const state = liveTradingEvent(NOW);
    const round = currentRound(state)!;
    expectOk(lifecycle.pauseRound(state, ctx(NOW + 30_000)));
    expect(round.remainingMsAtPause).toBe(round.durationSeconds * 1000 - 30_000);
    expectOk(lifecycle.resumeRound(state, ctx(NOW + 500_000)));
    expect(round.endsAt).toBe(NOW + 500_000 + round.durationSeconds * 1000 - 30_000);
    expect(lifecycle.endRoundIfExpired(state, ctx(round.endsAt! + 1))).toBe(true);
    expect(round.status).toBe("ENDED");
  });

  it("carries cash, holdings and prices across rounds", () => {
    const state = liveTradingEvent();
    expectOk(releaseNews(state, ctx(NOW), "news-01"));
    const orbit = state.prices["ins-orbit"].price;
    const cash = teamCash(state, ALPHA);
    expectOk(lifecycle.nextRound(state, ctx(NOW + 1)));
    expect(state.prices["ins-orbit"].price).toBe(orbit);
    expect(state.prices["ins-orbit"].roundOpenPrice).toBe(orbit);
    expect(teamCash(state, ALPHA)).toBe(cash);
  });

  it("reset team restores the starting allocation through a RESET journal", () => {
    const state = liveTradingEvent();
    expectOk(adjustCash(state, ctx(NOW), { teamId: ALPHA, amount: rupees(-50000), adjustmentType: "PENALTY", reason: "Rule breach" }));
    const journalsBefore = state.journals.length;
    expectOk(resetTeam(state, ctx(NOW + 1), ALPHA, "Reset after dispute"));
    expect(teamCash(state, ALPHA)).toBe(rupees(505200));
    expect(teamShares(state, ALPHA, NOVA)).toBe(200);
    expect(state.journals.length).toBe(journalsBefore + 1);
    expect(state.journals[state.journals.length - 1].type).toBe("RESET");
    expect(reconcile(state, NOW).passed).toBe(true);
  });
});
