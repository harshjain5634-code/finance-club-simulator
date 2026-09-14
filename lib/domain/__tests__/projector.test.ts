import { describe, expect, it } from "vitest";
import { releaseNews } from "../news";
import { activeTakeover, clearProjectorTakeover, pinProjectorScene, resolveProjectorScene, showProjectorMessage, stepProjectorScene } from "../projector";
import { updateProjector } from "../setup";
import { ctx, expectOk, liveTradingEvent, readyEvent, T0 } from "./helpers";

const NOW = T0 + 60_000;

function liveWithRotation() {
  const state = liveTradingEvent(NOW - 1000);
  state.event.projector.rotation = { anchorScene: "ROUND_STATUS", anchorAt: NOW };
  return state;
}

describe("projector scene resolution", () => {
  it("forces standby before the event and final results after it", () => {
    const ready = readyEvent();
    expect(resolveProjectorScene(ready, NOW).scene).toBe("STANDBY");
    ready.event.status = "COMPLETED";
    expect(resolveProjectorScene(ready, NOW).scene).toBe("FINAL_RESULTS");
  });

  it("rotates deterministically from the shared anchor using scene durations", () => {
    const state = liveWithRotation();
    // Trading round running → standby is excluded; rotation: ROUND_STATUS 12s, LEADERBOARD 20s, MARKET_BOARD 18s, TOP_MOVERS 14s, NEWS_WALL 14s.
    expect(resolveProjectorScene(state, NOW).scene).toBe("ROUND_STATUS");
    expect(resolveProjectorScene(state, NOW + 11_999).scene).toBe("ROUND_STATUS");
    expect(resolveProjectorScene(state, NOW + 12_000).scene).toBe("LEADERBOARD");
    expect(resolveProjectorScene(state, NOW + 32_000).scene).toBe("MARKET_BOARD");
    const cycle = 12_000 + 20_000 + 18_000 + 14_000 + 14_000;
    expect(resolveProjectorScene(state, NOW + cycle + 1).scene).toBe("ROUND_STATUS");
    expect(resolveProjectorScene(state, NOW + 5000).sceneRemainingMs).toBe(7000);
  });

  it("skips the leaderboard when hidden for the projector", () => {
    const state = liveWithRotation();
    state.event.leaderboard.projectorVisibility = "HIDDEN";
    expect(resolveProjectorScene(state, NOW + 12_000).scene).toBe("MARKET_BOARD");
  });

  it("next/previous move the shared rotation and pin/resume hold a scene", () => {
    const state = liveWithRotation();
    expect(expectOk(stepProjectorScene(state, ctx(NOW + 1000), 1))).toBe("LEADERBOARD");
    expect(resolveProjectorScene(state, NOW + 1000).scene).toBe("LEADERBOARD");
    expect(expectOk(stepProjectorScene(state, ctx(NOW + 2000), -1))).toBe("ROUND_STATUS");

    expectOk(pinProjectorScene(state, ctx(NOW + 3000), "NEWS_WALL"));
    expect(resolveProjectorScene(state, NOW + 500_000)).toMatchObject({ scene: "NEWS_WALL", source: "PINNED" });
    expectOk(pinProjectorScene(state, ctx(NOW + 600_000), null));
    expect(resolveProjectorScene(state, NOW + 600_000)).toMatchObject({ scene: "NEWS_WALL", source: "ROTATION" });
  });

  it("a news release starts a takeover and the interrupted scene resumes afterwards", () => {
    const state = liveWithRotation();
    const at = NOW + 5000; // 5s into ROUND_STATUS (12s)
    const release = expectOk(releaseNews(state, ctx(at), "news-01"));
    const takeover = activeTakeover(state, at + 1000);
    expect(takeover?.kind).toBe("NEWS");
    if (takeover?.kind === "NEWS") expect(takeover.release.id).toBe(release.id);

    const seconds = state.event.projector.breakingNewsSeconds * 1000;
    expect(activeTakeover(state, at + seconds + 1)).toBeNull();
    const resumed = resolveProjectorScene(state, at + seconds);
    expect(resumed.scene).toBe("ROUND_STATUS");
    expect(resumed.sceneRemainingMs).toBe(7000);
  });

  it("custom messages can run until cleared and the interrupted scene resumes", () => {
    const state = liveWithRotation();
    expectOk(showProjectorMessage(state, ctx(NOW + 4000), { title: "Round 2 begins in 2 minutes", body: "Get ready", durationSeconds: null }));
    expect(activeTakeover(state, NOW + 3_600_000)).toMatchObject({ kind: "MESSAGE", title: "Round 2 begins in 2 minutes" });
    expectOk(clearProjectorTakeover(state, ctx(NOW + 3_600_000)));
    expect(activeTakeover(state, NOW + 3_600_001)).toBeNull();
    expect(resolveProjectorScene(state, NOW + 3_600_000)).toMatchObject({ scene: "ROUND_STATUS", sceneRemainingMs: 8000 });
  });

  it("clearing a timed takeover early resumes the interrupted scene without extra time", () => {
    const state = liveWithRotation();
    expectOk(releaseNews(state, ctx(NOW + 10_000), "news-01")); // ROUND_STATUS has 2s left
    expectOk(clearProjectorTakeover(state, ctx(NOW + 13_000)));
    expect(resolveProjectorScene(state, NOW + 13_000)).toMatchObject({ scene: "ROUND_STATUS", sceneRemainingMs: 2000 });
    expect(resolveProjectorScene(state, NOW + 15_000).scene).toBe("LEADERBOARD");
  });

  it("a second overlay keeps the original resume point", () => {
    const state = liveWithRotation();
    expectOk(releaseNews(state, ctx(NOW + 6000), "news-01"));
    const seconds = state.event.projector.breakingNewsSeconds * 1000;
    expectOk(releaseNews(state, ctx(NOW + 8000), "news-02"));
    expect(activeTakeover(state, NOW + 8000 + seconds - 1)?.kind).toBe("NEWS");
    expect(resolveProjectorScene(state, NOW + 8000 + seconds)).toMatchObject({ scene: "ROUND_STATUS", sceneRemainingMs: 6000 });
  });

  it("editing scene settings keeps the scene on screen", () => {
    const state = liveWithRotation();
    const scenes = state.event.projector.scenes;
    expectOk(updateProjector(state, ctx(NOW + 15_000), { scenes: scenes.map((s) => (s.scene === "ROUND_STATUS" ? { ...s, durationSeconds: 40 } : s)) }));
    expect(resolveProjectorScene(state, NOW + 15_000)).toMatchObject({ scene: "LEADERBOARD", sceneRemainingMs: 17_000 });
  });
});
