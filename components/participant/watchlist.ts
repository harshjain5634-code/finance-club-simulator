"use client";

import { useSyncExternalStore } from "react";

/** Per-team watchlist stored in this browser only (a participant convenience, not event data). */
const listeners = new Set<() => void>();
const cache = new Map<string, string[]>();
const EMPTY: string[] = [];
const key = (eventId: string, teamId: string) => `finsim:watchlist:${eventId}:${teamId}`;

function read(k: string): string[] {
  if (cache.has(k)) return cache.get(k)!;
  let value: string[] = EMPTY;
  try {
    value = JSON.parse(localStorage.getItem(k) ?? "[]") as string[];
  } catch {
    value = EMPTY;
  }
  cache.set(k, value);
  return value;
}

export function useWatchlist(eventId: string, teamId: string) {
  const k = key(eventId, teamId);
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(k),
    () => EMPTY,
  );
  const toggle = (instrumentId: string) => {
    const next = list.includes(instrumentId) ? list.filter((id) => id !== instrumentId) : [...list, instrumentId];
    cache.set(k, next);
    try {
      localStorage.setItem(k, JSON.stringify(next));
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  };
  return { list, toggle };
}
