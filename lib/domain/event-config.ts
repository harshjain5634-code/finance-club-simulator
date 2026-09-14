import { z } from "zod";

/**
 * One schema shared by the creation wizard, templates and (later) server validation.
 * Money values are integer paise; percentages are plain numbers (10 = 10%).
 */
const paise = z.number().int().nonnegative();
const positivePaise = z.number().int().positive();
const symbol = z.string().regex(/^[A-Z][A-Z0-9&-]{0,11}$/, "Ticker must be 1–12 capital letters or digits");

export const RulesSchema = z.object({
  priceBandPct: z.number().positive().max(50),
  approvalEnabled: z.boolean(),
  approvalThreshold: positivePaise.nullable(),
  proposalExpirySeconds: z.number().int().min(30).max(3600),
  maxOpenOutgoingProposals: z.number().int().min(1).max(50),
  tickSize: positivePaise,
});

export const InstrumentConfigSchema = z.object({
  symbol,
  name: z.string().min(2).max(60),
  sector: z.string().min(2).max(40),
  description: z.string().max(600),
  mode: z.enum(["CUSTOM", "REAL_SIMULATED"]),
  exchange: z.string().nullable(),
  startingPrice: positivePaise,
  supply: z.number().int().positive(),
  floor: positivePaise.nullable(),
  ceiling: positivePaise.nullable(),
  circuitPct: z.number().positive().max(100).nullable(),
  enabled: z.boolean(),
  history: z.array(z.object({ t: z.number(), price: positivePaise })),
});

export const RoundConfigSchema = z.object({
  name: z.string().min(2).max(40),
  type: z.enum(["BRIEFING", "TRADING"]),
  durationSeconds: z.number().int().min(30).max(6 * 3600),
  tradableSymbols: z.union([z.literal("ALL"), z.array(symbol)]),
  leaderboardVisibilityOverride: z.enum(["FULL", "TOP_N", "OWN_RANK", "HIDDEN"]).nullable(),
});

export const NewsImpactConfigSchema = z
  .object({
    symbol,
    direction: z.enum(["UP", "DOWN"]),
    mode: z.enum(["FIXED", "RANGE"]),
    fixedPct: z.number().positive().max(100).nullable(),
    minPct: z.number().nonnegative().max(100).nullable(),
    maxPct: z.number().positive().max(100).nullable(),
    timing: z.enum(["IMMEDIATE", "GRADUAL"]),
  })
  .superRefine((impact, ctx) => {
    if (impact.mode === "FIXED" && impact.fixedPct === null) ctx.addIssue({ code: "custom", message: "Fixed impact needs a percentage" });
    if (impact.mode === "RANGE" && (impact.minPct === null || impact.maxPct === null || impact.minPct > impact.maxPct)) {
      ctx.addIssue({ code: "custom", message: "Range impact needs min ≤ max" });
    }
  });

export const NewsConfigSchema = z.object({
  headline: z.string().min(5).max(160),
  body: z.string().max(1200),
  roundIndex: z.number().int().nonnegative().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  status: z.enum(["DRAFT", "READY"]),
  impacts: z.array(NewsImpactConfigSchema),
});

export const TeamConfigSchema = z.object({
  name: z.string().min(2).max(40),
  loginCode: z.string().regex(/^[A-Z0-9]{3,12}$/),
  pin: z.string().regex(/^\d{4}$/),
  startingCash: paise,
});

const AllocationRowSchema = z.object({ cash: paise, shares: z.record(z.string(), z.number().int().nonnegative()) });

export const EventConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(3).max(80),
    code: z.string().regex(/^[A-Z0-9]{4,10}$/, "Event code must be 4–10 capital letters or digits"),
    scheduledDate: z.string(),
    tradingMode: z.enum(["P2P", "SIMULATED_EXCHANGE"]),
    universeMode: z.enum(["CUSTOM", "REAL_SIMULATED"]),
    newsMode: z.enum(["MANUAL", "AUTOMATIC"]),
    capitalRule: z.enum(["SAME", "CUSTOM"]),
    defaultStartingCash: paise,
    themePolicy: z.enum(["FORCE_DARK", "FORCE_LIGHT", "PARTICIPANT_CHOICE"]),
    rules: RulesSchema,
    teams: z.array(TeamConfigSchema),
    instruments: z.array(InstrumentConfigSchema),
    rounds: z.array(RoundConfigSchema).min(1),
    news: z.array(NewsConfigSchema),
    allocation: z.object({
      mode: z.enum(["CASH_ONLY", "CASH_AND_STOCKS"]),
      distribution: z.enum(["IDENTICAL", "PER_TEAM"]),
      /** Shares keyed by ticker symbol. */
      identical: AllocationRowSchema,
    }),
    leaderboard: z.object({
      participantVisibility: z.enum(["FULL", "TOP_N", "OWN_RANK", "HIDDEN"]),
      participantTopN: z.number().int().min(1).max(100),
      projectorVisibility: z.enum(["FULL", "TOP_N", "HIDDEN"]),
      projectorTopN: z.number().int().min(1).max(30),
    }),
    projector: z.object({
      breakingNewsSeconds: z.number().int().min(5).max(60),
      tickerEnabled: z.boolean(),
      theme: z.enum(["DARK", "LIGHT"]),
    }),
  })
  .superRefine((config, ctx) => {
    const symbols = new Set<string>();
    for (const instrument of config.instruments) {
      if (symbols.has(instrument.symbol)) ctx.addIssue({ code: "custom", message: `Duplicate ticker ${instrument.symbol}` });
      symbols.add(instrument.symbol);
      if (instrument.mode !== config.universeMode) {
        ctx.addIssue({ code: "custom", message: `${instrument.symbol} does not match the ${config.universeMode} universe` });
      }
    }
    const codes = new Set<string>();
    for (const team of config.teams) {
      if (codes.has(team.loginCode)) ctx.addIssue({ code: "custom", message: `Duplicate team login code ${team.loginCode}` });
      codes.add(team.loginCode);
    }
    for (const item of config.news) {
      for (const impact of item.impacts) {
        if (!symbols.has(impact.symbol)) ctx.addIssue({ code: "custom", message: `News "${item.headline}" references unknown ${impact.symbol}` });
      }
      if (item.roundIndex !== null && item.roundIndex >= config.rounds.length) {
        ctx.addIssue({ code: "custom", message: `News "${item.headline}" references a missing round` });
      }
    }
    for (const key of Object.keys(config.allocation.identical.shares)) {
      if (!symbols.has(key)) ctx.addIssue({ code: "custom", message: `Allocation references unknown ${key}` });
    }
  });

export type EventConfig = z.infer<typeof EventConfigSchema>;
export type InstrumentConfig = z.infer<typeof InstrumentConfigSchema>;
export type RoundConfig = z.infer<typeof RoundConfigSchema>;
export type NewsConfig = z.infer<typeof NewsConfigSchema>;
export type TeamConfig = z.infer<typeof TeamConfigSchema>;

export type EventTemplate = {
  id: string;
  name: string;
  description: string;
  highlights: string[];
  config: EventConfig;
};

export function parseEventConfig(input: unknown) {
  return EventConfigSchema.safeParse(input);
}
