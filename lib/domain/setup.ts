import { appendAudit } from "./audit";
import { generatePin, generateProjectorKey, loginCodeFromName, slug } from "./event-state";
import { computeLeaderboard } from "./leaderboard";
import { formatINR } from "./money";
import { validateNewsItem } from "./news";
import { allocateToTeam, allocationRowFor, recordValuation } from "./portfolio";
import { preserveRotationOnSceneEdit } from "./projector";
import type {
  EventRules,
  EventState,
  Instrument,
  NewsImpact,
  NewsItem,
  OpContext,
  OpResult,
  Paise,
  ParticipantLeaderboardVisibility,
  PricePoint,
  ProjectorLeaderboardVisibility,
  ProjectorScene,
  ProjectorSettings,
  Round,
  RoundType,
  SimEvent,
  Team,
  ThemePolicy,
} from "./types";
import { fail, ok } from "./types";

const isEditablePhase = (state: EventState) => state.event.status === "DRAFT" || state.event.status === "READY";

/* ───────────── Teams ───────────── */

export function addTeams(
  state: EventState,
  ctx: OpContext,
  input: { names: string[]; startingCash?: Paise },
): OpResult<Team[]> {
  if (state.event.status === "COMPLETED") return fail("COMPLETED", "Teams cannot be added after the event ends.");
  const names = input.names.map((n) => n.trim()).filter((n) => n.length >= 2);
  if (names.length === 0) return fail("NO_NAMES", "Enter at least one team name (2+ characters).");
  const existingNames = new Set(state.teams.map((t) => t.name.toLowerCase()));
  const duplicate = names.find((n, i) => existingNames.has(n.toLowerCase()) || names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== i);
  if (duplicate) return fail("DUPLICATE", `A team named "${duplicate}" already exists.`);

  const taken = new Set(state.teams.map((t) => t.loginCode));
  const created: Team[] = [];
  for (const name of names) {
    const loginCode = loginCodeFromName(name, taken);
    taken.add(loginCode);
    const team: Team = {
      id: `team-${slug(loginCode)}`,
      name,
      loginCode,
      pin: generatePin(ctx.random),
      startingCash: input.startingCash ?? state.event.defaultStartingCash,
      status: "ACTIVE",
      createdAt: ctx.now,
      order: state.teams.length,
    };
    state.teams.push(team);
    state.allocationPlan.perTeam[team.id] = {
      cash: team.startingCash,
      shares: { ...state.allocationPlan.identical.shares },
    };
    created.push(team);
    appendAudit(state, {
      at: ctx.now,
      actor: ctx.actor,
      type: "TEAM_CREATED",
      teamId: team.id,
      summary: `Team ${team.name} created (${team.loginCode})`,
      after: { startingCash: team.startingCash },
      refs: {},
    });
    if (state.event.allocationsApplied) {
      const journal = allocateToTeam(state, ctx, team.id, allocationRowFor(state, team.id));
      appendAudit(state, {
        at: ctx.now,
        actor: ctx.actor,
        type: "ALLOCATION_APPLIED",
        teamId: team.id,
        summary: `Late-joining team ${team.name} received the starting allocation`,
        refs: { journalId: journal.id },
      });
    }
  }
  recordValuation(state, ctx.now);
  return ok(created);
}

export function updateTeam(
  state: EventState,
  ctx: OpContext,
  input: { teamId: string; name?: string; startingCash?: Paise },
): OpResult<Team> {
  const team = state.teams.find((t) => t.id === input.teamId);
  if (!team) return fail("NOT_FOUND", "Team not found.");
  const before = { name: team.name, startingCash: team.startingCash };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) return fail("INVALID_NAME", "Team name must be at least 2 characters.");
    if (state.teams.some((t) => t.id !== team.id && t.name.toLowerCase() === name.toLowerCase())) {
      return fail("DUPLICATE", "Another team already uses that name.");
    }
    team.name = name;
  }
  if (input.startingCash !== undefined) {
    if (state.event.allocationsApplied) return fail("LOCKED", "Starting capital is locked once allocations are applied.");
    team.startingCash = input.startingCash;
    state.allocationPlan.perTeam[team.id] = { ...(state.allocationPlan.perTeam[team.id] ?? { shares: {} }), cash: input.startingCash };
  }
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TEAM_UPDATED",
    teamId: team.id,
    summary: `Team ${team.name} updated`,
    before,
    after: { name: team.name, startingCash: team.startingCash },
    refs: {},
  });
  return ok(team);
}

export function setTeamStatus(state: EventState, ctx: OpContext, teamId: string, active: boolean): OpResult<Team> {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return fail("NOT_FOUND", "Team not found.");
  const status = active ? "ACTIVE" : "DISABLED";
  if (team.status === status) return ok(team);
  team.status = status;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: active ? "TEAM_ENABLED" : "TEAM_DISABLED",
    teamId,
    summary: `${team.name} ${active ? "enabled" : "disabled"}`,
    before: { status: active ? "DISABLED" : "ACTIVE" },
    after: { status },
    refs: {},
  });
  return ok(team);
}

export function regeneratePin(state: EventState, ctx: OpContext, teamId: string): OpResult<Team> {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return fail("NOT_FOUND", "Team not found.");
  team.pin = generatePin(ctx.random);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "TEAM_PIN_REGENERATED",
    teamId,
    summary: `PIN regenerated for ${team.name}`,
    refs: {},
  });
  return ok(team);
}

/* ───────────── Instruments ───────────── */

export type InstrumentInput = {
  symbol: string;
  name: string;
  sector: string;
  description: string;
  startingPrice: Paise;
  supply: number;
  floor: Paise | null;
  ceiling: Paise | null;
  circuitPct: number | null;
  enabled: boolean;
  exchange?: string | null;
  history?: PricePoint[];
};

function validateInstrument(state: EventState, input: InstrumentInput, existingId: string | null): string | null {
  if (!/^[A-Z][A-Z0-9&-]{0,11}$/.test(input.symbol)) return "Ticker must be 1–12 capital letters or digits, starting with a letter.";
  if (state.instruments.some((i) => i.symbol === input.symbol && i.id !== existingId)) return `Ticker ${input.symbol} is already used.`;
  if (input.name.trim().length < 2) return "Company name is required.";
  if (!(input.startingPrice > 0) || input.startingPrice % state.event.rules.tickSize !== 0) return "Starting price must be a positive multiple of ₹0.05.";
  if (!Number.isInteger(input.supply) || input.supply <= 0) return "Supply must be a positive whole number.";
  if (input.floor !== null && input.floor >= input.startingPrice) return "Floor must be below the starting price.";
  if (input.ceiling !== null && input.ceiling <= input.startingPrice) return "Ceiling must be above the starting price.";
  if (input.circuitPct !== null && (input.circuitPct <= 0 || input.circuitPct > 100)) return "Circuit limit must be between 0 and 100%.";
  return null;
}

export function createInstrument(state: EventState, ctx: OpContext, input: InstrumentInput): OpResult<Instrument> {
  if (!isEditablePhase(state)) return fail("LOCKED", "Stocks can only be added before the event starts.");
  const error = validateInstrument(state, input, null);
  if (error) return fail("INVALID", error);
  const instrument: Instrument = {
    id: `ins-${slug(input.symbol)}`,
    symbol: input.symbol,
    name: input.name.trim(),
    sector: input.sector.trim(),
    description: input.description.trim(),
    mode: state.event.universeMode,
    exchange: input.exchange ?? null,
    startingPrice: input.startingPrice,
    supply: input.supply,
    floor: input.floor,
    ceiling: input.ceiling,
    circuitPct: input.circuitPct,
    enabled: input.enabled,
    halted: false,
    history: input.history ?? [],
  };
  state.instruments.push(instrument);
  state.prices[instrument.id] = {
    instrumentId: instrument.id,
    price: instrument.startingPrice,
    eventOpenPrice: instrument.startingPrice,
    roundOpenPrice: instrument.startingPrice,
    lastPriceEventId: null,
    updatedAt: ctx.now,
  };
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "INSTRUMENT_CREATED",
    summary: `${instrument.symbol} · ${instrument.name} created at ${formatINR(instrument.startingPrice)}`,
    after: { symbol: instrument.symbol, startingPrice: instrument.startingPrice, supply: instrument.supply },
    refs: { instrumentId: instrument.id },
  });
  return ok(instrument);
}

export function updateInstrument(
  state: EventState,
  ctx: OpContext,
  instrumentId: string,
  input: InstrumentInput,
): OpResult<Instrument> {
  const instrument = state.instruments.find((i) => i.id === instrumentId);
  if (!instrument) return fail("NOT_FOUND", "Stock not found.");
  const error = validateInstrument(state, input, instrumentId);
  if (error) return fail("INVALID", error);
  const locked = !isEditablePhase(state) || state.event.allocationsApplied;
  if (locked && (input.startingPrice !== instrument.startingPrice || input.symbol !== instrument.symbol)) {
    return fail("LOCKED", "Ticker and starting price are locked once allocations are applied.");
  }
  const before = { ...instrument, history: undefined };
  Object.assign(instrument, {
    symbol: input.symbol,
    name: input.name.trim(),
    sector: input.sector.trim(),
    description: input.description.trim(),
    startingPrice: input.startingPrice,
    supply: input.supply,
    floor: input.floor,
    ceiling: input.ceiling,
    circuitPct: input.circuitPct,
    enabled: input.enabled,
    history: input.history ?? instrument.history,
  });
  if (!locked) {
    state.prices[instrument.id] = {
      ...state.prices[instrument.id],
      price: instrument.startingPrice,
      eventOpenPrice: instrument.startingPrice,
      roundOpenPrice: instrument.startingPrice,
    };
  }
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "INSTRUMENT_UPDATED",
    summary: `${instrument.symbol} settings updated`,
    before: { floor: before.floor, ceiling: before.ceiling, circuitPct: before.circuitPct, enabled: before.enabled, supply: before.supply },
    after: { floor: instrument.floor, ceiling: instrument.ceiling, circuitPct: instrument.circuitPct, enabled: instrument.enabled, supply: instrument.supply },
    refs: { instrumentId: instrument.id },
  });
  return ok(instrument);
}

/* ───────────── Allocation plan ───────────── */

export function saveAllocationPlan(
  state: EventState,
  ctx: OpContext,
  plan: Pick<EventState["allocationPlan"], "mode" | "distribution" | "identical" | "perTeam">,
): OpResult {
  if (state.event.allocationsApplied) return fail("LOCKED", "Allocations are locked after they are applied.");
  state.allocationPlan = { ...state.allocationPlan, ...plan };
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "SETTINGS_UPDATED",
    summary: `Allocation plan saved (${plan.mode === "CASH_ONLY" ? "cash only" : "cash + stocks"}, ${plan.distribution === "IDENTICAL" ? "identical" : "per team"})`,
    refs: {},
  });
  return ok();
}

/* ───────────── Rounds ───────────── */

export type RoundDraft = {
  id: string | null;
  name: string;
  type: RoundType;
  durationSeconds: number;
  tradableInstrumentIds: string[] | "ALL";
  leaderboardVisibilityOverride: ParticipantLeaderboardVisibility | null;
};

export function saveRounds(state: EventState, ctx: OpContext, drafts: RoundDraft[]): OpResult<Round[]> {
  if (drafts.length === 0) return fail("NO_ROUNDS", "An event needs at least one round.");
  for (const draft of drafts) {
    if (draft.name.trim().length < 2) return fail("INVALID", "Every round needs a name.");
    if (!(draft.durationSeconds >= 30)) return fail("INVALID", "Rounds must last at least 30 seconds.");
  }
  const byId = new Map(state.rounds.map((r) => [r.id, r]));
  const locked = state.rounds.filter((r) => r.status !== "PENDING");
  for (const round of locked) {
    const index = drafts.findIndex((d) => d.id === round.id);
    if (index === -1) return fail("LOCKED", `Round ${round.number} has already started and cannot be removed.`);
    if (index !== round.number) return fail("LOCKED", "Rounds that have started cannot be reordered.");
  }

  let counter = state.counters.ROUND ?? state.rounds.length;
  const rounds: Round[] = drafts.map((draft, index) => {
    const existing = draft.id ? byId.get(draft.id) : undefined;
    if (existing && existing.status !== "PENDING") {
      return { ...existing, name: draft.name.trim(), leaderboardVisibilityOverride: draft.leaderboardVisibilityOverride };
    }
    const id = existing?.id ?? `round-x${counter++}`;
    return {
      id,
      number: index,
      name: draft.name.trim(),
      type: draft.type,
      durationSeconds: draft.durationSeconds,
      status: "PENDING",
      startedAt: null,
      endsAt: null,
      pausedAt: null,
      remainingMsAtPause: null,
      endedAt: null,
      tradableInstrumentIds: draft.tradableInstrumentIds,
      leaderboardVisibilityOverride: draft.leaderboardVisibilityOverride,
    };
  });
  state.counters.ROUND = counter;
  const removed = state.rounds.filter((r) => !rounds.some((n) => n.id === r.id)).map((r) => r.id);
  for (const item of state.news) if (item.roundId && removed.includes(item.roundId)) item.roundId = null;
  state.rounds = rounds;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "ROUNDS_UPDATED",
    summary: `Round schedule saved (${rounds.length} rounds)`,
    after: { rounds: rounds.map((r) => `${r.number}. ${r.name} (${r.type}, ${Math.round(r.durationSeconds / 60)}m)`) },
    refs: {},
  });
  return ok(rounds);
}

/* ───────────── General settings ───────────── */

export type GeneralSettingsInput = {
  name: string;
  code: string;
  universeMode: SimEvent["universeMode"];
  capitalRule: SimEvent["capitalRule"];
  defaultStartingCash: Paise;
  rules: EventRules;
  themePolicy: ThemePolicy;
  scheduledDate: string;
};

export function updateGeneralSettings(state: EventState, ctx: OpContext, input: GeneralSettingsInput, otherCodes: string[]): OpResult {
  const { event } = state;
  if (input.name.trim().length < 3) return fail("INVALID", "Event name must be at least 3 characters.");
  if (!/^[A-Z0-9]{4,10}$/.test(input.code)) return fail("INVALID", "Event code must be 4–10 capital letters or digits.");
  if (otherCodes.includes(input.code)) return fail("DUPLICATE", `Event code ${input.code} is already in use.`);
  if (input.universeMode !== event.universeMode && state.instruments.length > 0) {
    return fail("LOCKED", "Universe mode can only change while the event has no stocks.");
  }
  if (!isEditablePhase(state) && (input.capitalRule !== event.capitalRule || input.defaultStartingCash !== event.defaultStartingCash)) {
    return fail("LOCKED", "Capital rules are locked once the event starts.");
  }
  if (input.rules.priceBandPct <= 0 || input.rules.priceBandPct > 50) return fail("INVALID", "Price band must be between 0 and 50%.");
  if (input.rules.approvalEnabled && !(input.rules.approvalThreshold && input.rules.approvalThreshold > 0)) {
    return fail("INVALID", "Set an approval threshold when approvals are enabled.");
  }

  const before = { name: event.name, code: event.code, rules: event.rules, themePolicy: event.themePolicy, capitalRule: event.capitalRule };
  event.name = input.name.trim();
  event.code = input.code;
  event.universeMode = input.universeMode;
  event.capitalRule = input.capitalRule;
  event.defaultStartingCash = input.defaultStartingCash;
  event.rules = { ...input.rules };
  event.themePolicy = input.themePolicy;
  event.scheduledDate = input.scheduledDate;
  if (isEditablePhase(state) && !state.event.allocationsApplied && input.capitalRule === "SAME") {
    for (const team of state.teams) {
      team.startingCash = input.defaultStartingCash;
      state.allocationPlan.perTeam[team.id] = { ...(state.allocationPlan.perTeam[team.id] ?? { shares: {} }), cash: input.defaultStartingCash };
    }
  }
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "SETTINGS_UPDATED",
    summary: before.code !== event.code ? `Event settings saved · code changed ${before.code} → ${event.code}` : "Event settings saved",
    before,
    after: { name: event.name, code: event.code, rules: event.rules, themePolicy: event.themePolicy, capitalRule: event.capitalRule },
    refs: {},
  });
  return ok();
}

/* ───────────── Leaderboard & projector ───────────── */

export function setLeaderboardVisibility(
  state: EventState,
  ctx: OpContext,
  input: {
    participantVisibility?: ParticipantLeaderboardVisibility;
    participantTopN?: number;
    projectorVisibility?: ProjectorLeaderboardVisibility;
    projectorTopN?: number;
  },
): OpResult {
  const settings = state.event.leaderboard;
  const before = { participantVisibility: settings.participantVisibility, projectorVisibility: settings.projectorVisibility };
  Object.assign(settings, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "LEADERBOARD_VISIBILITY_CHANGED",
    summary: `Leaderboard visibility: participants ${settings.participantVisibility.replace("_", " ").toLowerCase()}${settings.participantVisibility === "TOP_N" ? ` (${settings.participantTopN})` : ""}, projector ${settings.projectorVisibility.replace("_", " ").toLowerCase()}`,
    before,
    after: { participantVisibility: settings.participantVisibility, projectorVisibility: settings.projectorVisibility },
    refs: {},
  });
  return ok();
}

export function setLeaderboardFrozen(state: EventState, ctx: OpContext, frozen: boolean): OpResult {
  const settings = state.event.leaderboard;
  if (settings.frozen === frozen) return ok();
  settings.frozen = frozen;
  settings.frozenAt = frozen ? ctx.now : null;
  settings.frozenRows = frozen ? computeLeaderboard(state) : null;
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: frozen ? "LEADERBOARD_FROZEN" : "LEADERBOARD_UNFROZEN",
    summary: frozen ? "Leaderboard frozen for participants and projector" : "Leaderboard unfrozen",
    refs: {},
  });
  return ok();
}

export function updateProjector(
  state: EventState,
  ctx: OpContext,
  input: Partial<Omit<ProjectorSettings, "projectorKey">> & { regenerateKey?: boolean },
): OpResult<ProjectorSettings> {
  const projector = state.event.projector;
  const { regenerateKey, ...rest } = input;
  preserveRotationOnSceneEdit(state, ctx.now, () => Object.assign(projector, rest));
  if (regenerateKey) projector.projectorKey = generateProjectorKey(ctx.random);
  const describe = (scene: ProjectorScene | null | undefined) => (scene ? scene.replace(/_/g, " ").toLowerCase() : "rotation");
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "PROJECTOR_UPDATED",
    summary: regenerateKey
      ? "Projector link regenerated"
      : input.pinnedScene !== undefined
        ? `Projector ${input.pinnedScene ? `pinned to ${describe(input.pinnedScene)}` : "returned to rotation"}`
        : "Projector settings updated",
    refs: {},
  });
  return ok(projector);
}

/* ───────────── News library ───────────── */

export type NewsDraft = {
  headline: string;
  body: string;
  roundId: string | null;
  priority: NewsItem["priority"];
  status: "DRAFT" | "READY";
  impacts: Omit<NewsImpact, "id">[];
};

export function saveNewsItem(state: EventState, ctx: OpContext, newsItemId: string | null, draft: NewsDraft): OpResult<NewsItem> {
  const impacts: NewsImpact[] = draft.impacts.map((impact, index) => ({ ...impact, id: `${newsItemId ?? "new"}-impact-${index + 1}-${ctx.now}` }));
  const error = validateNewsItem({ headline: draft.headline, impacts });
  if (error) return fail("INVALID", error);
  if (impacts.some((impact) => !state.instruments.some((i) => i.id === impact.instrumentId))) {
    return fail("INVALID", "Every impact needs a valid stock.");
  }

  if (newsItemId) {
    const item = state.news.find((n) => n.id === newsItemId);
    if (!item) return fail("NOT_FOUND", "News item not found.");
    if (item.status === "RELEASED") return fail("LOCKED", "Released news cannot be edited.");
    Object.assign(item, { ...draft, headline: draft.headline.trim(), body: draft.body.trim(), impacts, updatedAt: ctx.now });
    // A schedule only applies to a Ready story; moving it back to draft cancels it so it can't fire later by surprise.
    if (item.status !== "READY") item.scheduledFor = null;
    appendAudit(state, {
      at: ctx.now,
      actor: ctx.actor,
      type: "NEWS_UPDATED",
      summary: `News #${item.number} updated`,
      refs: { newsItemId: item.id },
    });
    return ok(item);
  }

  const number = state.news.reduce((max, n) => Math.max(max, n.number), 0) + 1;
  const item: NewsItem = {
    id: `news-${String(number).padStart(2, "0")}-${ctx.now.toString(36)}`,
    number,
    headline: draft.headline.trim(),
    body: draft.body.trim(),
    roundId: draft.roundId,
    priority: draft.priority,
    status: draft.status,
    impacts,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    releaseId: null,
  };
  state.news.push(item);
  appendAudit(state, {
    at: ctx.now,
    actor: ctx.actor,
    type: "NEWS_CREATED",
    summary: `News #${item.number} created: ${item.headline}`,
    refs: { newsItemId: item.id },
  });
  return ok(item);
}
