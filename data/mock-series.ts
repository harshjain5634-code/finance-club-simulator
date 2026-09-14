import type { PerformancePoint, PerformanceRange } from "@/lib/types";

// Deterministic generators so server and client render identical mock charts.

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

// Random walk pinned to exact start and end values (a Brownian bridge).
export function bridgeSeries(count: number, start: number, end: number, stepSize: number, seed: number) {
  const rng = createRng(seed);
  const walk = [0];
  for (let i = 1; i < count; i++) walk.push(walk[i - 1] + gaussian(rng) * stepSize);

  const last = count - 1;
  if (last === 0) return [end];
  return walk.map((w, i) => {
    const progress = i / last;
    return start + (end - start) * progress + (w - walk[last] * progress);
  });
}

export function istTimestamp(year: number, month: number, day: number, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour, minute) - 330 * 60_000;
}

const DAY_MS = 86_400_000;

type CalendarDay = { year: number; month: number; day: number };

function calendarDayOf(timestamp: number): CalendarDay {
  const ist = new Date(timestamp + 330 * 60_000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

function isWeekday({ year, month, day }: CalendarDay) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Weekdays only; exchange holidays are ignored for mock data.
function tradingDaysEndingAt(timestamp: number, count: number): CalendarDay[] {
  const days: CalendarDay[] = [];
  const start = calendarDayOf(timestamp);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  while (days.length < count) {
    const d = new Date(cursor);
    const candidate = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    if (isWeekday(candidate)) days.unshift(candidate);
    cursor -= DAY_MS;
  }
  return days;
}

const SESSION_OPEN = { hour: 9, minute: 15 };
const SESSION_CLOSE = { hour: 15, minute: 30 };

function sessionTimestamps({ year, month, day }: CalendarDay, stepMinutes: number) {
  const open = istTimestamp(year, month, day, SESSION_OPEN.hour, SESSION_OPEN.minute);
  const close = istTimestamp(year, month, day, SESSION_CLOSE.hour, SESSION_CLOSE.minute);
  const stamps: number[] = [];
  for (let t = open; t <= close; t += stepMinutes * 60_000) stamps.push(t);
  if (stamps[stamps.length - 1] !== close) stamps.push(close);
  return stamps;
}

function toPoints(timestamps: number[], start: number, end: number, stepPct: number, seed: number) {
  const values = bridgeSeries(timestamps.length, start, end, start * stepPct, seed);
  return timestamps.map((t, i) => ({ t, value: Math.round(values[i] * 100) / 100 }));
}

export function intradaySeries(now: number, previousClose: number, current: number, stepPct: number, seed: number) {
  const stamps = sessionTimestamps(calendarDayOf(now), 5).filter((t) => t <= now);
  return bridgeSeries(stamps.length, previousClose, current, previousClose * stepPct, seed);
}

type SeriesAnchors = {
  now: number;
  accountOpenedAt: number;
  currentValue: number;
  previousCloseValue: number;
  startValues: Record<Exclude<PerformanceRange, "1D">, number>;
};

export function buildPerformanceSeries(anchors: SeriesAnchors): Record<PerformanceRange, PerformancePoint[]> {
  const { now, currentValue, previousCloseValue, startValues } = anchors;
  const today = calendarDayOf(now);

  // 1D keeps the full session on the axis; future slots are null so the line stops at "now".
  const session = sessionTimestamps(today, 5);
  const elapsed = session.filter((t) => t <= now);
  const intraday = toPoints(elapsed, previousCloseValue, currentValue, 0.0007, 101);
  const oneDay: PerformancePoint[] = [
    ...intraday,
    ...session.filter((t) => t > now).map((t) => ({ t, value: null })),
  ];

  const weekStamps = tradingDaysEndingAt(now, 5)
    .flatMap((day) => sessionTimestamps(day, 60))
    .filter((t) => t < now)
    .concat(now);

  const dailyStamps = (count: number) =>
    tradingDaysEndingAt(now, count)
      .map(({ year, month, day }) => istTimestamp(year, month, day, SESSION_CLOSE.hour, SESSION_CLOSE.minute))
      .filter((t) => t < now)
      .concat(now);

  const weeklyStamps: number[] = [];
  for (let t = anchors.accountOpenedAt; t < now; t += 7 * DAY_MS) weeklyStamps.push(t);
  weeklyStamps.push(now);

  return {
    "1D": oneDay,
    "1W": toPoints(weekStamps, startValues["1W"], currentValue, 0.0018, 202),
    "1M": toPoints(dailyStamps(22), startValues["1M"], currentValue, 0.006, 303),
    "3M": toPoints(dailyStamps(64), startValues["3M"], currentValue, 0.006, 404),
    "1Y": toPoints(dailyStamps(248), startValues["1Y"], currentValue, 0.0065, 505),
    ALL: toPoints(weeklyStamps, startValues.ALL, currentValue, 0.013, 606),
  };
}
