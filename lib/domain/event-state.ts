import { appendAudit } from "./audit";
import type { EventConfig } from "./event-config";
import { recordValuation } from "./portfolio";
import { defaultRandomNewsState } from "./random-news";
import type { EventState, Instrument, NewsItem, ProjectorSceneSetting, Round, Team } from "./types";

export const DEFAULT_SCENES: ProjectorSceneSetting[] = [
  { scene: "STANDBY", enabled: true, durationSeconds: 15 },
  { scene: "ROUND_STATUS", enabled: true, durationSeconds: 12 },
  { scene: "LEADERBOARD", enabled: true, durationSeconds: 20 },
  { scene: "MARKET_BOARD", enabled: true, durationSeconds: 18 },
  { scene: "TOP_MOVERS", enabled: true, durationSeconds: 14 },
  { scene: "NEWS_WALL", enabled: true, durationSeconds: 14 },
  { scene: "CUSTOM_MESSAGE", enabled: false, durationSeconds: 12 },
  { scene: "FINAL_RESULTS", enabled: true, durationSeconds: 30 },
];

export const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export function generatePin(random: () => number): string {
  return String(Math.floor(1000 + random() * 9000));
}

export function generateProjectorKey(random: () => number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

export function loginCodeFromName(name: string, taken: Set<string>): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  let base = (words[0] ?? "TEAM").slice(0, 10);
  if (base.length < 3) base = (words.join("") || "TEAM").slice(0, 10).padEnd(3, "X");
  let code = base;
  let n = 2;
  while (taken.has(code)) code = `${base.slice(0, 9)}${n++}`;
  return code;
}

type CreateOptions = { id: string; now: number; random: () => number; templateId?: string | null; hostName: string };

/** Builds a complete event aggregate from a validated EventConfig (used by scenarios and the wizard). */
export function createEventState(config: EventConfig, options: CreateOptions): EventState {
  const { now } = options;
  const instruments: Instrument[] = config.instruments.map((ic) => ({
    id: `ins-${slug(ic.symbol)}`,
    symbol: ic.symbol,
    name: ic.name,
    sector: ic.sector,
    description: ic.description,
    mode: ic.mode,
    exchange: ic.exchange,
    startingPrice: ic.startingPrice,
    supply: ic.supply,
    floor: ic.floor,
    ceiling: ic.ceiling,
    circuitPct: ic.circuitPct,
    enabled: ic.enabled,
    halted: false,
    history: ic.history,
  }));
  const idBySymbol = new Map(instruments.map((i) => [i.symbol, i.id]));

  const rounds: Round[] = config.rounds.map((rc, index) => ({
    id: `round-${index}`,
    number: index,
    name: rc.name,
    type: rc.type,
    durationSeconds: rc.durationSeconds,
    status: "PENDING",
    startedAt: null,
    endsAt: null,
    pausedAt: null,
    remainingMsAtPause: null,
    endedAt: null,
    tradableInstrumentIds: rc.tradableSymbols === "ALL" ? "ALL" : rc.tradableSymbols.map((s) => idBySymbol.get(s)!).filter(Boolean),
    leaderboardVisibilityOverride: rc.leaderboardVisibilityOverride,
  }));

  const teams: Team[] = config.teams.map((tc, index) => ({
    id: `team-${slug(tc.loginCode)}`,
    name: tc.name,
    loginCode: tc.loginCode,
    pin: tc.pin,
    startingCash: config.capitalRule === "SAME" ? config.defaultStartingCash : tc.startingCash,
    status: "ACTIVE",
    createdAt: now,
    order: index,
  }));

  const news: NewsItem[] = config.news.map((nc, index) => ({
    id: `news-${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
    headline: nc.headline,
    body: nc.body,
    roundId: nc.roundIndex === null ? null : `round-${nc.roundIndex}`,
    priority: nc.priority,
    status: nc.status,
    impacts: nc.impacts.map((impact, impactIndex) => ({
      id: `news-${index + 1}-impact-${impactIndex + 1}`,
      instrumentId: idBySymbol.get(impact.symbol)!,
      direction: impact.direction,
      mode: impact.mode,
      fixedPct: impact.fixedPct,
      minPct: impact.minPct,
      maxPct: impact.maxPct,
      timing: impact.timing,
    })),
    createdAt: now,
    updatedAt: now,
    releaseId: null,
  }));

  const identicalShares = Object.fromEntries(
    Object.entries(config.allocation.identical.shares).map(([sym, qty]) => [idBySymbol.get(sym)!, qty]),
  );

  const state: EventState = {
    event: {
      id: options.id,
      code: config.code,
      name: config.name,
      status: "DRAFT",
      tradingMode: config.tradingMode,
      universeMode: config.universeMode,
      newsMode: config.newsMode,
      capitalRule: config.capitalRule,
      defaultStartingCash: config.defaultStartingCash,
      rules: { ...config.rules },
      themePolicy: config.themePolicy,
      tradingFrozen: false,
      tradingFrozenAt: null,
      currentRoundId: null,
      allocationsApplied: false,
      scheduledDate: config.scheduledDate,
      templateId: options.templateId ?? null,
      createdAt: now,
      startedAt: null,
      pausedAt: null,
      endedAt: null,
      leaderboard: { ...config.leaderboard, frozen: false, frozenAt: null, frozenRows: null },
      projector: {
        scenes: DEFAULT_SCENES.map((s) => ({ ...s })),
        pinnedScene: null,
        rotation: { anchorScene: null, anchorAt: now },
        takeover: null,
        customMessage: { title: "The next round starts shortly", body: "Check the latest news and get your trades ready." },
        breakingNewsSeconds: config.projector.breakingNewsSeconds,
        tickerEnabled: config.projector.tickerEnabled,
        tickerSpeed: "NORMAL",
        theme: config.projector.theme,
        projectorKey: generateProjectorKey(options.random),
      },
    },
    rounds,
    teams,
    instruments,
    prices: Object.fromEntries(
      instruments.map((i) => [
        i.id,
        { instrumentId: i.id, price: i.startingPrice, eventOpenPrice: i.startingPrice, roundOpenPrice: i.startingPrice, lastPriceEventId: null, updatedAt: now },
      ]),
    ),
    priceEvents: [],
    allocationPlan: {
      mode: config.allocation.mode,
      distribution: config.allocation.distribution,
      identical: { cash: config.allocation.identical.cash, shares: identicalShares },
      perTeam: Object.fromEntries(
        teams.map((team) => [team.id, { cash: team.startingCash || config.allocation.identical.cash, shares: { ...identicalShares } }]),
      ),
      appliedAt: null,
      applied: {},
    },
    balances: {},
    costBasis: {},
    realizedPnl: {},
    capitalBase: {},
    journals: [],
    proposals: [],
    trades: [],
    news,
    newsReleases: [],
    adjustments: [],
    audit: [],
    valuations: [],
    eventStartMark: null,
    roundMarks: {},
    processedCommands: {},
    counters: {},
    randomNews: defaultRandomNewsState(),
  };

  const actor = { type: "HOST" as const, name: options.hostName };
  appendAudit(state, {
    at: now,
    actor,
    type: "EVENT_CREATED",
    roundId: null,
    summary: `${config.name} created${options.templateId ? " from template" : ""}`,
    after: { code: config.code, universeMode: config.universeMode, teams: teams.length, rounds: rounds.length },
    refs: options.templateId ? { templateId: options.templateId } : {},
  });
  for (const team of teams) {
    appendAudit(state, {
      at: now,
      actor,
      type: "TEAM_CREATED",
      teamId: team.id,
      roundId: null,
      summary: `Team ${team.name} created (${team.loginCode})`,
      refs: {},
    });
  }
  recordValuation(state, now);
  return state;
}
