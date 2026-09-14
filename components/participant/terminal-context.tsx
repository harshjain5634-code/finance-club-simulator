"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { EventState, Team } from "@/lib/domain/types";
import { useEventById } from "@/lib/mock/hooks";

export type TerminalIdentity = { code: string; eventId: string; teamId: string };

export const TerminalContext = createContext<TerminalIdentity | null>(null);

/** Available inside the terminal shell, which guarantees the event and team exist. */
export function useTerminal(): { state: EventState; team: Team; code: string; eventId: string; teamId: string } {
  const identity = useContext(TerminalContext);
  if (!identity) throw new Error("useTerminal must be used inside the participant terminal");
  const state = useEventById(identity.eventId)!;
  const team = state.teams.find((t) => t.id === identity.teamId)!;
  return { state, team, ...identity };
}

export const stockHref = (code: string) => (symbol: string) => `/event/${code}/markets/${encodeURIComponent(symbol)}`;

/* News read-state per tab (prototype convenience). */
const readListeners = new Set<() => void>();
const readKey = (eventId: string, teamId: string) => `finsim:news-read:${eventId}:${teamId}`;

function readLastSeen(eventId: string, teamId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(readKey(eventId, teamId)) ?? 0);
  } catch {
    return 0;
  }
}

export function markNewsRead(eventId: string, teamId: string) {
  try {
    sessionStorage.setItem(readKey(eventId, teamId), String(Date.now()));
  } catch {
    // ignore
  }
  readListeners.forEach((l) => l());
}

export function useNewsLastSeen(eventId: string, teamId: string): number {
  return useSyncExternalStore(
    (listener) => {
      readListeners.add(listener);
      return () => readListeners.delete(listener);
    },
    () => readLastSeen(eventId, teamId),
    () => 0,
  );
}
