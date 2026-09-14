/** Integer paise. ₹1 = 100 paise. All money and prices in the domain use this unit. */
export type Paise = number;

export type EventStatus = "DRAFT" | "READY" | "LIVE" | "PAUSED" | "COMPLETED";
export type RoundType = "BRIEFING" | "TRADING";
export type RoundStatus = "PENDING" | "RUNNING" | "PAUSED" | "ENDED";
export type TradingMode = "P2P" | "SIMULATED_EXCHANGE";
export type UniverseMode = "CUSTOM" | "REAL_SIMULATED";
export type InstrumentMode = UniverseMode;
export type NewsMode = "MANUAL" | "AUTOMATIC";
export type ThemePolicy = "FORCE_DARK" | "FORCE_LIGHT" | "PARTICIPANT_CHOICE";
export type CapitalRule = "SAME" | "CUSTOM";
export type TeamStatus = "ACTIVE" | "DISABLED";

export type MarketState =
  | "NOT_STARTED"
  | "BRIEFING"
  | "OPEN"
  | "PAUSED"
  | "FROZEN"
  | "BETWEEN_ROUNDS"
  | "COMPLETED";

export type ParticipantLeaderboardVisibility = "FULL" | "TOP_N" | "OWN_RANK" | "HIDDEN";
export type ProjectorLeaderboardVisibility = "FULL" | "TOP_N" | "HIDDEN";

export type Actor =
  | { type: "HOST"; name: string }
  | { type: "TEAM"; teamId: string }
  | { type: "SYSTEM"; name: string };

export type EventRules = {
  priceBandPct: number;
  approvalEnabled: boolean;
  approvalThreshold: Paise | null;
  proposalExpirySeconds: number;
  maxOpenOutgoingProposals: number;
  tickSize: Paise;
};

export type LeaderboardSettings = {
  participantVisibility: ParticipantLeaderboardVisibility;
  participantTopN: number;
  projectorVisibility: ProjectorLeaderboardVisibility;
  projectorTopN: number;
  frozen: boolean;
  frozenAt: number | null;
  frozenRows: LeaderboardRow[] | null;
};

export type ProjectorScene =
  | "STANDBY"
  | "ROUND_STATUS"
  | "LEADERBOARD"
  | "MARKET_BOARD"
  | "TOP_MOVERS"
  | "NEWS_WALL"
  | "CUSTOM_MESSAGE"
  | "FINAL_RESULTS";

export type ProjectorSceneSetting = {
  scene: ProjectorScene;
  enabled: boolean;
  durationSeconds: number;
};

/** The rotating scene an overlay interrupted, so it can pick up where it left off. */
export type ProjectorResumePoint = { scene: ProjectorScene; elapsedMs: number };

/** A temporary full-screen overlay on top of the scene rotation. */
export type ProjectorTakeover =
  | { kind: "NEWS"; releaseId: string; startedAt: number; durationSeconds: number; resume?: ProjectorResumePoint | null }
  | { kind: "MESSAGE"; title: string; body: string; startedAt: number; durationSeconds: number | null; resume?: ProjectorResumePoint | null };

export type ProjectorSettings = {
  scenes: ProjectorSceneSetting[];
  pinnedScene: ProjectorScene | null;
  /** Rotation is computed from this anchor and the clock, so every screen shows the same scene. */
  rotation: { anchorScene: ProjectorScene | null; anchorAt: number };
  takeover: ProjectorTakeover | null;
  customMessage: { title: string; body: string };
  breakingNewsSeconds: number;
  tickerEnabled: boolean;
  tickerSpeed: "SLOW" | "NORMAL" | "FAST";
  theme: "DARK" | "LIGHT";
  projectorKey: string;
};

export type SimEvent = {
  id: string;
  code: string;
  name: string;
  status: EventStatus;
  tradingMode: TradingMode;
  universeMode: UniverseMode;
  newsMode: NewsMode;
  capitalRule: CapitalRule;
  defaultStartingCash: Paise;
  rules: EventRules;
  themePolicy: ThemePolicy;
  tradingFrozen: boolean;
  tradingFrozenAt: number | null;
  currentRoundId: string | null;
  allocationsApplied: boolean;
  scheduledDate: string;
  templateId: string | null;
  createdAt: number;
  startedAt: number | null;
  pausedAt: number | null;
  endedAt: number | null;
  leaderboard: LeaderboardSettings;
  projector: ProjectorSettings;
};

export type Round = {
  id: string;
  number: number;
  name: string;
  type: RoundType;
  durationSeconds: number;
  status: RoundStatus;
  startedAt: number | null;
  endsAt: number | null;
  pausedAt: number | null;
  remainingMsAtPause: number | null;
  endedAt: number | null;
  tradableInstrumentIds: string[] | "ALL";
  leaderboardVisibilityOverride: ParticipantLeaderboardVisibility | null;
};

export type Team = {
  id: string;
  name: string;
  loginCode: string;
  /** Prototype only: stored in plain text. Phase 2 stores a hash. */
  pin: string;
  startingCash: Paise;
  status: TeamStatus;
  createdAt: number;
  order: number;
};

export type PricePoint = { t: number; price: Paise };

export type Instrument = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  description: string;
  mode: InstrumentMode;
  exchange: string | null;
  startingPrice: Paise;
  supply: number;
  floor: Paise | null;
  ceiling: Paise | null;
  circuitPct: number | null;
  enabled: boolean;
  halted: boolean;
  history: PricePoint[];
};

/** Current fast price snapshot (maps to the future `Price` table). */
export type PriceSnapshot = {
  instrumentId: string;
  price: Paise;
  eventOpenPrice: Paise;
  roundOpenPrice: Paise;
  lastPriceEventId: string | null;
  updatedAt: number;
};

export type PriceEventSource = "OPENING" | "NEWS" | "MANUAL" | "GRADUAL_STEP" | "BACKGROUND" | "TRADE_IMPACT";

export type ConfiguredImpact =
  | { kind: "NEWS_FIXED"; pct: number }
  | { kind: "NEWS_RANGE"; minPct: number; maxPct: number }
  | { kind: "MANUAL_SET"; targetPrice: Paise }
  | { kind: "MANUAL_PERCENT"; pct: number };

export type ClampReason = "CIRCUIT_UPPER" | "CIRCUIT_LOWER" | "FLOOR" | "CEILING" | "MIN_TICK";

/** Immutable price history row (maps to the future `PriceEvent` table). */
export type PriceEvent = {
  id: string;
  instrumentId: string;
  roundId: string | null;
  at: number;
  previousPrice: Paise;
  newPrice: Paise;
  source: PriceEventSource;
  newsReleaseId: string | null;
  manualAdjustmentId: string | null;
  tradeId: string | null;
  configuredImpact: ConfiguredImpact | null;
  resolvedImpactPct: number | null;
  appliedPct: number;
  clamped: boolean;
  clampReasons: ClampReason[];
  actor: Actor;
  reason: string | null;
};

export type LedgerAccount = string;
export type LedgerAsset = string;
export type JournalType = "ALLOCATION" | "TRADE" | "ADJUSTMENT" | "RESET" | "REVERSAL";

export type LedgerPosting = {
  account: LedgerAccount;
  asset: LedgerAsset;
  amount: number;
  balanceAfter: number;
};

export type LedgerJournal = {
  id: string;
  type: JournalType;
  roundId: string | null;
  referenceId: string;
  at: number;
  actor: Actor;
  memo: string;
  reason: string | null;
  postings: LedgerPosting[];
};

export type Balances = Record<LedgerAccount, Record<LedgerAsset, number>>;

export type TradeSide = "BUY" | "SELL";

export type ProposalStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "PENDING_APPROVAL"
  | "SETTLED"
  | "REJECTED"
  | "REJECTED_BY_HOST"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type ProposalStatusChange = { status: ProposalStatus; at: number; note: string | null };

export type TradeProposal = {
  id: string;
  roundId: string | null;
  idempotencyKey: string;
  proposerTeamId: string;
  counterpartyTeamId: string;
  /** Side from the proposer's perspective. */
  side: TradeSide;
  instrumentId: string;
  quantity: number;
  price: Paise;
  referencePriceAtProposal: Paise;
  createdAt: number;
  expiresAt: number;
  status: ProposalStatus;
  history: ProposalStatusChange[];
  tradeId: string | null;
  failureReason: string | null;
  rejectionReason: string | null;
};

export type Trade = {
  id: string;
  roundId: string | null;
  proposalId: string;
  instrumentId: string;
  buyerTeamId: string;
  sellerTeamId: string;
  quantity: number;
  price: Paise;
  value: Paise;
  settledAt: number;
  journalId: string;
};

export type NewsStatus = "DRAFT" | "READY" | "RELEASED" | "SKIPPED";
export type NewsPriority = "LOW" | "NORMAL" | "HIGH";
export type ImpactDirection = "UP" | "DOWN";
export type ImpactMode = "FIXED" | "RANGE";
export type ImpactTiming = "IMMEDIATE" | "GRADUAL";

export type NewsImpact = {
  id: string;
  instrumentId: string;
  direction: ImpactDirection;
  mode: ImpactMode;
  fixedPct: number | null;
  minPct: number | null;
  maxPct: number | null;
  timing: ImpactTiming;
};

export type NewsItem = {
  id: string;
  number: number;
  headline: string;
  body: string;
  roundId: string | null;
  priority: NewsPriority;
  status: NewsStatus;
  impacts: NewsImpact[];
  createdAt: number;
  updatedAt: number;
  releaseId: string | null;
};

export type ResolvedImpact = {
  instrumentId: string;
  configured: ConfiguredImpact;
  resolvedPct: number;
  appliedPct: number;
  previousPrice: Paise;
  newPrice: Paise;
  clamped: boolean;
  clampReasons: ClampReason[];
  priceEventId: string;
};

export type NewsReleaseSource = "MANUAL" | "RANDOM";

export type RandomNewsStatus = "STOPPED" | "RUNNING" | "PAUSED";

export type RandomNewsLogEntry = {
  id: string;
  newsItemId: string;
  roundId: string | null;
  scheduledFor: number;
  at: number;
  outcome: "RELEASED" | "RELEASED_EARLY" | "SKIPPED";
  releaseId: string | null;
};

/** Host-controlled random news scheduler (Phase 1: runs in the leader tab; later: simulation worker). */
export type RandomNewsState = {
  mode: "MANUAL" | "RANDOM";
  status: RandomNewsStatus;
  /** CURRENT = stories assigned to whichever round is running; otherwise only while that round runs. */
  roundScope: "CURRENT" | string;
  includeUnassigned: boolean;
  excludedNewsIds: string[];
  minGapSeconds: number;
  maxGapSeconds: number;
  maxPerRound: number;
  nextReleaseAt: number | null;
  scheduledNewsId: string | null;
  scheduledRoundId: string | null;
  heldRemainingMs: number | null;
  log: RandomNewsLogEntry[];
};

export type NewsRelease = {
  id: string;
  newsItemId: string;
  roundId: string | null;
  releasedAt: number;
  releasedBy: Actor;
  /** MANUAL = released by the host; RANDOM = released by the random news scheduler. */
  source: NewsReleaseSource;
  /** For random releases: the time the scheduler planned (actual time is releasedAt). */
  scheduledFor: number | null;
  headline: string;
  body: string;
  impacts: ResolvedImpact[];
};

export type AdjustmentType = "CAPITAL_CHANGE" | "AWARD" | "PENALTY" | "CORRECTION";

export type HostAdjustment = {
  id: string;
  teamId: string;
  kind: "CASH" | "HOLDING";
  adjustmentType: AdjustmentType;
  instrumentId: string | null;
  amount: number;
  before: number;
  after: number;
  valueAtAdjustment: Paise;
  reason: string;
  at: number;
  actor: Actor;
  journalId: string;
  roundId: string | null;
};

export type AllocationMode = "CASH_ONLY" | "CASH_AND_STOCKS";
export type AllocationDistribution = "IDENTICAL" | "PER_TEAM";
export type AllocationRow = { cash: Paise; shares: Record<string, number> };

export type AllocationPlan = {
  mode: AllocationMode;
  distribution: AllocationDistribution;
  identical: AllocationRow;
  perTeam: Record<string, AllocationRow>;
  appliedAt: number | null;
  /** What each team actually received; used by team reset. */
  applied: Record<string, AllocationRow>;
};

export type AuditType =
  | "EVENT_CREATED"
  | "EVENT_STARTED"
  | "EVENT_PAUSED"
  | "EVENT_RESUMED"
  | "EVENT_ENDED"
  | "SETTINGS_UPDATED"
  | "ROUND_STARTED"
  | "ROUND_PAUSED"
  | "ROUND_RESUMED"
  | "ROUND_ENDED"
  | "ROUNDS_UPDATED"
  | "TRADING_FROZEN"
  | "TRADING_UNFROZEN"
  | "TEAM_CREATED"
  | "TEAM_UPDATED"
  | "TEAM_DISABLED"
  | "TEAM_ENABLED"
  | "TEAM_PIN_REGENERATED"
  | "TEAM_RESET"
  | "ALLOCATION_APPLIED"
  | "INSTRUMENT_CREATED"
  | "INSTRUMENT_UPDATED"
  | "INSTRUMENT_HALTED"
  | "INSTRUMENT_RESUMED"
  | "TRADE_PROPOSED"
  | "TRADE_ACCEPTED"
  | "TRADE_REJECTED"
  | "TRADE_CANCELLED"
  | "TRADE_EXPIRED"
  | "TRADE_APPROVAL_REQUESTED"
  | "TRADE_APPROVED"
  | "TRADE_REJECTED_BY_HOST"
  | "TRADE_SETTLED"
  | "TRADE_FAILED"
  | "NEWS_CREATED"
  | "NEWS_UPDATED"
  | "NEWS_SKIPPED"
  | "NEWS_RELEASED"
  | "PRICE_CHANGED"
  | "CASH_ADJUSTED"
  | "HOLDING_ADJUSTED"
  | "LEADERBOARD_VISIBILITY_CHANGED"
  | "LEADERBOARD_FROZEN"
  | "LEADERBOARD_UNFROZEN"
  | "PROJECTOR_UPDATED"
  | "NEWS_RANDOM_MODE_CHANGED"
  | "NEWS_RANDOM_STARTED"
  | "NEWS_RANDOM_PAUSED"
  | "NEWS_RANDOM_RESUMED"
  | "NEWS_RANDOM_STOPPED"
  | "NEWS_RANDOM_SCHEDULED"
  | "NEWS_RANDOM_SKIPPED"
  | "NEWS_RANDOM_SETTINGS_UPDATED";

export type AuditEvent = {
  id: string;
  at: number;
  type: AuditType;
  actor: Actor;
  teamId: string | null;
  roundId: string | null;
  summary: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  refs: Record<string, string>;
};

export type ValuationSnapshot = {
  t: number;
  netWorth: Record<string, Paise>;
};

export type StandingMark = {
  at: number;
  netWorth: Record<string, Paise>;
  capitalBase: Record<string, Paise>;
  ranks: Record<string, number>;
};

export type LeaderboardRow = {
  teamId: string;
  teamName: string;
  rank: number;
  movement: number;
  netWorth: Paise;
  capitalBase: Paise;
  returnPct: number;
  roundPnl: Paise;
};

export type ProcessedCommand = { at: number; command: string; result: unknown };

/** The whole mock aggregate for one event. Phase 2 maps each collection to database tables. */
export type EventState = {
  event: SimEvent;
  rounds: Round[];
  teams: Team[];
  instruments: Instrument[];
  prices: Record<string, PriceSnapshot>;
  priceEvents: PriceEvent[];
  allocationPlan: AllocationPlan;
  balances: Balances;
  costBasis: Record<string, Record<string, Paise>>;
  realizedPnl: Record<string, Paise>;
  capitalBase: Record<string, Paise>;
  journals: LedgerJournal[];
  proposals: TradeProposal[];
  trades: Trade[];
  news: NewsItem[];
  newsReleases: NewsRelease[];
  adjustments: HostAdjustment[];
  audit: AuditEvent[];
  valuations: ValuationSnapshot[];
  eventStartMark: StandingMark | null;
  roundMarks: Record<string, StandingMark>;
  processedCommands: Record<string, ProcessedCommand>;
  counters: Record<string, number>;
  randomNews: RandomNewsState;
};

export type OpContext = {
  now: number;
  actor: Actor;
  random: () => number;
};

export type OpResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; persist?: boolean };

export function ok<T>(value: T): OpResult<T>;
export function ok(): OpResult<undefined>;
export function ok<T>(value?: T): OpResult<T | undefined> {
  return { ok: true, value };
}

export function fail(code: string, message: string, persist = false): { ok: false; code: string; message: string; persist: boolean } {
  return { ok: false, code, message, persist };
}
