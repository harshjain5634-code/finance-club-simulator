import { describe, expect, it } from "vitest";
import * as lifecycle from "../lifecycle";
import { scheduledNewsNeedsTick, scheduleNewsRelease, tickScheduledNews, unscheduleNewsRelease, validateSchedule } from "../news-schedule";
import { eligibleRandomStories, setRandomNewsMode, startRandomNews } from "../random-news";
import { saveNewsItem } from "../setup";
import { currentRound } from "../trading-gate";
import { ctx, expectOk, liveTradingEvent, T0 } from "./helpers";

const START = T0 + 10_000;
const SEC = 1000;

function event() {
  const state = liveTradingEvent(START - 1000);
  currentRound(state)!.endsAt = START + 3600 * SEC;
  return state;
}

describe("manual news scheduling", () => {
  it("releases a scheduled story once, at its time, recording the planned time", () => {
    const state = event();
    const item = expectOk(scheduleNewsRelease(state, ctx(START), "news-01", START + 60 * SEC));
    expect(item.status).toBe("READY");
    expect(item.scheduledFor).toBe(START + 60 * SEC);
    expect(state.audit.at(-1)).toMatchObject({ type: "NEWS_SCHEDULED", refs: { newsItemId: "news-01" } });

    expect(scheduledNewsNeedsTick(state, START + 59 * SEC)).toBe(false);
    expect(tickScheduledNews(state, ctx(START + 59 * SEC))).toBeNull();
    expect(scheduledNewsNeedsTick(state, START + 60 * SEC)).toBe(true);

    const release = tickScheduledNews(state, ctx(START + 60 * SEC))!;
    expect(release).toMatchObject({ newsItemId: "news-01", source: "MANUAL", scheduledFor: START + 60 * SEC, releasedAt: START + 60 * SEC });
    expect(release.releasedBy).toEqual({ type: "SYSTEM", name: "Scheduled news" });
    expect(state.news.find((n) => n.id === "news-01")).toMatchObject({ status: "RELEASED", scheduledFor: null });

    // A second tick (e.g. a duplicate scheduler run) releases nothing more.
    expect(tickScheduledNews(state, ctx(START + 61 * SEC))).toBeNull();
    expect(state.newsReleases.filter((r) => r.newsItemId === "news-01")).toHaveLength(1);
  });

  it("validates time, status, spacing and random-news conflicts", () => {
    const state = event();
    expect(validateSchedule(state, "news-01", START - 1, START)).toMatch(/at least 10 seconds/);
    expect(validateSchedule(state, "news-01", START + 7 * 3600 * SEC, START)).toMatch(/6 hours/);
    expect(validateSchedule(state, "missing", START + 60 * SEC, START)).toMatch(/not found/);

    const draft = state.news.find((n) => n.id === "news-02")!;
    draft.status = "DRAFT";
    expect(validateSchedule(state, "news-02", START + 60 * SEC, START)).toMatch(/Ready/);

    expectOk(scheduleNewsRelease(state, ctx(START), "news-01", START + 60 * SEC));
    expect(validateSchedule(state, "news-03", START + 75 * SEC, START)).toMatch(/30 seconds/);
    expect(validateSchedule(state, "news-03", START + 90 * SEC, START)).toBeNull();
    // Rescheduling the same story next to its own old time is fine.
    expect(validateSchedule(state, "news-01", START + 70 * SEC, START)).toBeNull();

    const result = scheduleNewsRelease(state, ctx(START), "news-03", START + 75 * SEC);
    expect(result.ok).toBe(false);
  });

  it("refuses a story the random scheduler already picked, and removes scheduled stories from the random pool", () => {
    const state = event();
    expectOk(setRandomNewsMode(state, ctx(START), "RANDOM"));
    expectOk(startRandomNews(state, ctx(START, undefined, () => 0)));
    const picked = state.randomNews.scheduledNewsId!;
    expect(validateSchedule(state, picked, START + 60 * SEC, START)).toMatch(/Random news has already picked/);

    const other = eligibleRandomStories(state).find((n) => n.id !== picked)!;
    expectOk(scheduleNewsRelease(state, ctx(START), other.id, START + 60 * SEC));
    expect(eligibleRandomStories(state).some((n) => n.id === other.id)).toBe(false);
  });

  it("holds due stories while trading is frozen or the event is paused, then releases them late", () => {
    const state = event();
    expectOk(scheduleNewsRelease(state, ctx(START), "news-01", START + 60 * SEC));
    expectOk(lifecycle.freezeTrading(state, ctx(START + 30 * SEC), null));
    expect(scheduledNewsNeedsTick(state, START + 90 * SEC)).toBe(false);
    expect(tickScheduledNews(state, ctx(START + 90 * SEC))).toBeNull();
    expect(state.newsReleases).toHaveLength(0);

    expectOk(lifecycle.unfreezeTrading(state, ctx(START + 120 * SEC)));
    expectOk(lifecycle.pauseEvent(state, ctx(START + 121 * SEC)));
    expect(tickScheduledNews(state, ctx(START + 122 * SEC))).toBeNull();
    expectOk(lifecycle.resumeEvent(state, ctx(START + 130 * SEC)));

    const release = tickScheduledNews(state, ctx(START + 131 * SEC))!;
    expect(release.scheduledFor).toBe(START + 60 * SEC);
    expect(release.releasedAt).toBe(START + 131 * SEC);
  });

  it("releases a backlog one story per tick", () => {
    const state = event();
    expectOk(scheduleNewsRelease(state, ctx(START), "news-01", START + 60 * SEC));
    expectOk(scheduleNewsRelease(state, ctx(START), "news-02", START + 100 * SEC));
    expectOk(lifecycle.freezeTrading(state, ctx(START + 30 * SEC), null));
    expectOk(lifecycle.unfreezeTrading(state, ctx(START + 200 * SEC)));
    expect(tickScheduledNews(state, ctx(START + 200 * SEC))!.newsItemId).toBe("news-01");
    expect(tickScheduledNews(state, ctx(START + 201 * SEC))!.newsItemId).toBe("news-02");
    expect(tickScheduledNews(state, ctx(START + 202 * SEC))).toBeNull();
  });

  it("cancels a schedule on unschedule, skip, or moving the story back to draft", () => {
    const state = event();
    expectOk(scheduleNewsRelease(state, ctx(START), "news-01", START + 60 * SEC));
    expectOk(unscheduleNewsRelease(state, ctx(START + 1000), "news-01"));
    expect(state.news.find((n) => n.id === "news-01")!.scheduledFor).toBeNull();
    expect(state.audit.at(-1)).toMatchObject({ type: "NEWS_UNSCHEDULED" });
    expect(tickScheduledNews(state, ctx(START + 60 * SEC))).toBeNull();

    expectOk(scheduleNewsRelease(state, ctx(START), "news-02", START + 60 * SEC));
    const item = state.news.find((n) => n.id === "news-02")!;
    expectOk(
      saveNewsItem(state, ctx(START + 2000), item.id, {
        headline: item.headline,
        body: item.body,
        roundId: item.roundId,
        priority: item.priority,
        status: "DRAFT",
        impacts: item.impacts.map(({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing }) => ({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing })),
      }),
    );
    expect(state.news.find((n) => n.id === "news-02")!.scheduledFor).toBeNull();
  });
});
