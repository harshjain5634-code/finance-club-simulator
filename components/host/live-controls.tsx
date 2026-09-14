"use client";

import { useState, type ReactNode } from "react";
import { Popover as RadixPopover } from "radix-ui";
import { ChevronDown, CirclePause, CirclePlay, Flag, SkipForward, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Tooltip } from "@/components/ui/controls";
import { nextPendingRound, readiness } from "@/lib/domain/lifecycle";
import { currentRound } from "@/lib/domain/trading-gate";
import type { EventState, OpResult } from "@/lib/domain/types";
import { formatMinutes } from "@/lib/format";
import { endEvent, endRound, nextRound, pauseEvent, pauseRound, resumeEvent, resumeRound, startEvent, startRound } from "@/lib/mock/commands";
import { cn } from "@/lib/utils";
import { hostAction } from "./host-context";
import { FreezeTradingControl } from "./trading-controls";

type Pending = "startEvent" | "endEvent" | "startRound" | "endRound" | "nextRound" | "pauseEvent" | null;

/**
 * The host's primary live controls, always visible in the status bar. Only the one or two actions that make sense
 * right now are shown; rarer event-level actions live in the Event menu.
 */
export function LiveControls({ state, compact = false }: { state: EventState; compact?: boolean }) {
  const [pending, setPending] = useState<Pending>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { event } = state;
  const eventId = event.id;
  const round = currentRound(state);
  const upcoming = nextPendingRound(state);
  const roundActive = !!round && (round.status === "RUNNING" || round.status === "PAUSED");
  const setup = event.status === "DRAFT" || event.status === "READY";
  const blockers = readiness(state).filter((i) => !i.done && i.id !== "news" && i.id !== "projector");
  const size = compact ? "sm" : "md";

  const dialogs: Record<Exclude<Pending, null>, { title: string; description: string; label: string; tier: "confirm" | "typed"; tone: "accent" | "warning"; run: (reason: string) => Promise<OpResult<unknown>> }> = {
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
      description: "The round timer is held and all trading stops until you resume the event.",
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
      title: upcoming ? `Start Round ${upcoming.number} · ${upcoming.name}?` : "Start round?",
      description: upcoming ? `${formatMinutes(upcoming.durationSeconds)} ${upcoming.type === "BRIEFING" ? "briefing: teams can read news and prices, trading stays closed" : "trading round: teams can propose and accept trades"}.` : "",
      label: upcoming?.type === "BRIEFING" ? "Start briefing" : `Start Round ${upcoming?.number ?? ""}`,
      tier: "confirm",
      tone: "accent",
      run: () => hostAction(startRound(eventId), (r) => `Round ${r.number} · ${r.name} started`),
    },
    endRound: {
      title: round ? `End Round ${round.number} now?` : "End round?",
      description: "The timer stops and trading closes until you start the next round. Holdings and prices carry over.",
      label: "End round",
      tier: "confirm",
      tone: "warning",
      run: () => hostAction(endRound(eventId), (r) => `Round ${r.number} ended`),
    },
    nextRound: {
      title: upcoming ? `Move to Round ${upcoming.number} · ${upcoming.name}?` : "Next round",
      description: `${roundActive ? `Round ${round!.number} ends now and ` : ""}Round ${upcoming?.number ?? ""} starts with a ${upcoming ? formatMinutes(upcoming.durationSeconds) : ""} timer.`,
      label: roundActive ? `End R${round!.number} & start R${upcoming?.number ?? ""}` : `Start R${upcoming?.number ?? ""}`,
      tier: "confirm",
      tone: "accent",
      run: () => hostAction(nextRound(eventId), (r) => `Round ${r.number} · ${r.name} started`),
    },
  };
  const dialog = pending ? dialogs[pending] : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {setup && (
        <Tooltip content={blockers.length ? `Finish setup first: ${blockers.map((b) => b.label.toLowerCase()).join(", ")}` : "Go live for every team"}>
          <span>
            <Button variant="primary" size={size} onClick={() => setPending("startEvent")} disabled={blockers.length > 0}>
              <CirclePlay className="size-3.5" />
              Start event
            </Button>
          </span>
        </Tooltip>
      )}

      {event.status === "PAUSED" && (
        <Button variant="primary" size={size} onClick={() => hostAction(resumeEvent(eventId), "Event resumed")}>
          <CirclePlay className="size-3.5" />
          Resume event
        </Button>
      )}

      {event.status === "LIVE" && !roundActive && upcoming && (
        <Button variant="primary" size={size} onClick={() => setPending("startRound")}>
          <CirclePlay className="size-3.5" />
          {upcoming.type === "BRIEFING" ? "Start briefing" : `Start Round ${upcoming.number}`}
        </Button>
      )}

      {event.status === "LIVE" && round?.status === "RUNNING" && (
        <Button variant="secondary" size={size} onClick={() => hostAction(pauseRound(eventId), `Round ${round.number} paused`, "The timer is held and trading is paused.")}>
          <CirclePause className="size-3.5" />
          Pause round
        </Button>
      )}

      {event.status === "LIVE" && round?.status === "PAUSED" && (
        <Button variant="primary" size={size} onClick={() => hostAction(resumeRound(eventId), `Round ${round.number} resumed`)}>
          <CirclePlay className="size-3.5" />
          Resume round
        </Button>
      )}

      {event.status === "LIVE" && roundActive && upcoming && (
        <Button variant="secondary" size={size} onClick={() => setPending("nextRound")}>
          <SkipForward className="size-3.5" />
          Next round
        </Button>
      )}

      {event.status === "LIVE" && roundActive && !upcoming && (
        <Button variant="secondary" size={size} onClick={() => setPending("endRound")}>
          <Square className="size-3.5" />
          End round
        </Button>
      )}

      {(event.status === "LIVE" || event.status === "PAUSED") && <FreezeTradingControl state={state} size={size} />}

      {(event.status === "LIVE" || event.status === "PAUSED") && (
        <RadixPopover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <RadixPopover.Trigger asChild>
            <Button variant="ghost" size={size} aria-label="Event actions">
              Event
              <ChevronDown className="size-3.5" />
            </Button>
          </RadixPopover.Trigger>
          <RadixPopover.Portal>
            <RadixPopover.Content align="end" sideOffset={6} className="z-50 w-56 animate-fade-in overflow-hidden rounded-lg border border-border-strong bg-surface-raised p-1 shadow-xl shadow-black/40">
              {event.status === "LIVE" && (
                <MenuItem
                  icon={<CirclePause className="size-3.5" />}
                  label="Pause event"
                  hint="Holds the timer and all trading"
                  onSelect={() => {
                    setMenuOpen(false);
                    setPending("pauseEvent");
                  }}
                />
              )}
              {roundActive && upcoming && (
                <MenuItem
                  icon={<Square className="size-3.5" />}
                  label="End round early"
                  hint="Close trading until the next round"
                  onSelect={() => {
                    setMenuOpen(false);
                    setPending("endRound");
                  }}
                />
              )}
              <MenuItem
                icon={<Flag className="size-3.5" />}
                label="End event…"
                hint="Publish final results"
                tone="warning"
                onSelect={() => {
                  setMenuOpen(false);
                  setPending("endEvent");
                }}
              />
            </RadixPopover.Content>
          </RadixPopover.Portal>
        </RadixPopover.Root>
      )}

      <ConfirmActionDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setPending(null)}
        tier={dialog?.tier ?? "confirm"}
        tone={dialog?.tone ?? "accent"}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.label ?? ""}
        typedPhrase={pending === "endEvent" ? event.code : undefined}
        reasonLabel="Reason for ending (recorded in the audit log)"
        onConfirm={({ reason }) => (dialog ? dialog.run(reason) : Promise.resolve({ ok: true, value: undefined }))}
      />
    </div>
  );
}

function MenuItem({ icon, label, hint, onSelect, tone }: { icon: ReactNode; label: string; hint: string; onSelect: () => void; tone?: "warning" }) {
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none">
      <span className={cn("mt-0.5", tone === "warning" ? "text-warning" : "text-fg-secondary")}>{icon}</span>
      <span>
        <span className={cn("block text-[13px] font-medium", tone === "warning" ? "text-warning" : "text-fg-primary")}>{label}</span>
        <span className="block text-[11px] text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}
