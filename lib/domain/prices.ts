import { appendAudit } from "./audit";
import { nextId } from "./ids";
import { changePct, DEFAULT_TICK_SIZE, round2 } from "./money";
import type {
  Actor,
  ClampReason,
  ConfiguredImpact,
  EventState,
  Paise,
  PriceEvent,
  PriceEventSource,
} from "./types";

export type PriceLimits = {
  floor: Paise | null;
  ceiling: Paise | null;
  circuitPct: number | null;
  roundOpenPrice: Paise;
  tickSize?: Paise;
};

export function roundToTick(price: number, tick: Paise = DEFAULT_TICK_SIZE): Paise {
  return Math.round(price / tick) * tick;
}

function ceilToTick(price: number, tick: Paise) {
  return Math.ceil(price / tick) * tick;
}

function floorToTick(price: number, tick: Paise) {
  return Math.floor(price / tick) * tick;
}

export function applyPercent(price: Paise, pct: number): number {
  return price * (1 + pct / 100);
}

export type PriceRuleResult = {
  price: Paise;
  clamped: boolean;
  clampReasons: ClampReason[];
  bounds: { lower: Paise; upper: Paise | null };
};

/**
 * The single price pipeline: proposed price → circuit limit → floor/ceiling → tick rounding.
 * Rounding always stays inside the permitted bounds.
 */
export function applyPriceRules(proposed: number, limits: PriceLimits): PriceRuleResult {
  const tick = limits.tickSize ?? DEFAULT_TICK_SIZE;
  const reasons: ClampReason[] = [];

  let lower = tick;
  let upper: number | null = null;

  if (limits.circuitPct !== null) {
    const circuitLower = ceilToTick(limits.roundOpenPrice * (1 - limits.circuitPct / 100), tick);
    const circuitUpper = floorToTick(limits.roundOpenPrice * (1 + limits.circuitPct / 100), tick);
    lower = Math.max(lower, circuitLower);
    upper = circuitUpper;
  }

  let price = proposed;
  if (upper !== null && price > upper) {
    price = upper;
    reasons.push("CIRCUIT_UPPER");
  }
  if (price < lower && limits.circuitPct !== null && lower > tick) {
    price = lower;
    reasons.push("CIRCUIT_LOWER");
  }
  if (limits.ceiling !== null && price > limits.ceiling) {
    price = limits.ceiling;
    reasons.push("CEILING");
  }
  if (limits.floor !== null && price < limits.floor) {
    price = limits.floor;
    reasons.push("FLOOR");
  }

  let rounded = roundToTick(price, tick);
  const effectiveUpper = Math.min(upper ?? Infinity, limits.ceiling ?? Infinity);
  const effectiveLower = Math.max(lower, limits.floor ?? 0);
  if (rounded > effectiveUpper) rounded = floorToTick(effectiveUpper, tick);
  if (rounded < effectiveLower) rounded = ceilToTick(effectiveLower, tick);
  if (rounded < tick) {
    rounded = tick;
    reasons.push("MIN_TICK");
  }

  return {
    price: rounded,
    clamped: reasons.length > 0,
    clampReasons: reasons,
    bounds: { lower: effectiveLower, upper: Number.isFinite(effectiveUpper) ? effectiveUpper : null },
  };
}

export function limitsFor(state: EventState, instrumentId: string): PriceLimits {
  const instrument = state.instruments.find((i) => i.id === instrumentId);
  const snapshot = state.prices[instrumentId];
  if (!instrument || !snapshot) throw new Error(`Unknown instrument ${instrumentId}`);
  return {
    floor: instrument.floor,
    ceiling: instrument.ceiling,
    circuitPct: instrument.circuitPct,
    roundOpenPrice: snapshot.roundOpenPrice,
    tickSize: state.event.rules.tickSize,
  };
}

export const CLAMP_LABEL: Record<ClampReason, string> = {
  CIRCUIT_UPPER: "Upper circuit",
  CIRCUIT_LOWER: "Lower circuit",
  FLOOR: "Price floor",
  CEILING: "Price ceiling",
  MIN_TICK: "Minimum tick",
};

type PriceChangeInput = {
  instrumentId: string;
  proposedPrice: number;
  source: PriceEventSource;
  configuredImpact: ConfiguredImpact | null;
  resolvedImpactPct: number | null;
  newsReleaseId?: string | null;
  manualAdjustmentId?: string | null;
  reason?: string | null;
  actor: Actor;
  now: number;
};

/**
 * The only writer of prices: updates the Price snapshot and appends an immutable PriceEvent
 * in the same operation. Returns the stored event.
 */
export function recordPriceChange(state: EventState, input: PriceChangeInput): PriceEvent {
  const snapshot = state.prices[input.instrumentId];
  const result = applyPriceRules(input.proposedPrice, limitsFor(state, input.instrumentId));
  const event: PriceEvent = {
    id: nextId(state, "PEV", 5000),
    instrumentId: input.instrumentId,
    roundId: state.event.currentRoundId,
    at: input.now,
    previousPrice: snapshot.price,
    newPrice: result.price,
    source: input.source,
    newsReleaseId: input.newsReleaseId ?? null,
    manualAdjustmentId: input.manualAdjustmentId ?? null,
    tradeId: null,
    configuredImpact: input.configuredImpact,
    resolvedImpactPct: input.resolvedImpactPct,
    appliedPct: round2(changePct(snapshot.price, result.price)),
    clamped: result.clamped,
    clampReasons: result.clampReasons,
    actor: input.actor,
    reason: input.reason ?? null,
  };
  state.priceEvents.push(event);
  state.prices[input.instrumentId] = {
    ...snapshot,
    price: result.price,
    lastPriceEventId: event.id,
    updatedAt: input.now,
  };
  const instrument = state.instruments.find((i) => i.id === input.instrumentId);
  appendAudit(state, {
    at: input.now,
    actor: input.actor,
    type: "PRICE_CHANGED",
    summary: `${instrument?.symbol ?? input.instrumentId} ${event.appliedPct >= 0 ? "+" : ""}${event.appliedPct.toFixed(2)}% (${input.source.toLowerCase()})`,
    reason: input.reason ?? null,
    before: { price: event.previousPrice },
    after: { price: event.newPrice, clamped: event.clamped, clampReasons: event.clampReasons },
    refs: {
      priceEventId: event.id,
      instrumentId: input.instrumentId,
      ...(input.newsReleaseId ? { newsReleaseId: input.newsReleaseId } : {}),
      ...(input.manualAdjustmentId ? { manualAdjustmentId: input.manualAdjustmentId } : {}),
    },
  });
  return event;
}
