import type { Actor } from "./types";

export type Role = "HOST" | "TEAM" | "PROJECTOR" | "SYSTEM";

export type Permission =
  | "event.control"
  | "round.control"
  | "trading.freeze"
  | "settings.manage"
  | "teams.manage"
  | "teams.adjust"
  | "instruments.manage"
  | "allocations.manage"
  | "news.manage"
  | "news.release"
  | "prices.manage"
  | "trades.approve"
  | "leaderboard.manage"
  | "projector.manage"
  | "audit.view"
  | "exports.download"
  | "trade.propose"
  | "trade.respond"
  | "portfolio.viewOwn"
  | "market.view"
  | "news.viewReleased"
  | "leaderboard.view";

const HOST_PERMISSIONS: Permission[] = [
  "event.control",
  "round.control",
  "trading.freeze",
  "settings.manage",
  "teams.manage",
  "teams.adjust",
  "instruments.manage",
  "allocations.manage",
  "news.manage",
  "news.release",
  "prices.manage",
  "trades.approve",
  "leaderboard.manage",
  "projector.manage",
  "audit.view",
  "exports.download",
  "market.view",
  "news.viewReleased",
  "leaderboard.view",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  HOST: new Set(HOST_PERMISSIONS),
  TEAM: new Set<Permission>(["trade.propose", "trade.respond", "portfolio.viewOwn", "market.view", "news.viewReleased", "leaderboard.view"]),
  PROJECTOR: new Set<Permission>(["market.view", "news.viewReleased", "leaderboard.view"]),
  // Scheduled actions (round timer, proposal expiry) run with system rights for lifecycle only.
  SYSTEM: new Set<Permission>(["round.control", "trade.respond"]),
};

export function roleOf(actor: Actor): Role {
  return actor.type;
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function actorCan(actor: Actor, permission: Permission): boolean {
  return can(roleOf(actor), permission);
}

/** A team may only read its own portfolio; hosts may read every team. */
export function canViewTeamPortfolio(actor: Actor, teamId: string): boolean {
  if (actor.type === "HOST") return true;
  return actor.type === "TEAM" && actor.teamId === teamId;
}

export class PermissionError extends Error {
  constructor(public permission: Permission) {
    super(`Not permitted: ${permission}`);
  }
}

export function assertCan(actor: Actor, permission: Permission) {
  if (!actorCan(actor, permission)) throw new PermissionError(permission);
}
