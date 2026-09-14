"use client";

import { useSyncExternalStore } from "react";
import type { EventState } from "@/lib/domain/types";
import { getServerStoreSnapshot, getStoreSnapshot, subscribeStore, type StoreState } from "./store";

export function useStore(): StoreState | null {
  return useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerStoreSnapshot);
}

/** null while loading (server render / hydration), undefined when the event does not exist. */
export function useEventById(eventId: string): EventState | null | undefined {
  const store = useStore();
  if (!store) return null;
  return store.events[eventId];
}

export function useEventByCode(code: string): EventState | null | undefined {
  const store = useStore();
  if (!store) return null;
  const upper = code.toUpperCase();
  return Object.values(store.events).find((e) => e.event.code === upper);
}

let now = 0;
let timer: number | null = null;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(() => {
      now = Date.now();
      clockListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function readClock() {
  if (now === 0) now = Date.now();
  return now;
}

/** Shared 1-second clock for countdowns; 0 during server rendering. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, readClock, () => 0);
}
