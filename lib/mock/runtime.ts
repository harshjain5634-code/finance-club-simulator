"use client";

import { useEffect, useState } from "react";
import { randomNewsNeedsTick } from "@/lib/domain/random-news";
import { runScheduledWork } from "./commands";
import { getStoreSnapshot } from "./store";

/**
 * Stand-in for the Phase 4 simulation worker. Exactly one tab (the holder of a Web Lock) runs the
 * 1-second loop that ends expired rounds and expires proposals, so opening more windows never adds
 * a second loop. When that tab closes, another tab acquires the lock and takes over.
 */

let schedulerStarted = false;

function tick() {
  const store = getStoreSnapshot();
  if (!store) return;
  const now = Date.now();
  for (const eventState of Object.values(store.events)) {
    const { event } = eventState;
    if (event.status !== "LIVE" && event.status !== "PAUSED") continue;
    const round = eventState.rounds.find((r) => r.id === event.currentRoundId);
    const roundDue = event.status === "LIVE" && round?.status === "RUNNING" && round.endsAt !== null && round.endsAt <= now;
    const proposalDue = eventState.proposals.some((p) => p.status === "PROPOSED" && p.expiresAt <= now);
    const newsDue = randomNewsNeedsTick(eventState, now);
    if (roundDue || proposalDue || newsDue) void runScheduledWork(event.id);
  }
}

export function startScheduler() {
  if (schedulerStarted || typeof window === "undefined") return;
  schedulerStarted = true;
  if ("locks" in navigator && navigator.locks) {
    void navigator.locks.request("finsim:scheduler", () => new Promise<void>(() => {
      window.setInterval(tick, 1000);
    }));
  } else {
    window.setInterval(tick, 1000);
  }
}

/* ───────────── Presence (ephemeral, not persisted) ───────────── */

const PRESENCE_CHANNEL = "finsim:presence";
type PresenceMessage = { type: "ping"; eventId: string; teamId: string; at: number } | { type: "leave"; eventId: string; teamId: string } | { type: "query"; eventId: string };

export function startTeamPresence(eventId: string, teamId: string) {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return () => {};
  const channel = new BroadcastChannel(PRESENCE_CHANNEL);
  const ping = () => channel.postMessage({ type: "ping", eventId, teamId, at: Date.now() } satisfies PresenceMessage);
  channel.onmessage = (message) => {
    const data = message.data as PresenceMessage;
    if (data.type === "query" && data.eventId === eventId) ping();
  };
  ping();
  const interval = window.setInterval(ping, 5000);
  const leave = () => channel.postMessage({ type: "leave", eventId, teamId } satisfies PresenceMessage);
  window.addEventListener("pagehide", leave);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("pagehide", leave);
    leave();
    channel.close();
  };
}

/** Teams whose terminal pinged within the last 15 seconds (same browser only in Phase 1). */
export function useOnlineTeams(eventId: string): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const seen = new Map<string, number>();
    const recompute = () => {
      const now = Date.now();
      setOnline(new Set([...seen.entries()].filter(([, at]) => now - at < 15_000).map(([teamId]) => teamId)));
    };
    const channel = new BroadcastChannel(PRESENCE_CHANNEL);
    channel.onmessage = (message) => {
      const data = message.data as PresenceMessage;
      if (data.eventId !== eventId) return;
      if (data.type === "ping") seen.set(data.teamId, data.at);
      if (data.type === "leave") seen.delete(data.teamId);
      recompute();
    };
    channel.postMessage({ type: "query", eventId } satisfies PresenceMessage);
    const interval = window.setInterval(recompute, 5000);
    return () => {
      window.clearInterval(interval);
      channel.close();
    };
  }, [eventId]);

  return online;
}
