"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Field, Input } from "@/components/ui/field";
import { nextPendingRound, readiness } from "@/lib/domain/lifecycle";
import { activeTakeover } from "@/lib/domain/projector";
import { currentRound, roundRemainingMs } from "@/lib/domain/trading-gate";
import type { EventState, NewsItem, OpResult } from "@/lib/domain/types";
import { formatDuration, formatMinutes } from "@/lib/format";
import {
  clearProjectorTakeover,
  endEvent,
  endRound,
  freezeTrading,
  nextRound,
  pauseEvent,
  pauseRound,
  resumeEvent,
  resumeRound,
  showLatestNewsOnProjector,
  startEvent,
  startRound,
  unfreezeTrading,
} from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { hostAction } from "./host-context";
import { manualQueue } from "./news-control";
import { ReleaseNewsDialog } from "./news-release-dialog";

/**
 * One source of truth for the host's live commands. The Live Control Strip, keyboard shortcuts and the ⌘K palette
 * all call `run(id)`, so every path gets the same availability rules and the same confirmation dialogs. Risky
 * commands (ending a round or the event, freezing, starting rounds, releasing news) always open a confirmation;
 * reversible ones (pause/resume) run immediately.
 */

export type HostCommandId =
  | "releaseNext"
  | "freeze"
  | "unfreeze"
  | "pauseRound"
  | "resumeRound"
  | "startRound"
  | "endRound"
  | "nextRound"
  | "startEvent"
  | "pauseEvent"
  | "resumeEvent"
  | "endEvent"
  | "projectorBreaking"
  | "projectorClear";

export type HostCommand = {
  id: HostCommandId;
  label: string;
  hint: string;
  shortcut?: string;
  group: "Actions" | "Projector";
  /** True when running it opens a confirmation first. */
  confirms: boolean;
  tone?: "warning";
};

type ConfirmId = "freeze" | "unfreeze" | "startRound" | "endRound" | "nextRound" | "startEvent" | "pauseEvent" | "endEvent";

type Ctx = { state: EventState; commands: HostCommand[]; available: (id: HostCommandId) => boolean; run: (id: HostCommandId) => void; nextStory: NewsItem | null };
const HostCommandsContext = createContext<Ctx | null>(null);

export function useHostCommands() {
  const ctx = useContext(HostCommandsContext);
  if (!ctx) throw new Error("useHostCommands must be used inside HostCommandsProvider");
  return ctx;
}

export function HostCommandsProvider({ state, children }: { state: EventState; children: ReactNode }) {
  const now = useNow();
  const [pending, setPending] = useState<ConfirmId | null>(null);
  const [releaseItem, setReleaseItem] = useState<NewsItem | null>(null);
  const [freezeNote, setFreezeNote] = useState("");
  const { event } = state;
  const eventId = event.id;
  const round = currentRound(state);
  const upcoming = nextPendingRound(state);
  const roundActive = !!round && (round.status === "RUNNING" || round.status === "PAUSED");
  const live = event.status === "LIVE" || event.status === "PAUSED";
  const setup = event.status === "DRAFT" || event.status === "READY";
  const blockers = readiness(state).filter((i) => !i.done && i.id !== "news" && i.id !== "projector");
  const nextStory = manualQueue(state)[0] ?? null;
  const takeover = activeTakeover(state, now);
  const latestRelease = state.newsReleases.length > 0;
  const remaining = round && roundActive ? formatDuration(roundRemainingMs(round, now)) : null;

  const availability: Record<HostCommandId, boolean> = {
    releaseNext: live && !!nextStory,
    freeze: live && !event.tradingFrozen,
    unfreeze: live && event.tradingFrozen,
    pauseRound: event.status === "LIVE" && round?.status === "RUNNING",
    resumeRound: event.status === "LIVE" && round?.status === "PAUSED",
    startRound: event.status === "LIVE" && !roundActive && !!upcoming,
    endRound: event.status === "LIVE" && roundActive,
    nextRound: event.status === "LIVE" && roundActive && !!upcoming,
    startEvent: setup && blockers.length === 0,
    pauseEvent: event.status === "LIVE",
    resumeEvent: event.status === "PAUSED",
    endEvent: live,
    projectorBreaking: live && latestRelease,
    projectorClear: !!takeover,
  };

  const commands: HostCommand[] = [
    { id: "releaseNext", group: "Actions", label: "Release next story", hint: nextStory ? `#${nextStory.number} ${nextStory.headline}` : "nothing ready", shortcut: "N", confirms: true },
    { id: "freeze", group: "Actions", label: "Freeze trading", hint: "asks to confirm · round clock keeps running", shortcut: "F", confirms: true, tone: "warning" },
    { id: "unfreeze", group: "Actions", label: "Unfreeze trading", hint: "asks to confirm", shortcut: "F", confirms: true },
    { id: "pauseRound", group: "Actions", label: `Pause Round ${round?.number ?? ""}`.trim(), hint: "holds the clock and trading", shortcut: "P", confirms: false },
    { id: "resumeRound", group: "Actions", label: `Resume Round ${round?.number ?? ""}`.trim(), hint: "restarts the clock", shortcut: "P", confirms: false },
    { id: "startRound", group: "Actions", label: upcoming?.type === "BRIEFING" ? "Start briefing" : `Start Round ${upcoming?.number ?? ""}`.trim(), hint: upcoming ? `${upcoming.name} · ${formatMinutes(upcoming.durationSeconds)} · asks to confirm` : "", confirms: true },
    { id: "endRound", group: "Actions", label: `End Round ${round?.number ?? ""}`.trim(), hint: `${remaining ? `${remaining} left · ` : ""}asks to confirm`, shortcut: "E", confirms: true, tone: "warning" },
    { id: "nextRound", group: "Actions", label: `End Round ${round?.number ?? ""} & start Round ${upcoming?.number ?? ""}`, hint: "ends the current round first · asks to confirm", confirms: true },
    { id: "startEvent", group: "Actions", label: "Start event", hint: blockers.length ? `finish setup first` : "go live for every team", confirms: true },
    { id: "pauseEvent", group: "Actions", label: "Pause event", hint: "stops the clock and all trading", confirms: true },
    { id: "resumeEvent", group: "Actions", label: "Resume event", hint: "clock and trading continue", shortcut: "P", confirms: false },
    { id: "endEvent", group: "Actions", label: "End event…", hint: "publishes final results · type the code to confirm", confirms: true, tone: "warning" },
    { id: "projectorBreaking", group: "Projector", label: "Show breaking news", hint: `latest story · ${event.projector.breakingNewsSeconds} s takeover`, confirms: false },
    { id: "projectorClear", group: "Projector", label: "Clear overlay", hint: "back to the program", confirms: false },
  ];

  const run = useCallback(
    (id: HostCommandId) => {
      if (!availability[id]) return;
      switch (id) {
        case "releaseNext":
          setReleaseItem(nextStory);
          return;
        case "pauseRound":
          void hostAction(pauseRound(eventId), `Round ${round?.number} paused`, "The clock is held and trading is paused.");
          return;
        case "resumeRound":
          void hostAction(resumeRound(eventId), `Round ${round?.number} resumed`);
          return;
        case "resumeEvent":
          void hostAction(resumeEvent(eventId), "Event resumed");
          return;
        case "projectorBreaking":
          void hostAction(showLatestNewsOnProjector(eventId), "Breaking news on the projector");
          return;
        case "projectorClear":
          void hostAction(clearProjectorTakeover(eventId), "Overlay cleared");
          return;
        default:
          setPending(id);
      }
    },
    // availability is derived from state each render; the command set is rebuilt with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, now],
  );

  const dialogs: Record<ConfirmId, { title: string; description: string; label: string; tier: "confirm" | "typed" | "emergency"; tone: "accent" | "warning"; run: (reason: string) => Promise<OpResult<unknown>> }> = {
    startEvent: {
      title: `Start ${event.name}?`,
      description: "Opening prices are locked and the event goes live for every team. You start rounds separately.",
      label: "Start event",
      tier: "confirm",
      tone: "accent",
      run: () => hostAction(startEvent(eventId), "Event started", "Start the first round when the room is ready."),
    },
    pauseEvent: {
      title: "Pause the whole event?",
      description: "The round clock is held and all trading stops until you resume the event.",
      label: "Pause event",
      tier: "confirm",
      tone: "warning",
      run: () => hostAction(pauseEvent(eventId), "Event paused"),
    },
    endEvent: {
      title: "End the event?",
      description: "Trading stops permanently, open proposals are cancelled, final standings are published and the projector shows the results. This cannot be undone.",
      label: "End event",
      tier: "typed",
      tone: "warning",
      run: (reason) => hostAction(endEvent(eventId, reason), "Event ended", "Final results are now on the projector."),
    },
    startRound: {
      title: upcoming ? `Start ${upcoming.type === "BRIEFING" ? "the briefing" : `Round ${upcoming.number} · ${upcoming.name}`}?` : "Start round?",
      description: upcoming
        ? `${formatMinutes(upcoming.durationSeconds)} ${upcoming.type === "BRIEFING" ? "briefing: teams can read news and prices, trading stays closed" : "trading round: teams can propose and accept trades"}.`
        : "",
      label: upcoming?.type === "BRIEFING" ? "Start briefing" : `Start Round ${upcoming?.number ?? ""}`,
      tier: "confirm",
      tone: "accent",
      run: () => hostAction(startRound(eventId), (r) => `Round ${r.number} · ${r.name} started`),
    },
    endRound: {
      title: round ? `End Round ${round.number} now?` : "End round?",
      description: `${remaining ? `${remaining} is left on the clock. ` : ""}The clock stops and trading closes until you start the next round. Open proposals stay open; holdings and prices carry over.`,
      label: `End Round ${round?.number ?? ""}`,
      tier: "confirm",
      tone: "warning",
      run: () => hostAction(endRound(eventId), (r) => `Round ${r.number} ended`),
    },
    nextRound: {
      title: `End Round ${round?.number ?? ""} and start Round ${upcoming?.number ?? ""}?`,
      description: `Round ${round?.number ?? ""} ends now${remaining ? ` with ${remaining} still on the clock` : ""}. Round ${upcoming?.number ?? ""} · ${upcoming?.name ?? ""} then starts with a ${upcoming ? formatMinutes(upcoming.durationSeconds) : ""} clock.`,
      label: `End R${round?.number ?? ""} & start R${upcoming?.number ?? ""}`,
      tier: "confirm",
      tone: "warning",
      run: () => hostAction(nextRound(eventId), (r) => `Round ${r.number} · ${r.name} started`),
    },
    freeze: {
      title: "Freeze all trading now?",
      description: "Every team is blocked from proposing or accepting trades immediately. The round clock keeps running. Open proposals stay open but cannot settle until you unfreeze.",
      label: "Freeze trading",
      tier: "emergency",
      tone: "warning",
      run: () => hostAction(freezeTrading(eventId, freezeNote.trim() || null), "Trading frozen", "Round clock continues. All teams are blocked from trading."),
    },
    unfreeze: {
      title: "Unfreeze trading?",
      description: "Teams can propose and accept trades again (while the round is open).",
      label: "Unfreeze trading",
      tier: "confirm",
      tone: "accent",
      run: () => hostAction(unfreezeTrading(eventId), "Trading unfrozen"),
    },
  };
  const dialog = pending ? dialogs[pending] : null;

  const value = useMemo<Ctx>(
    () => ({ state, commands, available: (id) => availability[id], run, nextStory }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, now, run],
  );

  return (
    <HostCommandsContext.Provider value={value}>
      {children}
      <ConfirmActionDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setFreezeNote("");
          }
        }}
        tier={dialog?.tier ?? "confirm"}
        tone={dialog?.tone ?? "accent"}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.label ?? ""}
        typedPhrase={pending === "endEvent" ? event.code : undefined}
        reasonLabel="Reason for ending (recorded in the audit log)"
        onConfirm={({ reason }) => (dialog ? dialog.run(reason) : Promise.resolve({ ok: true, value: undefined }))}
      >
        {pending === "freeze" && (
          <Field label="Note for the audit log (optional)" htmlFor="freeze-note">
            <Input id="freeze-note" value={freezeNote} onChange={(e) => setFreezeNote(e.target.value)} placeholder="e.g. Pricing dispute on NOVA" />
          </Field>
        )}
      </ConfirmActionDialog>
      <ReleaseNewsDialog state={state} item={releaseItem} onClose={() => setReleaseItem(null)} />
    </HostCommandsContext.Provider>
  );
}
