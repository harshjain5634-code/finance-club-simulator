import { appendAudit } from "./audit";
import { nextId } from "./ids";
import { round2 } from "./money";
import { applyPercent, applyPriceRules, limitsFor, recordPriceChange } from "./prices";
import { recordValuation } from "./portfolio";
import type {
  ConfiguredImpact,
  EventState,
  NewsImpact,
  NewsItem,
  NewsRelease,
  NewsReleaseSource,
  OpContext,
  OpResult,
  Paise,
  ResolvedImpact,
} from "./types";
import { fail, ok } from "./types";

export function configuredImpactOf(impact: NewsImpact): ConfiguredImpact {
  const sign = impact.direction === "UP" ? 1 : -1;
  if (impact.mode === "FIXED") return { kind: "NEWS_FIXED", pct: sign * (impact.fixedPct ?? 0) };
  const min = sign * (impact.minPct ?? 0);
  const max = sign * (impact.maxPct ?? 0);
  return { kind: "NEWS_RANGE", minPct: Math.min(min, max), maxPct: Math.max(min, max) };
}

export function validateImpact(impact: NewsImpact): string | null {
  if (impact.mode === "FIXED") {
    if (impact.fixedPct === null || !(impact.fixedPct > 0) || impact.fixedPct > 100) return "Fixed impact must be between 0 and 100%.";
  } else {
    if (impact.minPct === null || impact.maxPct === null) return "Range impact needs a minimum and maximum.";
    if (!(impact.minPct >= 0) || !(impact.maxPct > 0) || impact.maxPct > 100) return "Range values must be between 0 and 100%.";
    if (impact.minPct > impact.maxPct) return "Range minimum must not exceed the maximum.";
  }
  return null;
}

export function validateNewsItem(item: Pick<NewsItem, "headline" | "impacts">): string | null {
  if (item.headline.trim().length < 5) return "Headline must be at least 5 characters.";
  const seen = new Set<string>();
  for (const impact of item.impacts) {
    if (seen.has(impact.instrumentId)) return "Each stock can appear only once per news item.";
    seen.add(impact.instrumentId);
    const error = validateImpact(impact);
    if (error) return error;
  }
  return null;
}

/** Draws the actual percentage once. FIXED returns the configured value; RANGE draws uniformly, 2 decimals. */
export function resolveImpactPct(impact: NewsImpact, random: () => number): number {
  const configured = configuredImpactOf(impact);
  if (configured.kind === "NEWS_FIXED") return configured.pct;
  if (configured.kind !== "NEWS_RANGE") return 0;
  return round2(configured.minPct + random() * (configured.maxPct - configured.minPct));
}

export type ImpactPreview = {
  instrumentId: string;
  currentPrice: Paise;
  configured: ConfiguredImpact;
  minPrice: Paise;
  maxPrice: Paise;
  mayClamp: boolean;
};

export function previewImpact(state: EventState, impact: NewsImpact): ImpactPreview {
  const current = state.prices[impact.instrumentId].price;
  const limits = limitsFor(state, impact.instrumentId);
  const configured = configuredImpactOf(impact);
  const [lowPct, highPct] =
    configured.kind === "NEWS_FIXED" ? [configured.pct, configured.pct] : configured.kind === "NEWS_RANGE" ? [configured.minPct, configured.maxPct] : [0, 0];
  const low = applyPriceRules(applyPercent(current, lowPct), limits);
  const high = applyPriceRules(applyPercent(current, highPct), limits);
  return {
    instrumentId: impact.instrumentId,
    currentPrice: current,
    configured,
    minPrice: Math.min(low.price, high.price),
    maxPrice: Math.max(low.price, high.price),
    mayClamp: low.clamped || high.clamped,
  };
}

/**
 * Releases a news item: resolves each impact exactly once, applies it through the price pipeline,
 * and stores configured, resolved and applied values permanently. A news item can be released once.
 */
export function releaseNews(
  state: EventState,
  ctx: OpContext,
  newsItemId: string,
  options: { source?: NewsReleaseSource; scheduledFor?: number | null } = {},
): OpResult<NewsRelease> {
  const item = state.news.find((n) => n.id === newsItemId);
  if (!item) return fail("NOT_FOUND", "News item not found.");
  if (item.status === "RELEASED" || item.releaseId) {
    const existing = state.newsReleases.find((r) => r.id === item.releaseId);
    if (existing) return ok(existing);
    return fail("ALREADY_RELEASED", "This news item was already released.");
  }
  if (item.status !== "READY") return fail("NOT_READY", "Only news marked Ready can be released.");
  if (state.event.status !== "LIVE" && state.event.status !== "PAUSED") {
    return fail("EVENT_NOT_LIVE", "News can only be released while the event is live.");
  }
  const invalid = validateNewsItem(item);
  if (invalid) return fail("INVALID_NEWS", invalid);

  const releaseId = nextId(state, "NWS", 400);
  const impacts: ResolvedImpact[] = item.impacts
    .filter((impact) => impact.timing === "IMMEDIATE")
    .map((impact) => {
      const configured = configuredImpactOf(impact);
      const resolvedPct = resolveImpactPct(impact, ctx.random);
      const previousPrice = state.prices[impact.instrumentId].price;
      const priceEvent = recordPriceChange(state, {
        instrumentId: impact.instrumentId,
        proposedPrice: applyPercent(previousPrice, resolvedPct),
        source: "NEWS",
        configuredImpact: configured,
        resolvedImpactPct: resolvedPct,
        newsReleaseId: releaseId,
        actor: ctx.actor,
        now: ctx.now,
      });
      return {
        instrumentId: impact.instrumentId,
        configured,
        resolvedPct,
        appliedPct: priceEvent.appliedPct,
        previousPrice,
        newPrice: priceEvent.newPrice,
        clamped: priceEvent.clamped,
        clampReasons: priceEvent.clampReasons,
        priceEventId: priceEvent.id,
      };
    });

  const release: NewsRelease = {
    id: releaseId,
    newsItemId: item.id,
    roundId: state.event.currentRoundId,
    releasedAt: ctx.now,
    releasedBy: ctx.actor,
    source: options.source ?? "MANUAL",
    scheduledFor: options.scheduledFor ?? null,
    headline: item.headline,
    body: item.body,
    impacts,
  };
  state.newsReleases.push(release);
  item.status = "RELEASED";
  item.releaseId = release.id;
  item.updatedAt = ctx.now;

  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "NEWS_RELEASED",
    summary: `Released #${item.number}${release.source === "RANDOM" ? " (random)" : ""}: ${item.headline}`,
    after: {
      impacts: impacts.map((i) => ({
        instrumentId: i.instrumentId,
        configured: i.configured,
        resolvedPct: i.resolvedPct,
        appliedPct: i.appliedPct,
        previousPrice: i.previousPrice,
        newPrice: i.newPrice,
        clamped: i.clamped,
      })),
    },
    refs: {
      newsItemId: item.id,
      newsReleaseId: release.id,
      source: release.source,
      ...(release.scheduledFor !== null ? { scheduledFor: new Date(release.scheduledFor).toISOString() } : {}),
    },
  });
  recordValuation(state, ctx.now);
  return ok(release);
}

export function skipNews(state: EventState, ctx: OpContext, newsItemId: string): OpResult<NewsItem> {
  const item = state.news.find((n) => n.id === newsItemId);
  if (!item) return fail("NOT_FOUND", "News item not found.");
  if (item.status === "RELEASED") return fail("ALREADY_RELEASED", "Released news cannot be skipped.");
  if (item.status === "SKIPPED") return ok(item);
  item.status = "SKIPPED";
  item.updatedAt = ctx.now;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "NEWS_SKIPPED",
    summary: `Skipped #${item.number}: ${item.headline}`,
    refs: { newsItemId: item.id },
  });
  return ok(item);
}

export function describeConfigured(configured: ConfiguredImpact): string {
  const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2).replace(/\.00$/, "")}%`;
  switch (configured.kind) {
    case "NEWS_FIXED":
      return pct(configured.pct);
    case "NEWS_RANGE": {
      const [a, b] = configured.minPct < 0 ? [configured.maxPct, configured.minPct] : [configured.minPct, configured.maxPct];
      return `${pct(a)} to ${pct(b)}`;
    }
    case "MANUAL_SET":
      return `Set to ₹${(configured.targetPrice / 100).toFixed(2)}`;
    case "MANUAL_PERCENT":
      return `Move ${pct(configured.pct)}`;
  }
}
