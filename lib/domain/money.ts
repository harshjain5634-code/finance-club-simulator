import type { Paise } from "./types";

export const PAISE_PER_RUPEE = 100;
export const DEFAULT_TICK_SIZE: Paise = 5;

const MINUS = "−";

export function rupees(amount: number): Paise {
  return Math.round(amount * PAISE_PER_RUPEE);
}

export function toRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

export function tradeValue(price: Paise, quantity: number): Paise {
  return price * quantity;
}

export function changePct(from: number, to: number): number {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Parses user input like "5,00,000.50" or "525" into paise; returns null when invalid. */
export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? rupees(value) : null;
}

const groupFormatters = new Map<number, Intl.NumberFormat>();

function grouped(value: number, decimals: number) {
  let formatter = groupFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    groupFormatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

function signFor(paise: Paise, decimals: number) {
  const rounded = Number((paise / PAISE_PER_RUPEE).toFixed(decimals));
  if (rounded > 0) return "+";
  if (rounded < 0) return MINUS;
  return "";
}

/** ₹10,24,580.00 — Indian digit grouping. */
export function formatINR(paise: Paise, decimals = 2): string {
  const sign = signFor(paise, decimals) === MINUS ? MINUS : "";
  return `${sign}₹${grouped(Math.abs(paise) / PAISE_PER_RUPEE, decimals)}`;
}

export function formatSignedINR(paise: Paise, decimals = 2): string {
  return `${signFor(paise, decimals)}₹${grouped(Math.abs(paise) / PAISE_PER_RUPEE, decimals)}`;
}

/** Price without the currency symbol, e.g. 1,428.60 */
export function formatPrice(paise: Paise): string {
  const sign = paise < 0 ? MINUS : "";
  return `${sign}${grouped(Math.abs(paise) / PAISE_PER_RUPEE, 2)}`;
}

export function formatCompactINR(paise: Paise): string {
  const abs = Math.abs(paise) / PAISE_PER_RUPEE;
  const sign = paise < 0 ? MINUS : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function formatPct(value: number, { decimals = 2, signed = true } = {}): string {
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? (signed ? "+" : "") : rounded < 0 ? MINUS : "";
  return `${sign}${Math.abs(rounded).toFixed(decimals)}%`;
}
