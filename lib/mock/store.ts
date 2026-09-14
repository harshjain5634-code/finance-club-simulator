import { finsim26CustomConfig } from "@/data/scenarios/finsim26-custom";
import { finsim26RealConfig } from "@/data/scenarios/finsim26-real";
import { DEMO_EVENT_ID, type ScenarioTiming } from "@/data/scenarios/shared";
import { EVENT_TEMPLATES } from "@/data/templates";
import type { EventConfig } from "@/lib/domain/event-config";
import { createEventState } from "@/lib/domain/event-state";
import { applyAllocations } from "@/lib/domain/portfolio";
import { addTeams } from "@/lib/domain/setup";
import type { EventState, UniverseMode } from "@/lib/domain/types";

/**
 * PHASE 1 MOCK BACKEND.
 * One JSON document in localStorage stands in for the database. Writes are serialised across tabs with
 * the Web Locks API (like a DB transaction) and announced on a BroadcastChannel so every open window
 * re-reads the latest state. Phase 2 replaces this module with server actions + Postgres + realtime.
 */

export type DemoSettings = { scenario: UniverseMode; timing: ScenarioTiming };

export type StoreState = {
  schemaVersion: number;
  version: number;
  updatedAt: number;
  events: Record<string, EventState>;
  eventOrder: string[];
  demo: DemoSettings;
};

/** Bump when the stored shape changes; older prototype data is discarded and re-seeded. */
export const SCHEMA_VERSION = 5;
const STORAGE_KEY = "finsim:store";
const CHANNEL_NAME = "finsim:sync";
const LOCK_NAME = "finsim:store-write";
export const HOST_NAME = "Host · Finance Club";

let state: StoreState | null = null;
let channel: BroadcastChannel | null = null;
let syncStarted = false;
const listeners = new Set<() => void>();

const isBrowser = () => typeof window !== "undefined";

function hostCtx(now: number) {
  return { now, actor: { type: "HOST" as const, name: HOST_NAME }, random: Math.random };
}

export function buildDemoEvent(scenario: UniverseMode, timing: ScenarioTiming, now: number): EventState {
  const config = scenario === "REAL_SIMULATED" ? finsim26RealConfig(timing) : finsim26CustomConfig(timing);
  const event = createEventState(config, { id: DEMO_EVENT_ID, now, random: Math.random, hostName: HOST_NAME });
  applyAllocations(event, hostCtx(now));
  return event;
}

function buildSampleDraft(now: number): EventState {
  const template = EVENT_TEMPLATES[0];
  const config: EventConfig = {
    ...template.config,
    name: "Freshers Trading Sprint",
    code: "FRESH26",
    scheduledDate: "2026-10-09",
  };
  const event = createEventState(config, { id: "freshers-sprint", now: now - 86_400_000 * 2, random: Math.random, templateId: template.id, hostName: HOST_NAME });
  addTeams(event, hostCtx(now - 86_400_000 * 2), { names: ["Bears & Bulls", "Blue Chips", "Compound Crew", "Dividend Squad", "Hedge Hogs", "Ticker Tape"] });
  return event;
}

export function createInitialStore(now: number, demo: DemoSettings = { scenario: "CUSTOM", timing: "STANDARD" }): StoreState {
  const demoEvent = buildDemoEvent(demo.scenario, demo.timing, now);
  const draft = buildSampleDraft(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    updatedAt: now,
    events: { [demoEvent.event.id]: demoEvent, [draft.event.id]: draft },
    eventOrder: [demoEvent.event.id, draft.event.id],
    demo,
  };
}

function readStorage(): StoreState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreState;
    return parsed.schemaVersion === SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(next: StoreState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Mock store could not persist to localStorage", error);
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function reloadFromStorage() {
  const stored = readStorage();
  if (stored && (!state || stored.version !== state.version || stored.updatedAt !== state.updatedAt)) {
    state = stored;
    notify();
  }
}

function startSync() {
  if (syncStarted || !isBrowser()) return;
  syncStarted = true;
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (message) => {
      if (message.data?.type === "store-updated") reloadFromStorage();
    };
  }
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) reloadFromStorage();
  });
}

export function getStoreSnapshot(): StoreState | null {
  if (!isBrowser()) return null;
  if (!state) {
    state = readStorage();
    if (!state) {
      state = createInitialStore(Date.now());
      writeStorage(state);
    }
  }
  return state;
}

export function getServerStoreSnapshot(): StoreState | null {
  return null;
}

export function subscribeStore(listener: () => void) {
  startSync();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function withWriteLock<T>(work: () => T): Promise<T> {
  if (isBrowser() && "locks" in navigator && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, async () => work());
  }
  return work();
}

export type Transaction<T> = { commit: boolean; result: T };

/**
 * Runs `fn` against a fresh copy of the latest persisted state while holding the cross-tab write lock.
 * The copy is only persisted and broadcast when `commit` is true, mirroring a DB transaction.
 */
export async function transact<T>(fn: (draft: StoreState) => Transaction<T>): Promise<T> {
  return withWriteLock(() => {
    const base = readStorage() ?? getStoreSnapshot();
    if (!base) throw new Error("Store is only available in the browser");
    const draft = structuredClone(base);
    const { commit, result } = fn(draft);
    if (commit) {
      draft.version = base.version + 1;
      draft.updatedAt = Date.now();
      writeStorage(draft);
      state = draft;
      notify();
      channel?.postMessage({ type: "store-updated", version: draft.version });
    } else if (state !== base) {
      state = base;
      notify();
    }
    return result;
  });
}
