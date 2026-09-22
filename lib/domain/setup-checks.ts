import { readiness } from "./lifecycle";
import type { EventState } from "./types";

/**
 * Read-only setup review (C4 Event Setup, steps + "Review and go live"). Surfaces conflicts between parts of the
 * configuration that are each valid on their own, e.g. a story that moves a stock which can't be traded in the
 * round it belongs to. MUST_FIX items block the Start button in the UI; NOTE items are advice. Nothing here changes
 * state or the engine's own start rules.
 */

export type SetupStepId = "general" | "stocks" | "allocations" | "rounds" | "news" | "teams" | "projector";
export type SetupIssue = { step: SetupStepId; level: "MUST_FIX" | "NOTE"; message: string; ref?: string };

export function setupIssues(state: EventState): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const enabled = new Set(state.instruments.filter((i) => i.enabled).map((i) => i.id));
  const sym = (id: string) => state.instruments.find((i) => i.id === id)?.symbol ?? id;
  const ready = readiness(state);
  const item = (id: string) => ready.find((r) => r.id === id);

  // Basics and rules
  if (!state.event.name.trim()) issues.push({ step: "general", level: "MUST_FIX", message: "The event needs a name." });
  if (!/^[A-Z0-9]{4,10}$/.test(state.event.code)) issues.push({ step: "general", level: "MUST_FIX", message: "The join code must be 4–10 capital letters or digits." });
  const rules = state.event.rules;
  if (rules.approvalEnabled && !(rules.approvalThreshold && rules.approvalThreshold > 0)) issues.push({ step: "general", level: "MUST_FIX", message: "Host approval is on but has no threshold." });

  // Stocks
  if (enabled.size === 0) issues.push({ step: "stocks", level: "MUST_FIX", message: "Enable at least one stock." });

  // Allocations
  if (!state.event.allocationsApplied && (state.event.status === "DRAFT" || state.event.status === "READY")) {
    issues.push({ step: "allocations", level: "MUST_FIX", message: "Starting portfolios haven't been applied to the ledger yet." });
  }

  // Rounds
  const trading = state.rounds.filter((r) => r.type === "TRADING");
  if (trading.length === 0) issues.push({ step: "rounds", level: "MUST_FIX", message: "Add at least one trading round." });
  for (const r of trading) {
    if (r.durationSeconds <= 0) issues.push({ step: "rounds", level: "MUST_FIX", message: `Round ${r.number} has no length.`, ref: r.id });
    if (r.tradableInstrumentIds !== "ALL") {
      if (r.tradableInstrumentIds.filter((id) => enabled.has(id)).length === 0) issues.push({ step: "rounds", level: "MUST_FIX", message: `Round ${r.number} · ${r.name} has no tradable enabled stock.`, ref: r.id });
      const off = r.tradableInstrumentIds.filter((id) => !enabled.has(id));
      if (off.length) issues.push({ step: "rounds", level: "NOTE", message: `Round ${r.number} lists ${off.map(sym).join(", ")}, which ${off.length === 1 ? "is" : "are"} disabled.`, ref: r.id });
    }
  }

  // News
  for (const n of state.news.filter((x) => x.status === "READY" || x.status === "DRAFT")) {
    const round = state.rounds.find((r) => r.id === n.roundId);
    for (const impact of n.impacts) {
      if (!enabled.has(impact.instrumentId)) {
        issues.push({ step: "news", level: n.status === "READY" ? "MUST_FIX" : "NOTE", message: `Story #${n.number} moves ${sym(impact.instrumentId)}, which is disabled.`, ref: n.id });
      } else if (round && round.type === "TRADING" && round.tradableInstrumentIds !== "ALL" && !round.tradableInstrumentIds.includes(impact.instrumentId)) {
        issues.push({
          step: "news",
          level: n.status === "READY" ? "MUST_FIX" : "NOTE",
          message: `Story #${n.number} moves ${sym(impact.instrumentId)}, but ${sym(impact.instrumentId)} isn't tradable in Round ${round.number}. Teams would see the move and couldn't trade it.`,
          ref: n.id,
        });
      }
    }
  }
  if (!item("news")?.done) issues.push({ step: "news", level: "NOTE", message: "No story is Ready yet. You can still write news during the event." });

  // Teams
  const active = state.teams.filter((t) => t.status === "ACTIVE").length;
  if (active < 2) issues.push({ step: "teams", level: "MUST_FIX", message: "Add at least two active teams." });
  const names = new Map<string, number>();
  for (const t of state.teams) names.set(t.name.trim().toLowerCase(), (names.get(t.name.trim().toLowerCase()) ?? 0) + 1);
  for (const [name, count] of names) if (count > 1) issues.push({ step: "teams", level: "NOTE", message: `${count} teams are called “${name}”. Standings will be hard to read.` });

  // Projector
  if (!item("projector")?.done) issues.push({ step: "projector", level: "NOTE", message: "No projector scene is enabled; the screen will only show the round status." });

  return issues;
}

export function stepStatus(issues: SetupIssue[], step: SetupStepId): "MUST_FIX" | "NOTE" | "OK" {
  const mine = issues.filter((i) => i.step === step);
  if (mine.some((i) => i.level === "MUST_FIX")) return "MUST_FIX";
  if (mine.length) return "NOTE";
  return "OK";
}
