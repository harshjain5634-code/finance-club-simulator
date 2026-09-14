import { formatClock, formatGapRange } from "../format";
import { appendAudit } from "./audit";
import { nextId } from "./ids";
import { releaseNews } from "./news";
import { currentRound, roundRemainingMs } from "./trading-gate";
import type { EventState, NewsItem, NewsRelease, OpContext, OpResult, RandomNewsState } from "./types";
import { fail, ok } from "./types";

/**
 * Random news release mode. The host chooses the eligible pool and a [min, max] gap; the scheduler picks one
 * unused eligible story at a time and releases it at a random moment inside the gap. Safety rules:
 * - never two releases closer than minGapSeconds (measured from the latest release of any kind)
 * - only while the event is live and the round is running (and matches the eligible round)
 * - only stories that are READY, unreleased, in the pool, and within the per-round limit
 * - exactly one scheduled release at a time; the schedule is held while blocked or paused
 */

export const RANDOM_NEWS_LIMITS = { minGap: 30, maxGap: 3600, maxPerRound: 50 } as const;

export function defaultRandomNewsState(): RandomNewsState {
  return {
    mode: "MANUAL",
    status: "STOPPED",
    roundScope: "CURRENT",
    includeUnassigned: true,
    excludedNewsIds: [],
    minGapSeconds: 120,
    maxGapSeconds: 300,
    maxPerRound: 3,
    nextReleaseAt: null,
    scheduledNewsId: null,
    scheduledRoundId: null,
    heldRemainingMs: null,
    log: [],
  };
}

export function lastNewsReleaseAt(state: EventState): number | null {
  return state.newsReleases.reduce<number | null>((latest, r) => (latest === null || r.releasedAt > latest ? r.releasedAt : latest), null);
}

export function randomReleasesInRound(state: EventState, roundId: string): number {
  return state.newsReleases.filter((r) => r.source === "RANDOM" && r.roundId === roundId).length;
}

export type BlockReason = "EVENT_NOT_LIVE" | "NO_RUNNING_ROUND" | "ROUND_NOT_ELIGIBLE";

export function blockReason(state: EventState, now: number): BlockReason | null {
  if (state.event.status !== "LIVE") return "EVENT_NOT_LIVE";
  const round = currentRound(state);
  if (!round || round.status !== "RUNNING" || roundRemainingMs(round, now) <= 0) return "NO_RUNNING_ROUND";
  const scope = state.randomNews.roundScope;
  if (scope !== "CURRENT" && scope !== round.id) return "ROUND_NOT_ELIGIBLE";
  return null;
}

/** Stories the scheduler may pick for the running round, in library order. */
export function eligibleRandomStories(state: EventState): NewsItem[] {
  const round = currentRound(state);
  if (!round) return [];
  const settings = state.randomNews;
  return state.news
    .filter((item) => item.status === "READY" && !item.releaseId)
    .filter((item) => !settings.excludedNewsIds.includes(item.id))
    .filter((item) => item.roundId === round.id || (settings.includeUnassigned && item.roundId === null))
    .sort((a, b) => a.number - b.number);
}

function randomGapMs(settings: RandomNewsState, random: () => number): number {
  const min = settings.minGapSeconds * 1000;
  const max = settings.maxGapSeconds * 1000;
  return Math.round(min + random() * (max - min));
}

function clearSchedule(settings: RandomNewsState) {
  settings.nextReleaseAt = null;
  settings.scheduledNewsId = null;
  settings.scheduledRoundId = null;
  settings.heldRemainingMs = null;
}

function pickStory(state: EventState, random: () => number, avoidId: string | null): NewsItem | null {
  const eligible = eligibleRandomStories(state);
  const preferred = eligible.length > 1 && avoidId ? eligible.filter((i) => i.id !== avoidId) : eligible;
  if (preferred.length === 0) return null;
  return preferred[Math.min(preferred.length - 1, Math.floor(random() * preferred.length))];
}

/** Schedules the next release at now + random gap, never earlier than lastRelease + minGap. */
function scheduleNext(state: EventState, ctx: OpContext, avoidId: string | null = null): boolean {
  const settings = state.randomNews;
  const round = currentRound(state);
  if (!round) return false;
  if (randomReleasesInRound(state, round.id) >= settings.maxPerRound) {
    clearSchedule(settings);
    return false;
  }
  const story = pickStory(state, ctx.random, avoidId);
  if (!story) {
    clearSchedule(settings);
    return false;
  }
  const last = lastNewsReleaseAt(state);
  const earliest = last === null ? ctx.now : last + settings.minGapSeconds * 1000;
  settings.nextReleaseAt = Math.max(ctx.now + randomGapMs(settings, ctx.random), earliest);
  settings.scheduledNewsId = story.id;
  settings.scheduledRoundId = round.id;
  settings.heldRemainingMs = null;
  appendAudit(state, {
    at: ctx.now,
    actor: { type: "SYSTEM", name: "Random news" },
    type: "NEWS_RANDOM_SCHEDULED",
    summary: `Random news #${story.number} scheduled for ${formatClock(settings.nextReleaseAt, true)}`,
    after: { newsItemId: story.id, scheduledFor: settings.nextReleaseAt },
    refs: { newsItemId: story.id },
  });
  return true;
}

function logEntry(state: EventState, entry: Omit<(typeof state.randomNews.log)[number], "id">) {
  state.randomNews.log.push({ id: nextId(state, "RNL", 800), ...entry });
  if (state.randomNews.log.length > 200) state.randomNews.log.splice(0, state.randomNews.log.length - 200);
}

export type RandomTickResult = { changed: boolean; release: NewsRelease | null };

/**
 * Advances the random scheduler at ctx.now. Idempotent for a given state/time: at most one release per call,
 * and a release only happens when the schedule is due AND the minimum gap since the last release has passed.
 */
export function tickRandomNews(state: EventState, ctx: OpContext): RandomTickResult {
  const settings = state.randomNews;
  if (settings.mode !== "RANDOM" || settings.status !== "RUNNING") return { changed: false, release: null };

  const blocked = blockReason(state, ctx.now);
  if (blocked) {
    if (settings.nextReleaseAt !== null) {
      settings.heldRemainingMs = Math.max(0, settings.nextReleaseAt - ctx.now);
      settings.nextReleaseAt = null;
      return { changed: true, release: null };
    }
    return { changed: false, release: null };
  }

  const round = currentRound(state)!;
  if (settings.scheduledRoundId !== null && settings.scheduledRoundId !== round.id) {
    clearSchedule(settings);
  }

  if (randomReleasesInRound(state, round.id) >= settings.maxPerRound) {
    if (settings.scheduledNewsId || settings.nextReleaseAt !== null || settings.heldRemainingMs !== null) {
      clearSchedule(settings);
      return { changed: true, release: null };
    }
    return { changed: false, release: null };
  }

  const eligible = eligibleRandomStories(state);
  const scheduledStillEligible = !!settings.scheduledNewsId && eligible.some((i) => i.id === settings.scheduledNewsId);

  if (settings.nextReleaseAt === null) {
    if (settings.heldRemainingMs !== null && scheduledStillEligible) {
      const last = lastNewsReleaseAt(state);
      const earliest = last === null ? ctx.now : last + settings.minGapSeconds * 1000;
      settings.nextReleaseAt = Math.max(ctx.now + settings.heldRemainingMs, earliest);
      settings.heldRemainingMs = null;
      return { changed: true, release: null };
    }
    const scheduled = scheduleNext(state, ctx);
    return { changed: scheduled, release: null };
  }

  if (!scheduledStillEligible) {
    const story = pickStory(state, ctx.random, settings.scheduledNewsId);
    if (!story) {
      clearSchedule(settings);
      return { changed: true, release: null };
    }
    settings.scheduledNewsId = story.id;
    return { changed: true, release: null };
  }

  const last = lastNewsReleaseAt(state);
  const gapSatisfied = last === null || ctx.now - last >= settings.minGapSeconds * 1000;
  if (ctx.now < settings.nextReleaseAt || !gapSatisfied) return { changed: false, release: null };

  const scheduledFor = settings.nextReleaseAt;
  const storyId = settings.scheduledNewsId!;
  const result = releaseNews(state, { ...ctx, actor: { type: "SYSTEM", name: "Random news" } }, storyId, { source: "RANDOM", scheduledFor });
  if (!result.ok) {
    clearSchedule(settings);
    return { changed: true, release: null };
  }
  logEntry(state, { newsItemId: storyId, roundId: round.id, scheduledFor, at: ctx.now, outcome: "RELEASED", releaseId: result.value.id });
  clearSchedule(settings);
  scheduleNext(state, ctx);
  return { changed: true, release: result.value };
}

/** Manual host release: keeps the random schedule consistent with the minimum gap. */
export function releaseNewsManually(state: EventState, ctx: OpContext, newsItemId: string): OpResult<NewsRelease> {
  const result = releaseNews(state, ctx, newsItemId);
  if (!result.ok) return result;
  const settings = state.randomNews;
  if (settings.mode === "RANDOM" && settings.status === "RUNNING") {
    if (settings.nextReleaseAt !== null && settings.nextReleaseAt < ctx.now + settings.minGapSeconds * 1000) {
      clearSchedule(settings);
      if (!blockReason(state, ctx.now)) scheduleNext(state, ctx);
    } else if (settings.scheduledNewsId === newsItemId) {
      settings.scheduledNewsId = pickStory(state, ctx.random, null)?.id ?? null;
      if (!settings.scheduledNewsId) clearSchedule(settings);
    }
  }
  return result;
}

/* ───────────── Host controls ───────────── */

export type RandomNewsSettingsInput = Partial<Pick<RandomNewsState, "roundScope" | "includeUnassigned" | "excludedNewsIds" | "minGapSeconds" | "maxGapSeconds" | "maxPerRound">>;

export function validateRandomSettings(settings: Pick<RandomNewsState, "minGapSeconds" | "maxGapSeconds" | "maxPerRound">): string | null {
  if (!Number.isInteger(settings.minGapSeconds) || settings.minGapSeconds < RANDOM_NEWS_LIMITS.minGap) return `Minimum gap must be at least ${RANDOM_NEWS_LIMITS.minGap} seconds.`;
  if (!Number.isInteger(settings.maxGapSeconds) || settings.maxGapSeconds > RANDOM_NEWS_LIMITS.maxGap) return "Maximum gap must be at most 60 minutes.";
  if (settings.maxGapSeconds < settings.minGapSeconds) return "Maximum gap must be greater than or equal to the minimum gap.";
  if (!Number.isInteger(settings.maxPerRound) || settings.maxPerRound < 1 || settings.maxPerRound > RANDOM_NEWS_LIMITS.maxPerRound) return "Stories per round must be between 1 and 50.";
  return null;
}

function audit(state: EventState, ctx: OpContext, type: Parameters<typeof appendAudit>[1]["type"], summary: string, extra: Partial<Parameters<typeof appendAudit>[1]> = {}) {
  appendAudit(state, { at: ctx.now, actor: ctx.actor, type, summary, refs: {}, ...extra });
}

export function setRandomNewsMode(state: EventState, ctx: OpContext, mode: RandomNewsState["mode"]): OpResult {
  const settings = state.randomNews;
  if (settings.mode === mode) return ok();
  settings.mode = mode;
  settings.status = "STOPPED";
  clearSchedule(settings);
  state.event.newsMode = mode === "RANDOM" ? "AUTOMATIC" : "MANUAL";
  audit(state, ctx, "NEWS_RANDOM_MODE_CHANGED", `News release mode set to ${mode === "RANDOM" ? "random" : "manual"}`, { after: { mode } });
  return ok();
}

export function updateRandomNewsSettings(state: EventState, ctx: OpContext, input: RandomNewsSettingsInput): OpResult {
  const settings = state.randomNews;
  const next = { ...settings, ...input };
  const error = validateRandomSettings(next);
  if (error) return fail("INVALID", error);
  if (next.roundScope !== "CURRENT" && !state.rounds.some((r) => r.id === next.roundScope)) return fail("INVALID", "Choose a valid round.");
  const before = { minGapSeconds: settings.minGapSeconds, maxGapSeconds: settings.maxGapSeconds, maxPerRound: settings.maxPerRound, roundScope: settings.roundScope };
  Object.assign(settings, input);
  if (settings.status === "RUNNING" && settings.nextReleaseAt !== null && !blockReason(state, ctx.now)) {
    clearSchedule(settings);
    scheduleNext(state, ctx);
  }
  audit(state, ctx, "NEWS_RANDOM_SETTINGS_UPDATED", `Random news: every ${formatGapRange(settings.minGapSeconds, settings.maxGapSeconds)}, max ${settings.maxPerRound} per round`, {
    before,
    after: { minGapSeconds: settings.minGapSeconds, maxGapSeconds: settings.maxGapSeconds, maxPerRound: settings.maxPerRound, roundScope: settings.roundScope },
  });
  return ok();
}

export function startRandomNews(state: EventState, ctx: OpContext): OpResult {
  const settings = state.randomNews;
  const error = validateRandomSettings(settings);
  if (error) return fail("INVALID", error);
  if (state.event.status === "COMPLETED") return fail("COMPLETED", "The event has ended.");
  settings.mode = "RANDOM";
  state.event.newsMode = "AUTOMATIC";
  if (settings.status === "RUNNING") return ok();
  settings.status = "RUNNING";
  clearSchedule(settings);
  audit(state, ctx, "NEWS_RANDOM_STARTED", `Random news started (every ${formatGapRange(settings.minGapSeconds, settings.maxGapSeconds)}, max ${settings.maxPerRound} per round)`);
  tickRandomNews(state, ctx);
  return ok();
}

export function pauseRandomNews(state: EventState, ctx: OpContext): OpResult {
  const settings = state.randomNews;
  if (settings.status !== "RUNNING") return fail("NOT_RUNNING", "Random news is not running.");
  settings.status = "PAUSED";
  if (settings.nextReleaseAt !== null) {
    settings.heldRemainingMs = Math.max(0, settings.nextReleaseAt - ctx.now);
    settings.nextReleaseAt = null;
  }
  audit(state, ctx, "NEWS_RANDOM_PAUSED", "Random news paused by host");
  return ok();
}

export function resumeRandomNews(state: EventState, ctx: OpContext): OpResult {
  const settings = state.randomNews;
  if (settings.status !== "PAUSED") return fail("NOT_PAUSED", "Random news is not paused.");
  settings.status = "RUNNING";
  audit(state, ctx, "NEWS_RANDOM_RESUMED", "Random news resumed");
  tickRandomNews(state, ctx);
  return ok();
}

export function stopRandomNews(state: EventState, ctx: OpContext): OpResult {
  const settings = state.randomNews;
  if (settings.status === "STOPPED") return ok();
  settings.status = "STOPPED";
  clearSchedule(settings);
  audit(state, ctx, "NEWS_RANDOM_STOPPED", "Random news stopped");
  return ok();
}

export function skipScheduledRandomNews(state: EventState, ctx: OpContext): OpResult {
  const settings = state.randomNews;
  if (settings.status !== "RUNNING" || !settings.scheduledNewsId) return fail("NOTHING_SCHEDULED", "No random story is scheduled.");
  const skippedId = settings.scheduledNewsId;
  const item = state.news.find((n) => n.id === skippedId);
  logEntry(state, { newsItemId: skippedId, roundId: settings.scheduledRoundId, scheduledFor: settings.nextReleaseAt ?? ctx.now, at: ctx.now, outcome: "SKIPPED", releaseId: null });
  audit(state, ctx, "NEWS_RANDOM_SKIPPED", `Skipped scheduled random story #${item?.number ?? "?"}`, { refs: { newsItemId: skippedId } });
  clearSchedule(settings);
  if (!blockReason(state, ctx.now)) scheduleNext(state, ctx, skippedId);
  return ok();
}

/** Host override: release the scheduled (or next eligible) story immediately, then reschedule. */
export function releaseRandomNow(state: EventState, ctx: OpContext): OpResult<NewsRelease> {
  const settings = state.randomNews;
  const blocked = blockReason(state, ctx.now);
  if (blocked === "EVENT_NOT_LIVE") return fail("EVENT_NOT_LIVE", "The event must be live to release news.");
  const storyId = settings.scheduledNewsId && eligibleRandomStories(state).some((i) => i.id === settings.scheduledNewsId) ? settings.scheduledNewsId : pickStory(state, ctx.random, null)?.id;
  if (!storyId) return fail("NO_STORIES", "No eligible story is available for this round.");
  const scheduledFor = settings.nextReleaseAt ?? ctx.now;
  const result = releaseNews(state, ctx, storyId, { source: "RANDOM", scheduledFor });
  if (!result.ok) return result;
  logEntry(state, { newsItemId: storyId, roundId: state.event.currentRoundId, scheduledFor, at: ctx.now, outcome: "RELEASED_EARLY", releaseId: result.value.id });
  clearSchedule(settings);
  if (settings.status === "RUNNING" && !blockReason(state, ctx.now)) scheduleNext(state, ctx);
  return result;
}

export function toggleRandomPool(state: EventState, ctx: OpContext, newsItemId: string, included: boolean): OpResult {
  const settings = state.randomNews;
  const excluded = new Set(settings.excludedNewsIds);
  if (included) excluded.delete(newsItemId);
  else excluded.add(newsItemId);
  settings.excludedNewsIds = [...excluded];
  if (!included && settings.scheduledNewsId === newsItemId) {
    settings.scheduledNewsId = pickStory(state, ctx.random, newsItemId)?.id ?? null;
    if (!settings.scheduledNewsId) clearSchedule(settings);
  }
  return ok();
}

/** Cheap check used by the scheduler loop so it only opens a transaction when there is work to do. */
export function randomNewsNeedsTick(state: EventState, now: number): boolean {
  const settings = state.randomNews;
  if (settings.mode !== "RANDOM" || settings.status !== "RUNNING") return false;
  if (blockReason(state, now)) return settings.nextReleaseAt !== null;
  const round = currentRound(state)!;
  if (settings.scheduledRoundId !== null && settings.scheduledRoundId !== round.id) return true;
  if (randomReleasesInRound(state, round.id) >= settings.maxPerRound) {
    return settings.scheduledNewsId !== null || settings.nextReleaseAt !== null || settings.heldRemainingMs !== null;
  }
  const eligible = eligibleRandomStories(state);
  if (settings.nextReleaseAt === null) return eligible.length > 0;
  if (!settings.scheduledNewsId || !eligible.some((i) => i.id === settings.scheduledNewsId)) return true;
  if (now < settings.nextReleaseAt) return false;
  const last = lastNewsReleaseAt(state);
  return last === null || now - last >= settings.minGapSeconds * 1000;
}

/* ───────────── View model ───────────── */

export type RandomNewsPhase = "OFF" | "STOPPED" | "PAUSED" | "BLOCKED" | "SCHEDULED" | "LIMIT_REACHED" | "NO_STORIES";

export type RandomNewsView = {
  phase: RandomNewsPhase;
  message: string;
  nextReleaseAt: number | null;
  remainingMs: number | null;
  scheduledItem: NewsItem | null;
  releasedThisRound: number;
  eligibleCount: number;
};

export function randomNewsView(state: EventState, now: number): RandomNewsView {
  const settings = state.randomNews;
  const round = currentRound(state);
  const releasedThisRound = round ? randomReleasesInRound(state, round.id) : 0;
  const eligibleCount = eligibleRandomStories(state).length;
  const scheduledItem = state.news.find((n) => n.id === settings.scheduledNewsId) ?? null;
  const base = { nextReleaseAt: settings.nextReleaseAt, remainingMs: settings.nextReleaseAt !== null ? Math.max(0, settings.nextReleaseAt - now) : settings.heldRemainingMs, scheduledItem, releasedThisRound, eligibleCount };

  if (settings.mode === "MANUAL") return { ...base, phase: "OFF", message: "Manual mode: release stories yourself." };
  if (settings.status === "STOPPED") return { ...base, phase: "STOPPED", message: "Random mode is ready. Start it to schedule stories automatically." };
  if (settings.status === "PAUSED") return { ...base, phase: "PAUSED", message: "Paused by host. The countdown is held." };
  const blocked = blockReason(state, now);
  if (blocked === "EVENT_NOT_LIVE") return { ...base, phase: "BLOCKED", message: state.event.status === "PAUSED" ? "Waiting: the event is paused." : "Waiting for the event to go live." };
  if (blocked === "NO_RUNNING_ROUND") return { ...base, phase: "BLOCKED", message: "Waiting for a running round." };
  if (blocked === "ROUND_NOT_ELIGIBLE") return { ...base, phase: "BLOCKED", message: "Waiting for the eligible round." };
  if (round && releasedThisRound >= settings.maxPerRound) return { ...base, phase: "LIMIT_REACHED", message: `Round limit reached (${settings.maxPerRound} stories).` };
  if (eligibleCount === 0) return { ...base, phase: "NO_STORIES", message: "No eligible unreleased stories for this round." };
  return { ...base, phase: "SCHEDULED", message: settings.nextReleaseAt !== null ? "Next story scheduled." : "Scheduling…" };
}
