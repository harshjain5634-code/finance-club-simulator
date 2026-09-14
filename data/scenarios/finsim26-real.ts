import type { EventConfig } from "@/lib/domain/event-config";
import { rupees } from "@/lib/domain/money";
import { catalogueInstrument, REAL_CATALOGUE } from "./catalogue";
import {
  DEFAULT_LEADERBOARD,
  DEFAULT_PROJECTOR,
  DEFAULT_RULES,
  DEMO_DATE,
  DEMO_EVENT_CODE,
  DEMO_EVENT_NAME,
  DEMO_TEAMS,
  demoRounds,
  type ScenarioTiming,
} from "./shared";

const SYMBOLS = ["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "ITC", "LT"];

/** ₹5,01,900 cash + ₹4,98,100 of stock = ₹10,00,000 capital base per team. */
const SHARES: Record<string, number> = {
  RELIANCE: 60,
  TCS: 20,
  HDFCBANK: 80,
  ICICIBANK: 40,
  INFY: 40,
  SBIN: 70,
  ITC: 150,
  LT: 10,
};

/** Hypothetical headlines for a simulated scenario; they do not describe real events. */
const REAL_NEWS: EventConfig["news"] = [
  {
    headline: "Simulated: IT majors report stronger deal wins",
    body: "In this scenario, large IT services firms report a record quarter for new contract signings.",
    roundIndex: 1,
    priority: "NORMAL",
    status: "READY",
    impacts: [
      { symbol: "TCS", direction: "UP", mode: "RANGE", fixedPct: null, minPct: 2, maxPct: 4, timing: "IMMEDIATE" },
      { symbol: "INFY", direction: "UP", mode: "RANGE", fixedPct: null, minPct: 2, maxPct: 5, timing: "IMMEDIATE" },
    ],
  },
  {
    headline: "Simulated: Reliance announces a new energy investment",
    body: "In this scenario, Reliance commits fresh capital to its new energy business.",
    roundIndex: 1,
    priority: "HIGH",
    status: "READY",
    impacts: [{ symbol: "RELIANCE", direction: "UP", mode: "RANGE", fixedPct: null, minPct: 5, maxPct: 10, timing: "IMMEDIATE" }],
  },
  {
    headline: "Simulated: Infrastructure spending boost in the budget",
    body: "In this scenario, the government raises capital expenditure on roads, rail and ports.",
    roundIndex: 2,
    priority: "NORMAL",
    status: "READY",
    impacts: [{ symbol: "LT", direction: "UP", mode: "FIXED", fixedPct: 6, minPct: null, maxPct: null, timing: "IMMEDIATE" }],
  },
  {
    headline: "Simulated: Rural consumption slows",
    body: "In this scenario, a weak monsoon weighs on rural demand for consumer staples.",
    roundIndex: 2,
    priority: "NORMAL",
    status: "READY",
    impacts: [{ symbol: "ITC", direction: "DOWN", mode: "RANGE", fixedPct: null, minPct: 2, maxPct: 4, timing: "IMMEDIATE" }],
  },
  {
    headline: "Simulated: Tighter lending norms for banks",
    body: "In this scenario, the regulator raises risk weights on unsecured lending across banks.",
    roundIndex: 3,
    priority: "HIGH",
    status: "READY",
    impacts: [
      { symbol: "HDFCBANK", direction: "DOWN", mode: "FIXED", fixedPct: 5, minPct: null, maxPct: null, timing: "IMMEDIATE" },
      { symbol: "ICICIBANK", direction: "DOWN", mode: "FIXED", fixedPct: 4, minPct: null, maxPct: null, timing: "IMMEDIATE" },
      { symbol: "SBIN", direction: "DOWN", mode: "FIXED", fixedPct: 7, minPct: null, maxPct: null, timing: "IMMEDIATE" },
    ],
  },
  {
    headline: "Simulated: Sharp sell-off in banking stocks",
    body: "In this scenario, a wave of selling hits large lenders after asset-quality concerns.",
    roundIndex: 3,
    priority: "HIGH",
    status: "READY",
    impacts: [{ symbol: "SBIN", direction: "DOWN", mode: "FIXED", fixedPct: 12, minPct: null, maxPct: null, timing: "IMMEDIATE" }],
  },
];

export function finsim26RealConfig(timing: ScenarioTiming = "STANDARD"): EventConfig {
  return {
    schemaVersion: 1,
    name: DEMO_EVENT_NAME,
    code: DEMO_EVENT_CODE,
    scheduledDate: DEMO_DATE,
    tradingMode: "P2P",
    universeMode: "REAL_SIMULATED",
    newsMode: "MANUAL",
    capitalRule: "SAME",
    defaultStartingCash: rupees(501900),
    themePolicy: "FORCE_DARK",
    rules: DEFAULT_RULES,
    teams: DEMO_TEAMS,
    instruments: SYMBOLS.map((symbol) => catalogueInstrument(REAL_CATALOGUE.find((c) => c.symbol === symbol)!)),
    rounds: demoRounds(timing),
    news: REAL_NEWS,
    allocation: { mode: "CASH_AND_STOCKS", distribution: "IDENTICAL", identical: { cash: rupees(501900), shares: SHARES } },
    leaderboard: DEFAULT_LEADERBOARD,
    projector: DEFAULT_PROJECTOR,
  };
}
