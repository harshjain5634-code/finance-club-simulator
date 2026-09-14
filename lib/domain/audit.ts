import { nextId } from "./ids";
import type { Actor, AuditEvent, AuditType, EventState } from "./types";

type AuditInput = {
  at: number;
  actor: Actor;
  type: AuditType;
  summary: string;
  teamId?: string | null;
  roundId?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  refs?: Record<string, string>;
};

/** Every material action appends exactly one or more audit rows; rows are never edited. */
export function appendAudit(state: EventState, input: AuditInput): AuditEvent {
  const event: AuditEvent = {
    id: nextId(state, "AUD", 100000),
    at: input.at,
    type: input.type,
    actor: input.actor,
    teamId: input.teamId ?? null,
    roundId: input.roundId === undefined ? state.event.currentRoundId : input.roundId,
    summary: input.summary,
    reason: input.reason ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    refs: input.refs ?? {},
  };
  state.audit.push(event);
  return event;
}

export function actorLabel(actor: Actor, teamName?: (teamId: string) => string | undefined): string {
  if (actor.type === "HOST") return actor.name;
  if (actor.type === "SYSTEM") return actor.name;
  return teamName?.(actor.teamId) ?? actor.teamId;
}
