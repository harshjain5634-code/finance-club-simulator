import { formatClock } from "../format";
import { appendAudit } from "./audit";
import { releaseNewsManually } from "./random-news";
import type { EventState, NewsItem, NewsRelease, OpContext, OpResult } from "./types";
import { fail, ok } from "./types";

/**
 * Manual news scheduling (C4 news desk). The host picks a Ready story and a clock time; the scheduler releases it
 * then, exactly like a manual release (same price impacts, projector takeover and audit), with the planned time
 * recorded on the release. Rules:
 * - only Ready, unreleased stories; the time must be at least 10 s ahead and within 6 hours
 * - a story the random scheduler has already picked can't also be scheduled by hand
 * - two scheduled stories must be at least 30 s apart, so teams can read each one
 * - while the event is paused or trading is frozen, due stories are held and go out after (marked late)
 * - scheduled stories are excluded from the random pool
 */

export const SCHEDULE_LIMITS = { minLeadMs: 10_000, maxLeadMs: 6 * 3600_000, minSpacingMs: 30_000 } as const;

export function scheduledStories(state: EventState): NewsItem[] {
  return state.news.filter((n) => n.status === "READY" && !n.releaseId && n.scheduledFor != null).sort((a, b) => a.scheduledFor! - b.scheduledFor!);
}

export function validateSchedule(state: EventState, newsItemId: string, at: number, now: number): string | null {
  const item = state.news.find((n) => n.id === newsItemId);
  if (!item) return "News item not found.";
  if (item.status === "RELEASED" || item.releaseId) return "This story was already released.";
  if (item.status !== "READY") return "Only stories marked Ready can be scheduled.";
  if (state.event.status === "COMPLETED") return "The event has ended.";
  if (!Number.isFinite(at)) return "Choose a valid time.";
  if (at < now + SCHEDULE_LIMITS.minLeadMs) return "Choose a time at least 10 seconds from now.";
  if (at > now + SCHEDULE_LIMITS.maxLeadMs) return "Choose a time within the next 6 hours.";
  if (state.randomNews.status === "RUNNING" && state.randomNews.scheduledNewsId === newsItemId) {
    return "Random news has already picked this story. Skip it there, or take it out of the random pool first.";
  }
  const clash = scheduledStories(state).find((other) => other.id !== newsItemId && Math.abs(other.scheduledFor! - at) < SCHEDULE_LIMITS.minSpacingMs);
  if (clash) return `News #${clash.number} is scheduled at ${formatClock(clash.scheduledFor!, true)}. Keep at least 30 seconds between scheduled stories.`;
  return null;
}

export function scheduleNewsRelease(state: EventState, ctx: OpContext, newsItemId: string, at: number): OpResult<NewsItem> {
  const error = validateSchedule(state, newsItemId, at, ctx.now);
  if (error) return fail("INVALID_SCHEDULE", error);
  const item = state.news.find((n) => n.id === newsItemId)!;
  const before = item.scheduledFor ?? null;
  item.scheduledFor = at;
  item.updatedAt = ctx.now;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "NEWS_SCHEDULED",
    summary: `News #${item.number} scheduled for ${formatClock(at, true)}${before ? ` (was ${formatClock(before, true)})` : ""}`,
    before: before ? { scheduledFor: before } : null,
    after: { scheduledFor: at },
    refs: { newsItemId: item.id },
  });
  return ok(item);
}

export function unscheduleNewsRelease(state: EventState, ctx: OpContext, newsItemId: string, reason: string | null = null): OpResult<NewsItem> {
  const item = state.news.find((n) => n.id === newsItemId);
  if (!item) return fail("NOT_FOUND", "News item not found.");
  if (item.scheduledFor == null) return ok(item);
  const before = item.scheduledFor;
  item.scheduledFor = null;
  item.updatedAt = ctx.now;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "NEWS_UNSCHEDULED",
    summary: `Schedule for news #${item.number} cancelled (was ${formatClock(before, true)})`,
    reason,
    before: { scheduledFor: before },
    after: { scheduledFor: null },
    refs: { newsItemId: item.id },
  });
  return ok(item);
}

/** Why due stories are waiting right now, or null when they may go out. */
export function scheduleHold(state: EventState): "EVENT_NOT_LIVE" | "TRADING_FROZEN" | null {
  if (state.event.status !== "LIVE") return "EVENT_NOT_LIVE";
  if (state.event.tradingFrozen) return "TRADING_FROZEN";
  return null;
}

export function scheduledNewsNeedsTick(state: EventState, now: number): boolean {
  if (scheduleHold(state)) return false;
  return scheduledStories(state).some((n) => n.scheduledFor! <= now);
}

/** Releases at most one due story per call (the earliest), so a backlog after a freeze goes out one tick apart. */
export function tickScheduledNews(state: EventState, ctx: OpContext): NewsRelease | null {
  if (scheduleHold(state)) return null;
  const due = scheduledStories(state).find((n) => n.scheduledFor! <= ctx.now);
  if (!due) return null;
  const scheduledFor = due.scheduledFor!;
  const result = releaseNewsManually(state, { ...ctx, actor: { type: "SYSTEM", name: "Scheduled news" } }, due.id, { scheduledFor });
  if (!result.ok) {
    unscheduleNewsRelease(state, { ...ctx, actor: { type: "SYSTEM", name: "Scheduled news" } }, due.id, `Could not release: ${result.message}`);
    return null;
  }
  return result.value;
}
