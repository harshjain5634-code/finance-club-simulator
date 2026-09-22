import { describe, expect, it } from "vitest";
import { computeLeaderboard, sharedRanks } from "../leaderboard";
import { liveTradingEvent } from "./helpers";

const row = (teamId: string, rank: number, netWorth: number, returnPct: number) => ({ teamId, rank, netWorth, returnPct });

describe("shared leaderboard ranks (presentation only)", () => {
  it("labels teams with equal return and net worth as =N and keeps the next team's own place", () => {
    const ranks = sharedRanks([row("a", 1, 1_010_000, 1), row("b", 2, 1_005_000, 0.5), row("c", 3, 1_005_000, 0.5), row("d", 4, 1_000_000, 0)]);
    expect(ranks.a).toEqual({ rank: 1, tied: false, label: "#1" });
    expect(ranks.b).toEqual({ rank: 2, tied: true, label: "=2" });
    expect(ranks.c).toEqual({ rank: 2, tied: true, label: "=2" });
    expect(ranks.d).toEqual({ rank: 4, tied: false, label: "#4" });
  });

  it("does not tie teams whose return matches but net worth differs", () => {
    const ranks = sharedRanks([row("a", 1, 2_000_000, 0.5), row("b", 2, 1_000_000, 0.5)]);
    expect(ranks.a.tied).toBe(false);
    expect(ranks.b.label).toBe("#2");
  });

  it("leaves the engine's ordinal ranks untouched", () => {
    const state = liveTradingEvent();
    const board = computeLeaderboard(state);
    const before = board.map((r) => r.rank);
    sharedRanks(board);
    expect(board.map((r) => r.rank)).toEqual(before);
    expect(new Set(before).size).toBe(board.length);
  });
});
