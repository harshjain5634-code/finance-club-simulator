import { finsim26CustomConfig } from "@/data/scenarios/finsim26-custom";
import { createEventState } from "../event-state";
import * as lifecycle from "../lifecycle";
import { applyAllocations } from "../portfolio";
import type { Actor, EventState, OpContext } from "../types";

export const HOST: Actor = { type: "HOST", name: "Test host" };
export const T0 = Date.UTC(2026, 8, 18, 5, 0, 0);

export function ctx(now: number, actor: Actor = HOST, random: () => number = () => 0.5): OpContext {
  return { now, actor, random };
}

export const team = (teamId: string): Actor => ({ type: "TEAM", teamId });

export function expectOk<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(`Expected ok, got: ${result.message}`);
  return result.value;
}

/** READY event with allocations applied (every team: ₹5,05,200 cash + 200 NOVA …). */
export function readyEvent(): EventState {
  const state = createEventState(finsim26CustomConfig("QUICK"), { id: "test", now: T0, random: () => 0.42, hostName: "Test host" });
  expectOk(applyAllocations(state, ctx(T0)));
  return state;
}

/** LIVE event with Round 1 (trading) running. */
export function liveTradingEvent(now = T0 + 1000): EventState {
  const state = readyEvent();
  expectOk(lifecycle.startEvent(state, ctx(now)));
  expectOk(lifecycle.startRound(state, ctx(now)));
  expectOk(lifecycle.nextRound(state, ctx(now)));
  return state;
}

export const ALPHA = "team-alpha";
export const BETA = "team-beta";
export const NOVA = "ins-nova";
export const VERTEX = "ins-vertex";
