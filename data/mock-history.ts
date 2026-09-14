import type { PricePoint } from "@/lib/domain/types";

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function seedFrom(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const DAY_MS = 86_400_000;

/**
 * Historical-looking daily closes for the trading days before `endDate`, ending exactly at `endPrice`
 * (random walk pinned at both ends). Deterministic for a given seed.
 */
export function generateHistory(options: {
  endPrice: number;
  endDate: string;
  days?: number;
  driftPct?: number;
  volatilityPct?: number;
  seed: number;
}): PricePoint[] {
  const { endPrice, endDate, days = 60, driftPct = 4, volatilityPct = 1.4, seed } = options;
  const rng = createRng(seed);
  const startPrice = endPrice / (1 + driftPct / 100);

  const stamps: number[] = [];
  let cursor = Date.parse(`${endDate}T10:00:00Z`) - DAY_MS;
  while (stamps.length < days) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) stamps.unshift(cursor);
    cursor -= DAY_MS;
  }

  const walk = [0];
  for (let i = 1; i < days; i++) walk.push(walk[i - 1] + gaussian(rng) * startPrice * (volatilityPct / 100));
  const last = days - 1;
  return stamps.map((t, i) => {
    const progress = i / last;
    const value = startPrice + (endPrice - startPrice) * progress + (walk[i] - walk[last] * progress);
    return { t, price: Math.max(5, Math.round(value / 5) * 5) };
  });
}
