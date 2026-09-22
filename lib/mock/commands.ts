import type { ScenarioTiming } from "@/data/scenarios/shared";
import { DEMO_EVENT_ID } from "@/data/scenarios/shared";
import type { EventConfig } from "@/lib/domain/event-config";
import { parseEventConfig } from "@/lib/domain/event-config";
import { createEventState, slug } from "@/lib/domain/event-state";
import { nextId } from "@/lib/domain/ids";
import * as lifecycle from "@/lib/domain/lifecycle";
import * as news from "@/lib/domain/news";
import * as p2p from "@/lib/domain/p2p";
import { actorCan, type Permission } from "@/lib/domain/permissions";
import * as portfolio from "@/lib/domain/portfolio";
import * as projector from "@/lib/domain/projector";
import * as randomNews from "@/lib/domain/random-news";
import * as setup from "@/lib/domain/setup";
import type {
  Actor,
  AdjustmentType,
  EventState,
  OpContext,
  OpResult,
  Paise,
  ParticipantLeaderboardVisibility,
  ProjectorLeaderboardVisibility,
  ProjectorScene,
  ProjectorSettings,
  UniverseMode,
} from "@/lib/domain/types";
import { fail, ok } from "@/lib/domain/types";
import { buildDemoEvent, HOST_NAME, transact, createInitialStore } from "./store";

/**
 * Command layer: the ONLY way UI changes state. Every command checks permissions, runs a domain
 * operation inside a cross-tab transaction, and persists only when the operation succeeded (or asked
 * to persist a failure such as a FAILED proposal). Phase 2 swaps these bodies for server actions
 * with the same inputs and OpResult outputs.
 */

const MAX_PROCESSED = 300;

type EventOp<T> = (state: EventState, ctx: OpContext) => OpResult<T>;

function runEventCommand<T>(
  eventId: string,
  actor: Actor,
  permission: Permission,
  label: string,
  op: EventOp<T>,
  idempotencyKey?: string,
): Promise<OpResult<T>> {
  return transact((store) => {
    const state = store.events[eventId];
    if (!state) return { commit: false, result: fail("EVENT_NOT_FOUND", "Event not found.") };
    if (!actorCan(actor, permission)) return { commit: false, result: fail("FORBIDDEN", "You do not have permission to do that.") };

    if (idempotencyKey) {
      const processed = state.processedCommands[idempotencyKey];
      if (processed) return { commit: false, result: processed.result as OpResult<T> };
    }

    const ctx: OpContext = { now: Date.now(), actor, random: Math.random };
    let result: OpResult<T>;
    try {
      result = op(state, ctx);
    } catch (error) {
      console.error(`Command ${label} failed`, error);
      return { commit: false, result: fail("UNEXPECTED", error instanceof Error ? error.message : "Unexpected error") };
    }

    const commit = result.ok || result.persist === true;
    if (commit && idempotencyKey) {
      state.processedCommands[idempotencyKey] = { at: ctx.now, command: label, result };
      const keys = Object.keys(state.processedCommands);
      if (keys.length > MAX_PROCESSED) {
        keys
          .sort((a, b) => state.processedCommands[a].at - state.processedCommands[b].at)
          .slice(0, keys.length - MAX_PROCESSED)
          .forEach((k) => delete state.processedCommands[k]);
      }
    }
    return { commit, result };
  });
}

const host = (): Actor => ({ type: "HOST", name: HOST_NAME });

/* ───────────── Event lifecycle ───────────── */

export const startEvent = (eventId: string) => runEventCommand(eventId, host(), "event.control", "startEvent", lifecycle.startEvent);
export const pauseEvent = (eventId: string) => runEventCommand(eventId, host(), "event.control", "pauseEvent", lifecycle.pauseEvent);
export const resumeEvent = (eventId: string) => runEventCommand(eventId, host(), "event.control", "resumeEvent", lifecycle.resumeEvent);
export const endEvent = (eventId: string, reason: string, key?: string) =>
  runEventCommand(eventId, host(), "event.control", "endEvent", (s, c) => lifecycle.endEvent(s, c, reason), key);

export const startRound = (eventId: string) => runEventCommand(eventId, host(), "round.control", "startRound", lifecycle.startRound);
export const pauseRound = (eventId: string) => runEventCommand(eventId, host(), "round.control", "pauseRound", lifecycle.pauseRound);
export const resumeRound = (eventId: string) => runEventCommand(eventId, host(), "round.control", "resumeRound", lifecycle.resumeRound);
export const endRound = (eventId: string) => runEventCommand(eventId, host(), "round.control", "endRound", (s, c) => lifecycle.endRound(s, c));
export const nextRound = (eventId: string) => runEventCommand(eventId, host(), "round.control", "nextRound", lifecycle.nextRound);

export const freezeTrading = (eventId: string, note: string | null) =>
  runEventCommand(eventId, host(), "trading.freeze", "freezeTrading", (s, c) => lifecycle.freezeTrading(s, c, note));
export const unfreezeTrading = (eventId: string) => runEventCommand(eventId, host(), "trading.freeze", "unfreezeTrading", lifecycle.unfreezeTrading);

/* ───────────── P2P trading (team actor) ───────────── */

export type ProposeTradeInput = Omit<p2p.ProposalInput, "proposerTeamId">;

export const proposeTrade = (eventId: string, teamId: string, input: ProposeTradeInput) =>
  runEventCommand(eventId, { type: "TEAM", teamId }, "trade.propose", "proposeTrade", (s, c) =>
    p2p.proposeTrade(s, c, { ...input, proposerTeamId: teamId }),
  );

export const acceptProposal = (eventId: string, teamId: string, proposalId: string) =>
  runEventCommand(eventId, { type: "TEAM", teamId }, "trade.respond", "acceptProposal", (s, c) =>
    p2p.acceptProposal(s, c, { proposalId, teamId }),
  );

/** Counter-offer: rejects the original and sends a linked proposal the other way, atomically. */
export const counterProposal = (eventId: string, teamId: string, input: { originalProposalId: string; quantity: number; price: Paise; idempotencyKey: string }) =>
  runEventCommand(eventId, { type: "TEAM", teamId }, "trade.propose", "counterProposal", (s, c) => p2p.counterProposal(s, c, { ...input, teamId }));

export const rejectProposal = (eventId: string, teamId: string, proposalId: string, reason?: string) =>
  runEventCommand(eventId, { type: "TEAM", teamId }, "trade.respond", "rejectProposal", (s, c) =>
    p2p.rejectProposal(s, c, { proposalId, teamId, reason }),
  );

export const cancelProposal = (eventId: string, teamId: string, proposalId: string) =>
  runEventCommand(eventId, { type: "TEAM", teamId }, "trade.propose", "cancelProposal", (s, c) =>
    p2p.cancelProposal(s, c, { proposalId, teamId }),
  );

export const approveProposal = (eventId: string, proposalId: string, key?: string) =>
  runEventCommand(eventId, host(), "trades.approve", "approveProposal", (s, c) => p2p.approveProposal(s, c, proposalId), key);

export const rejectProposalByHost = (eventId: string, proposalId: string, reason: string, key?: string) =>
  runEventCommand(eventId, host(), "trades.approve", "rejectByHost", (s, c) => p2p.rejectByHost(s, c, proposalId, reason), key);

/* ───────────── News & prices ───────────── */

export const releaseNews = (eventId: string, newsItemId: string, key?: string) =>
  runEventCommand(eventId, host(), "news.release", "releaseNews", (s, c) => randomNews.releaseNewsManually(s, c, newsItemId), key);

/* ───────────── Random news mode ───────────── */

export const setNewsReleaseMode = (eventId: string, mode: "MANUAL" | "RANDOM") =>
  runEventCommand(eventId, host(), "news.release", "setNewsReleaseMode", (s, c) => randomNews.setRandomNewsMode(s, c, mode));

export const updateRandomNewsSettings = (eventId: string, input: randomNews.RandomNewsSettingsInput) =>
  runEventCommand(eventId, host(), "news.release", "updateRandomNewsSettings", (s, c) => randomNews.updateRandomNewsSettings(s, c, input));

export const startRandomNews = (eventId: string) => runEventCommand(eventId, host(), "news.release", "startRandomNews", randomNews.startRandomNews);
export const pauseRandomNews = (eventId: string) => runEventCommand(eventId, host(), "news.release", "pauseRandomNews", randomNews.pauseRandomNews);
export const resumeRandomNews = (eventId: string) => runEventCommand(eventId, host(), "news.release", "resumeRandomNews", randomNews.resumeRandomNews);
export const stopRandomNews = (eventId: string) => runEventCommand(eventId, host(), "news.release", "stopRandomNews", randomNews.stopRandomNews);
export const skipRandomNews = (eventId: string) => runEventCommand(eventId, host(), "news.release", "skipRandomNews", randomNews.skipScheduledRandomNews);

export const releaseRandomNewsNow = (eventId: string, key?: string) =>
  runEventCommand(eventId, host(), "news.release", "releaseRandomNewsNow", randomNews.releaseRandomNow, key);

export const setRandomPoolMembership = (eventId: string, newsItemId: string, included: boolean) =>
  runEventCommand(eventId, host(), "news.release", "setRandomPoolMembership", (s, c) => randomNews.toggleRandomPool(s, c, newsItemId, included));

export const skipNews = (eventId: string, newsItemId: string) =>
  runEventCommand(eventId, host(), "news.manage", "skipNews", (s, c) => news.skipNews(s, c, newsItemId));

export const saveNews = (eventId: string, newsItemId: string | null, draft: setup.NewsDraft) =>
  runEventCommand(eventId, host(), "news.manage", "saveNews", (s, c) => setup.saveNewsItem(s, c, newsItemId, draft));

export const setInstrumentPrice = (eventId: string, instrumentId: string, targetPrice: Paise, reason: string, key?: string) =>
  runEventCommand(
    eventId,
    host(),
    "prices.manage",
    "setInstrumentPrice",
    (s, c) => lifecycle.manualPriceChange(s, c, { instrumentId, mode: "SET", targetPrice, reason, adjustmentId: nextId(s, "MPC", 600) }),
    key,
  );

export const moveInstrumentPricePercent = (eventId: string, instrumentId: string, pct: number, reason: string, key?: string) =>
  runEventCommand(
    eventId,
    host(),
    "prices.manage",
    "moveInstrumentPricePercent",
    (s, c) => lifecycle.manualPriceChange(s, c, { instrumentId, mode: "PERCENT", pct, reason, adjustmentId: nextId(s, "MPC", 600) }),
    key,
  );

export const haltInstrument = (eventId: string, instrumentId: string) =>
  runEventCommand(eventId, host(), "prices.manage", "haltInstrument", (s, c) => lifecycle.haltInstrument(s, c, instrumentId, true));

export const resumeInstrument = (eventId: string, instrumentId: string) =>
  runEventCommand(eventId, host(), "prices.manage", "resumeInstrument", (s, c) => lifecycle.haltInstrument(s, c, instrumentId, false));

/* ───────────── Teams & portfolios ───────────── */

export const adjustTeamCash = (eventId: string, input: { teamId: string; amount: Paise; adjustmentType: AdjustmentType; reason: string }, key?: string) =>
  runEventCommand(eventId, host(), "teams.adjust", "adjustTeamCash", (s, c) => portfolio.adjustCash(s, c, input), key);

export const adjustTeamHolding = (
  eventId: string,
  input: { teamId: string; instrumentId: string; quantity: number; adjustmentType: AdjustmentType; reason: string },
  key?: string,
) => runEventCommand(eventId, host(), "teams.adjust", "adjustTeamHolding", (s, c) => portfolio.adjustHolding(s, c, input), key);

export const resetTeam = (eventId: string, teamId: string, reason: string, key?: string) =>
  runEventCommand(eventId, host(), "teams.adjust", "resetTeam", (s, c) => portfolio.resetTeam(s, c, teamId, reason), key);

export const addTeams = (eventId: string, names: string[], startingCash?: Paise) =>
  runEventCommand(eventId, host(), "teams.manage", "addTeams", (s, c) => setup.addTeams(s, c, { names, startingCash }));

export const updateTeam = (eventId: string, input: { teamId: string; name?: string; startingCash?: Paise }) =>
  runEventCommand(eventId, host(), "teams.manage", "updateTeam", (s, c) => setup.updateTeam(s, c, input));

export const setTeamStatus = (eventId: string, teamId: string, active: boolean) =>
  runEventCommand(eventId, host(), "teams.manage", "setTeamStatus", (s, c) => setup.setTeamStatus(s, c, teamId, active));

export const regenerateTeamPin = (eventId: string, teamId: string) =>
  runEventCommand(eventId, host(), "teams.manage", "regeneratePin", (s, c) => setup.regeneratePin(s, c, teamId));

/* ───────────── Setup ───────────── */

export const createInstrument = (eventId: string, input: setup.InstrumentInput) =>
  runEventCommand(eventId, host(), "instruments.manage", "createInstrument", (s, c) => setup.createInstrument(s, c, input));

export const updateInstrument = (eventId: string, instrumentId: string, input: setup.InstrumentInput) =>
  runEventCommand(eventId, host(), "instruments.manage", "updateInstrument", (s, c) => setup.updateInstrument(s, c, instrumentId, input));

export const saveAllocationPlan = (eventId: string, plan: Parameters<typeof setup.saveAllocationPlan>[2]) =>
  runEventCommand(eventId, host(), "allocations.manage", "saveAllocationPlan", (s, c) => setup.saveAllocationPlan(s, c, plan));

export const applyAllocations = (eventId: string, plan: Parameters<typeof setup.saveAllocationPlan>[2], key?: string) =>
  runEventCommand(
    eventId,
    host(),
    "allocations.manage",
    "applyAllocations",
    (s, c) => {
      const saved = setup.saveAllocationPlan(s, c, plan);
      if (!saved.ok) return saved;
      return portfolio.applyAllocations(s, c);
    },
    key,
  );

export const saveRounds = (eventId: string, drafts: setup.RoundDraft[]) =>
  runEventCommand(eventId, host(), "settings.manage", "saveRounds", (s, c) => setup.saveRounds(s, c, drafts));

export const updateGeneralSettings = (eventId: string, input: setup.GeneralSettingsInput) =>
  transact((store) => {
    const otherCodes = Object.values(store.events)
      .filter((e) => e.event.id !== eventId)
      .map((e) => e.event.code);
    return { commit: false, result: otherCodes };
  }).then((otherCodes) =>
    runEventCommand(eventId, host(), "settings.manage", "updateGeneralSettings", (s, c) => setup.updateGeneralSettings(s, c, input, otherCodes)),
  );

export const setLeaderboardVisibility = (
  eventId: string,
  input: {
    participantVisibility?: ParticipantLeaderboardVisibility;
    participantTopN?: number;
    projectorVisibility?: ProjectorLeaderboardVisibility;
    projectorTopN?: number;
  },
) => runEventCommand(eventId, host(), "leaderboard.manage", "setLeaderboardVisibility", (s, c) => setup.setLeaderboardVisibility(s, c, input));

export const freezeLeaderboard = (eventId: string) =>
  runEventCommand(eventId, host(), "leaderboard.manage", "freezeLeaderboard", (s, c) => setup.setLeaderboardFrozen(s, c, true));

export const unfreezeLeaderboard = (eventId: string) =>
  runEventCommand(eventId, host(), "leaderboard.manage", "unfreezeLeaderboard", (s, c) => setup.setLeaderboardFrozen(s, c, false));

export const updateProjector = (eventId: string, input: Partial<Omit<ProjectorSettings, "projectorKey">> & { regenerateKey?: boolean }) =>
  runEventCommand(eventId, host(), "projector.manage", "updateProjector", (s, c) => setup.updateProjector(s, c, input));

export const stepProjectorScene = (eventId: string, direction: 1 | -1) =>
  runEventCommand(eventId, host(), "projector.manage", "stepProjectorScene", (s, c) => projector.stepProjectorScene(s, c, direction));

export const pinProjectorScene = (eventId: string, scene: ProjectorScene | null) =>
  runEventCommand(eventId, host(), "projector.manage", "pinProjectorScene", (s, c) => projector.pinProjectorScene(s, c, scene));

export const showLatestNewsOnProjector = (eventId: string) =>
  runEventCommand(eventId, host(), "projector.manage", "showLatestNewsOnProjector", projector.showLatestNewsOnProjector);

export const showProjectorMessage = (eventId: string, input: { title: string; body: string; durationSeconds: number | null }) =>
  runEventCommand(eventId, host(), "projector.manage", "showProjectorMessage", (s, c) => projector.showProjectorMessage(s, c, input));

export const clearProjectorTakeover = (eventId: string) => runEventCommand(eventId, host(), "projector.manage", "clearProjectorTakeover", projector.clearProjectorTakeover);

/* ───────────── Event creation & demo ───────────── */

export function createEventFromConfig(config: EventConfig, templateId: string | null): Promise<OpResult<{ eventId: string }>> {
  const parsed = parseEventConfig(config);
  if (!parsed.success) return Promise.resolve(fail("INVALID_CONFIG", parsed.error.issues[0]?.message ?? "Invalid event configuration."));
  return transact((store) => {
    if (Object.values(store.events).some((e) => e.event.code === parsed.data.code)) {
      return { commit: false, result: fail("DUPLICATE_CODE", `Event code ${parsed.data.code} is already in use.`) };
    }
    let eventId = slug(parsed.data.name) || "event";
    while (store.events[eventId]) eventId = `${eventId}-${Math.floor(Math.random() * 1000)}`;
    const state = createEventState(parsed.data, { id: eventId, now: Date.now(), random: Math.random, templateId, hostName: HOST_NAME });
    store.events[eventId] = state;
    store.eventOrder = [eventId, ...store.eventOrder.filter((id) => id !== eventId)];
    return { commit: true, result: ok({ eventId }) };
  });
}

export function loadDemoScenario(scenario: UniverseMode, timing: ScenarioTiming): Promise<OpResult> {
  return transact((store) => {
    store.events[DEMO_EVENT_ID] = buildDemoEvent(scenario, timing, Date.now());
    if (!store.eventOrder.includes(DEMO_EVENT_ID)) store.eventOrder.unshift(DEMO_EVENT_ID);
    store.demo = { scenario, timing };
    return { commit: true, result: ok() };
  });
}

export function resetDemo(): Promise<OpResult> {
  return transact((store) => {
    store.events[DEMO_EVENT_ID] = buildDemoEvent(store.demo.scenario, store.demo.timing, Date.now());
    return { commit: true, result: ok() };
  });
}

export function resetAllPrototypeData(): Promise<OpResult> {
  return transact((store) => {
    const fresh = createInitialStore(Date.now(), store.demo);
    Object.assign(store, { events: fresh.events, eventOrder: fresh.eventOrder });
    return { commit: true, result: ok() };
  });
}

/* ───────────── Scheduled work (stand-in for the Phase 4 worker) ───────────── */

export function runScheduledWork(eventId: string): Promise<OpResult<{ expired: number; roundEnded: boolean; newsReleased: boolean }>> {
  return runEventCommand(eventId, { type: "SYSTEM", name: "Scheduler" }, "round.control", "scheduledWork", (s, c) => {
    const roundEnded = lifecycle.endRoundIfExpired(s, c);
    const expired = p2p.expireDueProposals(s, c);
    const random = randomNews.tickRandomNews(s, c);
    if (!roundEnded && expired === 0 && !random.changed) return fail("NOTHING_DUE", "Nothing due.");
    return ok({ expired, roundEnded, newsReleased: random.release !== null });
  });
}
