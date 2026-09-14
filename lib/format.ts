const TIME_ZONE = "Asia/Kolkata";
const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(timestamp: number, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, ...options });
    formatters.set(key, formatter);
  }
  return formatter.format(timestamp);
}

export function formatClock(timestamp: number, withSeconds = false) {
  return formatDate(timestamp, {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  });
}

export function formatDateTime(timestamp: number) {
  return formatDate(timestamp, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
}

export function formatShortDate(timestamp: number) {
  return formatDate(timestamp, { day: "numeric", month: "short" });
}

export function formatLongDate(isoDate: string) {
  const time = Date.parse(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(time)) return isoDate;
  return formatDate(time, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** 12:34 or 1:02:03 */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatMinutes(seconds: number) {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatRelative(timestamp: number, now: number) {
  const diff = Math.max(0, now - timestamp);
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return formatShortDate(timestamp);
}

export function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("en-IN").format(quantity);
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
