import { describe, expect, it } from "vitest";
import { setupIssues, stepStatus } from "../setup-checks";
import { readyEvent } from "./helpers";

describe("setup review checks", () => {
  it("reports no must-fix items for the ready fixture", () => {
    const state = readyEvent();
    const issues = setupIssues(state);
    expect(issues.filter((i) => i.level === "MUST_FIX")).toEqual([]);
    expect(stepStatus(issues, "rounds")).toBe("OK");
  });

  it("flags a Ready story that moves a stock not tradable in its round", () => {
    const state = readyEvent();
    const story = state.news.find((n) => n.status === "READY" && n.roundId && n.impacts.length > 0)!;
    const round = state.rounds.find((r) => r.id === story.roundId)!;
    round.type = "TRADING";
    const moved = story.impacts[0].instrumentId;
    round.tradableInstrumentIds = state.instruments.filter((i) => i.enabled && i.id !== moved).map((i) => i.id);
    const issue = setupIssues(state).find((i) => i.step === "news" && i.ref === story.id);
    expect(issue).toMatchObject({ level: "MUST_FIX" });
    expect(issue!.message).toContain("isn't tradable");
    expect(stepStatus(setupIssues(state), "news")).toBe("MUST_FIX");
  });

  it("downgrades the same conflict to a note for drafts, and catches disabled stocks and empty rosters", () => {
    const state = readyEvent();
    const story = state.news.find((n) => n.impacts.length > 0)!;
    story.status = "DRAFT";
    state.instruments.find((i) => i.id === story.impacts[0].instrumentId)!.enabled = false;
    expect(setupIssues(state).find((i) => i.ref === story.id)?.level).toBe("NOTE");

    state.teams.forEach((t) => (t.status = "DISABLED" as typeof t.status));
    expect(setupIssues(state).some((i) => i.step === "teams" && i.level === "MUST_FIX")).toBe(true);
  });
});
