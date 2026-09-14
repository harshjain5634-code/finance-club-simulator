const MINUS = "−";
const TIME_ZONE = "Asia/Kolkata";

const numberFormatters = new Map<number, Intl.NumberFormat>();

function groupedNumber(value: number, decimals: number) {
  let formatter = numberFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

// Rounds before checking the sign so values like -0.001 never render as "−0.00".
function signOf(value: number, decimals: number) {
  const rounded = Number(value.toFixed(decimals));
  if (rounded > 0) return "+";
  if (rounded < 0) return MINUS;
  return "";
}

export type Trend = "positive" | "negative" | "neutral";

export function trendOf(value: number, decimals = 2): Trend {
  const sign = signOf(value, decimals);
  if (sign === "+") return "positive";
  if (sign === MINUS) return "negative";
  return "neutral";
}

export function formatCurrency(value: number, decimals = 2) {
  const sign = signOf(value, decimals) === MINUS ? MINUS : "";
  return `${sign}₹${groupedNumber(Math.abs(value), decimals)}`;
}

export function formatSignedCurrency(value: number, decimals = 2) {
  return `${signOf(value, decimals)}₹${groupedNumber(Math.abs(value), decimals)}`;
}

export function formatNumber(value: number, decimals = 2) {
  const sign = signOf(value, decimals) === MINUS ? MINUS : "";
  return `${sign}${groupedNumber(Math.abs(value), decimals)}`;
}

export function formatSignedNumber(value: number, decimals = 2) {
  return `${signOf(value, decimals)}${groupedNumber(Math.abs(value), decimals)}`;
}

export function formatPercent(value: number, { decimals = 2, signed = true } = {}) {
  const sign = signed ? signOf(value, decimals) : signOf(value, decimals) === MINUS ? MINUS : "";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(timestamp: number, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let formatter = dateTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, ...options });
    dateTimeFormatters.set(key, formatter);
  }
  return formatter.format(timestamp);
}

export function formatClockTime(timestamp: number) {
  return formatDate(timestamp, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function formatShortDate(timestamp: number) {
  return formatDate(timestamp, { day: "numeric", month: "short" });
}

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export function calendarDaysBetween(from: number, to: number) {
  return Math.floor((to + IST_OFFSET_MS) / DAY_MS) - Math.floor((from + IST_OFFSET_MS) / DAY_MS);
}

export function isSameDay(a: number, b: number) {
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  return formatDate(a, opts) === formatDate(b, opts);
}
