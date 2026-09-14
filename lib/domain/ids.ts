import type { EventState } from "./types";

/** Sequential, human-readable ids per event (e.g. PRP-1001). Deterministic, so tests stay stable. */
export function nextId(state: EventState, prefix: string, start = 1000): string {
  const current = state.counters[prefix] ?? start;
  const next = current + 1;
  state.counters[prefix] = next;
  return `${prefix}-${next}`;
}
