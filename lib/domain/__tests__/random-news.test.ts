import { describe, expect, it } from "vitest";
import * as lifecycle from "../lifecycle";
import {
  eligibleRandomStories,
  pauseRandomNews,
  randomNewsNeedsTick,
  randomNewsView,
  releaseNewsManually,
  resumeRandomNews,
  setRandomNewsMode,
  skipScheduledRandomNews,
  startRandomNews,
  stopRandomNews,
  tickRandomNews,
  updateRandomNewsSettings,
} from "../random-news";
import { currentRound } from "../trading-gate";
import type { EventState } from "../types";
import { ctx, expectOk, liveTradingEvent, T0 } from "./helpers";

const START = T0 + 10_000;
const SEC = 1000;
const ROUND_ONE_STORIES = ["news-01", "news-02", "news-03"];

/** Live event in Round 1 with a long timer, random mode configured for 120–300s gaps. */
function randomEvent(options: { random?: () => number; maxPerRound?: number } = {}): EventState {
  const state = liveTradingEvent(START - 1000);
  currentRound(state)!.endsAt = START + 3600 * SEC;
  expectOk(setRandomNewsMode(state, ctx(START), "RANDOM"));
  expectOk(updateRandomNewsSettings(state, ctx(START), { minGapSeconds: 120, maxGapSeconds: 300, maxPerRound: options.maxPerRound ?? 3 }));
  expectOk(startRandomNews(state, ctx(START, undefined, options.random ?? (() => 0))));
  return state;
}

const tick = (state: EventState, at: number, random: () => number = () => 0) => tickRandomNews(state, ctx(at, undefined, random));

describe("random news scheduling", () => {
  it("enforces the minimum gap between releases", () => {
    const state = randomEvent({ random: () => 0 });
    expect(state.randomNews.nextReleaseAt).toBe(START + 120 * SEC);

    expect(tick(state, START + 119 * SEC).release).toBeNull();
    const first = tick(state, START + 120 * SEC).release;
    expect(first).not.toBeNull();
    const releasedAt = first!.releasedAt;
    expect(state.randomNews.nextReleaseAt).toBeGreaterThanOrEqual(releasedAt + 120 * SEC);

    // Even if the schedule is forced earlier, the safety check refuses to release inside the gap.
    state.randomNews.nextReleaseAt = releasedAt + 10 * SEC;
    expect(tick(state, releasedAt + 30 * SEC).release).toBeNull();
    expect(state.newsReleases).toHaveLength(1);
    expect(tick(state, releasedAt + 120 * SEC).release).not.toBeNull();
    expect(state.newsReleases[1].releasedAt - state.newsReleases[0].releasedAt).toBeGreaterThanOrEqual(120 * SEC);
  });

  it("respects the maximum gap when scheduling", () => {
    const state = randomEvent({ random: () => 0.9999, maxPerRound: 3 });
    let last = START;
    for (let i = 0; i < 3; i++) {
      const scheduled = state.randomNews.nextReleaseAt!;
      expect(scheduled - last).toBeGreaterThanOrEqual(120 * SEC);
      expect(scheduled - last).toBeLessThanOrEqual(300 * SEC);
      const release = tick(state, scheduled, () => 0.9999).release!;
      expect(release.scheduledFor).toBe(scheduled);
      expect(release.source).toBe("RANDOM");
      last = release.releasedAt;
    }
  });

  it("never selects a story that was already released", () => {
    const state = randomEvent();
    expectOk(releaseNewsManually(state, ctx(START + 1000), "news-01"));
    expectOk(releaseNewsManually(state, ctx(START + 2000), "news-02"));
    expect(eligibleRandomStories(state).map((s) => s.id)).toEqual(["news-03"]);

    tick(state, START + 3000);
    expect(state.randomNews.scheduledNewsId).toBe("news-03");
    const release = tick(state, state.randomNews.nextReleaseAt!).release!;
    expect(release.newsItemId).toBe("news-03");

    tick(state, release.releasedAt + 600 * SEC);
    expect(state.randomNews.scheduledNewsId).toBeNull();
    expect(state.newsReleases.map((r) => r.newsItemId)).toEqual(["news-01", "news-02", "news-03"]);
    expect(randomNewsView(state, release.releasedAt + 600 * SEC).phase).toBe("NO_STORIES");
  });

  it("does not release while the round is paused and restores the held countdown", () => {
    const state = randomEvent();
    const due = state.randomNews.nextReleaseAt!;
    expectOk(lifecycle.pauseRound(state, ctx(START + 60 * SEC)));
    tick(state, START + 60 * SEC);
    expect(state.randomNews.nextReleaseAt).toBeNull();
    expect(state.randomNews.heldRemainingMs).toBe(due - (START + 60 * SEC));

    expect(tick(state, due + 600 * SEC).release).toBeNull();
    expect(state.newsReleases).toHaveLength(0);

    const resumeAt = START + 900 * SEC;
    expectOk(lifecycle.resumeRound(state, ctx(resumeAt)));
    tick(state, resumeAt);
    expect(state.randomNews.nextReleaseAt).toBe(resumeAt + (due - (START + 60 * SEC)));
  });

  it("does not release while the event is paused or random mode is paused", () => {
    const state = randomEvent();
    const due = state.randomNews.nextReleaseAt!;
    expectOk(lifecycle.pauseEvent(state, ctx(START + 10 * SEC)));
    expect(tick(state, due + 10 * SEC).release).toBeNull();
    expectOk(lifecycle.resumeEvent(state, ctx(due + 20 * SEC)));

    expectOk(pauseRandomNews(state, ctx(due + 21 * SEC)));
    expect(randomNewsNeedsTick(state, due + 999 * SEC)).toBe(false);
    expect(tick(state, due + 999 * SEC).release).toBeNull();
    expectOk(resumeRandomNews(state, ctx(due + 1000 * SEC)));
    expect(state.randomNews.nextReleaseAt).not.toBeNull();
    expect(state.newsReleases).toHaveLength(0);
  });

  it("does not release after random mode is stopped", () => {
    const state = randomEvent();
    const due = state.randomNews.nextReleaseAt!;
    expectOk(stopRandomNews(state, ctx(START + 5 * SEC)));
    expect(state.randomNews.nextReleaseAt).toBeNull();
    expect(state.randomNews.scheduledNewsId).toBeNull();
    expect(tick(state, due + 60 * SEC).release).toBeNull();
    expect(randomNewsNeedsTick(state, due + 60 * SEC)).toBe(false);
  });

  it("only selects stories eligible for the running round", () => {
    const state = randomEvent({ maxPerRound: 10 });
    const releasedIds: string[] = [];
    let at = state.randomNews.nextReleaseAt!;
    for (let i = 0; i < 6; i++) {
      const release = tick(state, at, () => 0.7).release;
      if (!release) break;
      releasedIds.push(release.newsItemId);
      if (!state.randomNews.nextReleaseAt) break;
      at = state.randomNews.nextReleaseAt;
    }
    expect(releasedIds.sort()).toEqual(ROUND_ONE_STORIES);

    // Unassigned ("any round") stories are eligible only when the pool includes them.
    const unassigned = state.news.find((n) => n.id === "news-05")!;
    unassigned.roundId = null;
    expect(eligibleRandomStories(state).map((s) => s.id)).toEqual(["news-05"]);
    expectOk(updateRandomNewsSettings(state, ctx(at + 1000), { includeUnassigned: false }));
    expect(eligibleRandomStories(state)).toHaveLength(0);
  });

  it("respects the maximum number of random stories per round", () => {
    const state = randomEvent({ maxPerRound: 2 });
    const first = tick(state, state.randomNews.nextReleaseAt!).release!;
    const second = tick(state, state.randomNews.nextReleaseAt!).release!;
    expect([first, second].every(Boolean)).toBe(true);
    expect(state.randomNews.nextReleaseAt).toBeNull();
    expect(tick(state, second.releasedAt + 3000 * SEC).release).toBeNull();
    expect(state.newsReleases.filter((r) => r.source === "RANDOM")).toHaveLength(2);
    expect(randomNewsView(state, second.releasedAt + 10 * SEC).phase).toBe("LIMIT_REACHED");
  });

  it("keeps exactly one scheduled release at a time", () => {
    const state = randomEvent();
    const due = state.randomNews.nextReleaseAt!;
    const results = [tick(state, due), tick(state, due), tick(state, due + 500)];
    expect(results.filter((r) => r.release !== null)).toHaveLength(1);
    expect(state.newsReleases).toHaveLength(1);
    expect(typeof state.randomNews.scheduledNewsId).toBe("string");
    expect(state.randomNews.nextReleaseAt).toBeGreaterThanOrEqual(state.newsReleases[0].releasedAt + 120 * SEC);
  });

  it("skipping picks a different story and reschedules outside the minimum gap", () => {
    const state = randomEvent();
    const skipped = state.randomNews.scheduledNewsId;
    expectOk(skipScheduledRandomNews(state, ctx(START + 30 * SEC, undefined, () => 0)));
    expect(state.randomNews.scheduledNewsId).not.toBe(skipped);
    expect(state.randomNews.nextReleaseAt).toBeGreaterThanOrEqual(START + 150 * SEC);
    expect(state.randomNews.log.at(-1)).toMatchObject({ outcome: "SKIPPED", newsItemId: skipped });
  });

  it("a manual release pushes the random schedule back so the gap holds", () => {
    const state = randomEvent();
    const manualAt = state.randomNews.nextReleaseAt! - 5 * SEC;
    expectOk(releaseNewsManually(state, ctx(manualAt), "news-02"));
    expect(state.randomNews.nextReleaseAt).toBeGreaterThanOrEqual(manualAt + 120 * SEC);
    expect(state.randomNews.scheduledNewsId).not.toBe("news-02");
  });
});

describe("random news while trading is frozen", () => {
  it("holds the countdown on freeze and resumes it with the same time left after unfreeze", () => {
    const state = randomEvent({ random: () => 0 });
    expect(state.randomNews.nextReleaseAt).toBe(START + 120 * SEC);

    expectOk(lifecycle.freezeTrading(state, ctx(START + 50 * SEC), "test"));
    expect(state.randomNews.nextReleaseAt).toBeNull();
    expect(state.randomNews.heldRemainingMs).toBe(70 * SEC);
    expect(state.randomNews.status).toBe("RUNNING");
    expect(state.audit.at(-1)).toMatchObject({ type: "NEWS_RANDOM_PAUSED", actor: { type: "SYSTEM" } });
    expect(state.audit.at(-1)!.summary).toContain("trading is frozen");
    expect(randomNewsView(state, START + 60 * SEC).message).toContain("frozen");

    // Long past the original due time: nothing goes out while frozen.
    expect(tick(state, START + 600 * SEC).release).toBeNull();
    expect(state.newsReleases).toHaveLength(0);

    expectOk(lifecycle.unfreezeTrading(state, ctx(START + 700 * SEC)));
    expect(state.randomNews.nextReleaseAt).toBe(START + 770 * SEC);
    expect(state.audit.at(-1)).toMatchObject({ type: "NEWS_RANDOM_RESUMED" });
    expect(tick(state, START + 769 * SEC).release).toBeNull();
    expect(tick(state, START + 770 * SEC).release).not.toBeNull();
    expect(state.newsReleases).toHaveLength(1);
  });

  it("keeps the minimum gap after an unfreeze", () => {
    const state = randomEvent({ random: () => 0 });
    const first = tick(state, START + 120 * SEC).release!;
    expect(first).not.toBeNull();
    const releasedAt = first.releasedAt;
    // Freeze almost immediately; the held countdown is ~120 s but a quick unfreeze must still honour the gap.
    expectOk(lifecycle.freezeTrading(state, ctx(releasedAt + 1 * SEC), null));
    state.randomNews.heldRemainingMs = 0;
    expectOk(lifecycle.unfreezeTrading(state, ctx(releasedAt + 5 * SEC)));
    expect(state.randomNews.nextReleaseAt).toBeGreaterThanOrEqual(releasedAt + 120 * SEC);
    expect(tick(state, releasedAt + 119 * SEC).release).toBeNull();
  });

  it("does not need a scheduler tick while frozen once the countdown is held", () => {
    const state = randomEvent({ random: () => 0 });
    expectOk(lifecycle.freezeTrading(state, ctx(START + 10 * SEC), null));
    expect(randomNewsNeedsTick(state, START + 500 * SEC)).toBe(false);
  });
});
