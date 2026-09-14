"use client";

import { useSyncExternalStore } from "react";
import type { Actor } from "@/lib/domain/types";
import { HOST_NAME } from "./store";

/**
 * PHASE 1 MOCK SESSION. Each browser tab stores its own team identity in sessionStorage, so two windows
 * can be signed in as different teams. Phase 2 replaces this with server-issued team sessions.
 */

export type TeamSession = { teamId: string; eventId: string; loggedInAt: number };

const listeners = new Set<() => void>();
const cache = new Map<string, TeamSession | null>();
const key = (code: string) => `finsim:team-session:${code.toUpperCase()}`;

function read(code: string): TeamSession | null {
  if (typeof window === "undefined") return null;
  const k = key(code);
  if (cache.has(k)) return cache.get(k)!;
  let value: TeamSession | null = null;
  try {
    const raw = sessionStorage.getItem(k);
    value = raw ? (JSON.parse(raw) as TeamSession) : null;
  } catch {
    value = null;
  }
  cache.set(k, value);
  return value;
}

export function setTeamSession(code: string, session: TeamSession) {
  const k = key(code);
  try {
    sessionStorage.setItem(k, JSON.stringify(session));
  } catch {
    // Session is best effort in the prototype.
  }
  cache.set(k, session);
  listeners.forEach((l) => l());
}

export function clearTeamSession(code: string) {
  const k = key(code);
  try {
    sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
  cache.set(k, null);
  listeners.forEach((l) => l());
}

/** undefined while not yet read on the client, null when signed out. */
export function useTeamSession(code: string): TeamSession | null | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(code),
    () => undefined,
  );
}

export const HOST_ACTOR: Actor = { type: "HOST", name: HOST_NAME };

export function teamActor(teamId: string): Actor {
  return { type: "TEAM", teamId };
}
