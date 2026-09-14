import { appendAudit } from "./audit";
import { currentRound, deriveMarketState } from "./trading-gate";
import type { EventState, MarketState, NewsRelease, OpContext, OpResult, ProjectorScene, ProjectorSceneSetting, ProjectorTakeover } from "./types";
import { fail, ok } from "./types";

/**
 * Projector scene logic shared by the projector screen and the host preview. Everything is derived from event state
 * plus the clock, so all screens agree on the current scene without any per-screen timers.
 */

export const SCENE_LABEL: Record<ProjectorScene, string> = {
  STANDBY: "Standby",
  ROUND_STATUS: "Round status",
  LEADERBOARD: "Leaderboard",
  MARKET_BOARD: "Market board",
  TOP_MOVERS: "Top movers",
  NEWS_WALL: "News",
  CUSTOM_MESSAGE: "Custom message",
  FINAL_RESULTS: "Final results",
};

/** Scenes that currently take part in rotation (enabled and relevant right now). */
export function projectorRotation(state: EventState, marketState: MarketState): ProjectorSceneSetting[] {
  const { projector, leaderboard } = state.event;
  return projector.scenes
    .filter((s) => s.enabled && s.durationSeconds > 0 && s.scene !== "FINAL_RESULTS")
    .filter((s) => s.scene !== "LEADERBOARD" || leaderboard.projectorVisibility !== "HIDDEN")
    .filter((s) => s.scene !== "STANDBY" || marketState === "BETWEEN_ROUNDS" || marketState === "NOT_STARTED");
}

export type SceneResolution = {
  scene: ProjectorScene;
  source: "PINNED" | "FORCED" | "ROTATION";
  rotation: ProjectorSceneSetting[];
  sceneElapsedMs: number;
  sceneRemainingMs: number | null;
  nextScene: ProjectorScene | null;
};

export function resolveProjectorScene(state: EventState, now: number): SceneResolution {
  const { projector, status } = state.event;
  const marketState = deriveMarketState(state.event, currentRound(state), now);
  const rotation = projectorRotation(state, marketState);
  const none = { rotation, sceneElapsedMs: 0, sceneRemainingMs: null, nextScene: null };

  if (projector.pinnedScene) return { ...none, scene: projector.pinnedScene, source: "PINNED" };
  if (status === "COMPLETED") return { ...none, scene: "FINAL_RESULTS", source: "FORCED" };
  if (status === "DRAFT" || status === "READY") return { ...none, scene: "STANDBY", source: "FORCED" };
  if (rotation.length === 0) return { ...none, scene: "ROUND_STATUS", source: "FORCED" };

  const cycleMs = rotation.reduce((sum, s) => sum + s.durationSeconds * 1000, 0);
  let index = Math.max(0, rotation.findIndex((s) => s.scene === projector.rotation.anchorScene));
  let offset = Math.max(0, now - projector.rotation.anchorAt) % cycleMs;
  while (offset >= rotation[index].durationSeconds * 1000) {
    offset -= rotation[index].durationSeconds * 1000;
    index = (index + 1) % rotation.length;
  }
  return {
    scene: rotation[index].scene,
    source: "ROTATION",
    rotation,
    sceneElapsedMs: offset,
    sceneRemainingMs: rotation[index].durationSeconds * 1000 - offset,
    nextScene: rotation.length > 1 ? rotation[(index + 1) % rotation.length].scene : null,
  };
}

export type ActiveTakeover =
  | { kind: "NEWS"; release: NewsRelease; remainingMs: number; takeover: ProjectorTakeover }
  | { kind: "MESSAGE"; title: string; body: string; remainingMs: number | null; takeover: ProjectorTakeover };

export function activeTakeover(state: EventState, now: number): ActiveTakeover | null {
  const takeover = state.event.projector.takeover;
  if (!takeover) return null;
  const remainingMs = takeover.durationSeconds === null ? null : takeover.startedAt + takeover.durationSeconds * 1000 - now;
  if (remainingMs !== null && remainingMs <= 0) return null;
  if (takeover.kind === "NEWS") {
    const release = state.newsReleases.find((r) => r.id === takeover.releaseId);
    return release ? { kind: "NEWS", release, remainingMs: remainingMs ?? 0, takeover } : null;
  }
  return { kind: "MESSAGE", title: takeover.title, body: takeover.body, remainingMs, takeover };
}

/**
 * Starts an overlay. For a timed overlay the rotation anchor is shifted so the interrupted scene resumes where it left
 * off once the overlay expires — no follow-up write is needed. A replaced overlay hands over its resume point.
 */
export function startTakeover(state: EventState, takeover: ProjectorTakeover, now: number) {
  const projector = state.event.projector;
  const previous = activeTakeover(state, now);
  const current = resolveProjectorScene(state, now);
  const rotating = current.source === "ROTATION";
  const resume = rotating ? (previous?.takeover.resume ?? { scene: current.scene, elapsedMs: current.sceneElapsedMs }) : null;
  if (resume && takeover.durationSeconds !== null) {
    projector.rotation = { anchorScene: resume.scene, anchorAt: now + takeover.durationSeconds * 1000 - resume.elapsedMs };
  }
  projector.takeover = { ...takeover, resume };
}

export function startNewsTakeover(state: EventState, releaseId: string, now: number) {
  startTakeover(state, { kind: "NEWS", releaseId, startedAt: now, durationSeconds: state.event.projector.breakingNewsSeconds }, now);
}

/* ───────────── Host controls ───────────── */

function auditProjector(state: EventState, ctx: OpContext, summary: string) {
  appendAudit(state, { at: ctx.now, actor: ctx.actor, type: "PROJECTOR_UPDATED", summary, refs: {} });
}

export function stepProjectorScene(state: EventState, ctx: OpContext, direction: 1 | -1): OpResult<ProjectorScene> {
  const projector = state.event.projector;
  const current = resolveProjectorScene(state, ctx.now);
  const rotation = current.rotation;
  if (rotation.length === 0) return fail("NO_SCENES", "Enable at least one scene for rotation.");
  const index = rotation.findIndex((s) => s.scene === current.scene);
  const next = rotation[(index === -1 ? (direction === 1 ? 0 : rotation.length - 1) : (index + direction + rotation.length) % rotation.length)].scene;
  projector.pinnedScene = null;
  projector.takeover = null;
  projector.rotation = { anchorScene: next, anchorAt: ctx.now };
  auditProjector(state, ctx, `Projector moved to ${SCENE_LABEL[next]}`);
  return ok(next);
}

export function pinProjectorScene(state: EventState, ctx: OpContext, scene: ProjectorScene | null): OpResult {
  const projector = state.event.projector;
  if (scene === null) {
    const resumeFrom = projector.pinnedScene;
    projector.pinnedScene = null;
    projector.rotation = { anchorScene: resumeFrom, anchorAt: ctx.now };
    auditProjector(state, ctx, "Projector returned to automatic rotation");
    return ok();
  }
  projector.pinnedScene = scene;
  projector.takeover = null;
  auditProjector(state, ctx, `Projector pinned to ${SCENE_LABEL[scene]}`);
  return ok();
}

export function showLatestNewsOnProjector(state: EventState, ctx: OpContext): OpResult<NewsRelease> {
  const latest = [...state.newsReleases].sort((a, b) => b.releasedAt - a.releasedAt)[0];
  if (!latest) return fail("NO_NEWS", "No news has been released yet.");
  startNewsTakeover(state, latest.id, ctx.now);
  auditProjector(state, ctx, `Projector replayed breaking news: ${latest.headline}`);
  return ok(latest);
}

export function showProjectorMessage(state: EventState, ctx: OpContext, input: { title: string; body: string; durationSeconds: number | null }): OpResult {
  const title = input.title.trim();
  if (title.length < 2) return fail("INVALID", "Enter a message title.");
  state.event.projector.customMessage = { title, body: input.body.trim() };
  startTakeover(state, { kind: "MESSAGE", title, body: input.body.trim(), startedAt: ctx.now, durationSeconds: input.durationSeconds }, ctx.now);
  auditProjector(state, ctx, `Projector message shown: ${title}`);
  return ok();
}

export function clearProjectorTakeover(state: EventState, ctx: OpContext): OpResult {
  const projector = state.event.projector;
  const active = activeTakeover(state, ctx.now);
  projector.takeover = null;
  if (!active) return ok();
  // Resume the interrupted scene with the time it had already been on screen.
  const resume = active.takeover.resume;
  if (resume && !projector.pinnedScene) projector.rotation = { anchorScene: resume.scene, anchorAt: ctx.now - resume.elapsedMs };
  auditProjector(state, ctx, "Projector overlay cleared");
  return ok();
}

/** Keeps the scene currently on screen (and its elapsed time) when the scene list is edited. */
export function preserveRotationOnSceneEdit(state: EventState, now: number, applyEdit: () => void) {
  const before = resolveProjectorScene(state, now);
  const takeover = activeTakeover(state, now);
  applyEdit();
  if (before.source !== "ROTATION" || takeover) return;
  const after = projectorRotation(state, deriveMarketState(state.event, currentRound(state), now));
  if (after.some((s) => s.scene === before.scene)) {
    state.event.projector.rotation = { anchorScene: before.scene, anchorAt: now - before.sceneElapsedMs };
  }
}
