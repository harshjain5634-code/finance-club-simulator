import type { EventConfig, InstrumentConfig } from "@/lib/domain/event-config";
import { rupees } from "@/lib/domain/money";
import { generateHistory, seedFrom } from "../mock-history";
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

type Company = Pick<InstrumentConfig, "symbol" | "name" | "sector" | "description"> & {
  price: number;
  supply: number;
  drift: number;
  volatility: number;
};

const COMPANIES: Company[] = [
  {
    symbol: "NOVA",
    name: "Nova Motors",
    sector: "EV / Automotive",
    description:
      "Electric two- and four-wheeler maker with a growing fleet business and an in-house battery pack plant in Pune.",
    price: 500,
    supply: 5000,
    drift: 6,
    volatility: 1.8,
  },
  {
    symbol: "ORBIT",
    name: "Orbit Technologies",
    sector: "Technology",
    description: "IT services and cloud migration firm serving banks and retailers across India, the UK and the Middle East.",
    price: 1240,
    supply: 2000,
    drift: 3,
    volatility: 1.2,
  },
  {
    symbol: "HELIX",
    name: "Helix Pharma",
    sector: "Healthcare",
    description: "Speciality pharmaceutical company focused on diabetes and cardiac therapies with two drugs in late-stage trials.",
    price: 860,
    supply: 2500,
    drift: -2,
    volatility: 1.6,
  },
  {
    symbol: "VERTEX",
    name: "Vertex Bank",
    sector: "Banking",
    description: "Mid-sized private bank with a strong retail deposit franchise and a fast-growing unsecured lending book.",
    price: 640,
    supply: 4000,
    drift: 2,
    volatility: 1.1,
  },
  {
    symbol: "NEXUS",
    name: "Nexus Energy",
    sector: "Energy",
    description: "Integrated power producer transitioning from thermal generation to large utility-scale solar parks.",
    price: 320,
    supply: 6000,
    drift: 5,
    volatility: 1.5,
  },
  {
    symbol: "PULSE",
    name: "Pulse Consumer",
    sector: "FMCG",
    description: "Packaged foods and personal-care brands with deep rural distribution and a premium beverages line.",
    price: 1850,
    supply: 1200,
    drift: 1,
    volatility: 0.8,
  },
  {
    symbol: "APEX",
    name: "Apex Infrastructure",
    sector: "Infrastructure",
    description: "Highway, metro and port construction contractor with an order book of roughly three years of revenue.",
    price: 410,
    supply: 5000,
    drift: 4,
    volatility: 1.7,
  },
  {
    symbol: "QUANTUM",
    name: "Quantum Systems",
    sector: "Technology",
    description: "Enterprise software and semiconductor design house with a concentrated set of large cloud clients.",
    price: 2150,
    supply: 1200,
    drift: 8,
    volatility: 2.1,
  },
];

/** Identical starting portfolio per team: ₹5,05,200 cash + ₹4,94,800 of stock = ₹10,00,000 capital base. */
const SHARES: Record<string, number> = {
  NOVA: 200,
  ORBIT: 50,
  HELIX: 60,
  VERTEX: 100,
  NEXUS: 150,
  PULSE: 30,
  APEX: 120,
  QUANTUM: 30,
};

export function customInstruments(date = DEMO_DATE): InstrumentConfig[] {
  return COMPANIES.map((company) => ({
    symbol: company.symbol,
    name: company.name,
    sector: company.sector,
    description: company.description,
    mode: "CUSTOM",
    exchange: null,
    startingPrice: rupees(company.price),
    supply: company.supply,
    floor: rupees(company.price * 0.5),
    ceiling: rupees(company.price * 2),
    circuitPct: 10,
    enabled: true,
    history: generateHistory({
      endPrice: rupees(company.price),
      endDate: date,
      driftPct: company.drift,
      volatilityPct: company.volatility,
      seed: seedFrom(company.symbol),
    }),
  }));
}

export const CUSTOM_NEWS: EventConfig["news"] = [
  {
    headline: "Orbit Technologies beats quarterly revenue estimates",
    body: "Orbit reported 14% year-on-year revenue growth, ahead of analyst estimates, led by two large banking cloud migrations.",
    roundIndex: 1,
    priority: "NORMAL",
    status: "READY",
    impacts: [{ symbol: "ORBIT", direction: "UP", mode: "FIXED", fixedPct: 4, minPct: null, maxPct: null, timing: "IMMEDIATE" }],
  },
  {
    headline: "Pulse Consumer flags a slowdown in rural demand",
    body: "Management warned that erratic monsoon rainfall is weighing on rural volumes for the next two quarters.",
    roundIndex: 1,
    priority: "NORMAL",
    status: "READY",
    impacts: [{ symbol: "PULSE", direction: "DOWN", mode: "RANGE", fixedPct: null, minPct: 2, maxPct: 4, timing: "IMMEDIATE" }],
  },
  {
    headline: "Nova Motors secures major government EV fleet contract",
    body: "Nova Motors will supply 12,000 electric vehicles to state transport fleets over three years, its largest order to date.",
    roundIndex: 1,
    priority: "HIGH",
    status: "READY",
    impacts: [{ symbol: "NOVA", direction: "UP", mode: "RANGE", fixedPct: null, minPct: 5, maxPct: 10, timing: "IMMEDIATE" }],
  },
  {
    headline: "Helix Pharma receives approval for new diabetes therapy",
    body: "The regulator approved Helix's once-weekly diabetes injection, opening a market the company estimates at ₹6,000 crore.",
    roundIndex: 2,
    priority: "HIGH",
    status: "READY",
    impacts: [{ symbol: "HELIX", direction: "UP", mode: "RANGE", fixedPct: null, minPct: 6, maxPct: 12, timing: "IMMEDIATE" }],
  },
  {
    headline: "Nexus Energy commissions 2 GW solar park ahead of schedule",
    body: "The Rajasthan solar park began commercial operation four months early, lifting Nexus's renewable capacity by a third.",
    roundIndex: 2,
    priority: "NORMAL",
    status: "READY",
    impacts: [{ symbol: "NEXUS", direction: "UP", mode: "FIXED", fixedPct: 5, minPct: null, maxPct: null, timing: "IMMEDIATE" }],
  },
  {
    headline: "Apex Infrastructure wins ₹4,200 crore highway order",
    body: "Apex is the lowest bidder for an eight-lane expressway package, adding about 14 months of revenue to its order book.",
    roundIndex: 2,
    priority: "NORMAL",
    status: "READY",
    impacts: [{ symbol: "APEX", direction: "UP", mode: "RANGE", fixedPct: null, minPct: 4, maxPct: 8, timing: "IMMEDIATE" }],
  },
  {
    headline: "Quantum Systems loses a key cloud client",
    body: "One of Quantum's three largest customers is moving its workloads in-house, affecting roughly 9% of annual revenue.",
    roundIndex: 2,
    priority: "HIGH",
    status: "READY",
    impacts: [{ symbol: "QUANTUM", direction: "DOWN", mode: "RANGE", fixedPct: null, minPct: 6, maxPct: 9, timing: "IMMEDIATE" }],
  },
  {
    headline: "Central bank tightens lending norms for private banks",
    body: "Higher risk weights on unsecured and vehicle loans take effect immediately, raising capital requirements across lenders.",
    roundIndex: 3,
    priority: "HIGH",
    status: "READY",
    impacts: [
      { symbol: "VERTEX", direction: "DOWN", mode: "FIXED", fixedPct: 5, minPct: null, maxPct: null, timing: "IMMEDIATE" },
      { symbol: "NOVA", direction: "DOWN", mode: "FIXED", fixedPct: 2, minPct: null, maxPct: null, timing: "IMMEDIATE" },
      { symbol: "APEX", direction: "DOWN", mode: "FIXED", fixedPct: 3, minPct: null, maxPct: null, timing: "IMMEDIATE" },
    ],
  },
  {
    headline: "Global chip shortage hits technology and auto makers",
    body: "Supply of advanced chips is expected to stay constrained for two quarters, delaying deliveries and client projects.",
    roundIndex: 3,
    priority: "HIGH",
    status: "READY",
    impacts: [
      { symbol: "ORBIT", direction: "DOWN", mode: "RANGE", fixedPct: null, minPct: 4, maxPct: 7, timing: "IMMEDIATE" },
      { symbol: "QUANTUM", direction: "DOWN", mode: "RANGE", fixedPct: null, minPct: 5, maxPct: 8, timing: "IMMEDIATE" },
      { symbol: "NOVA", direction: "DOWN", mode: "RANGE", fixedPct: null, minPct: 3, maxPct: 6, timing: "IMMEDIATE" },
    ],
  },
  {
    headline: "Vertex Bank reports a sharp rise in bad loans",
    body: "Gross non-performing assets jumped to 6.8% as unsecured loan defaults climbed; the bank is raising provisions.",
    roundIndex: 3,
    priority: "HIGH",
    status: "READY",
    impacts: [{ symbol: "VERTEX", direction: "DOWN", mode: "FIXED", fixedPct: 12, minPct: null, maxPct: null, timing: "IMMEDIATE" }],
  },
  {
    headline: "Pulse Consumer announces a special dividend",
    body: "The board recommended a one-time dividend of ₹40 per share from surplus cash.",
    roundIndex: 3,
    priority: "LOW",
    status: "DRAFT",
    impacts: [{ symbol: "PULSE", direction: "UP", mode: "FIXED", fixedPct: 3, minPct: null, maxPct: null, timing: "IMMEDIATE" }],
  },
];

export function finsim26CustomConfig(timing: ScenarioTiming = "STANDARD"): EventConfig {
  return {
    schemaVersion: 1,
    name: DEMO_EVENT_NAME,
    code: DEMO_EVENT_CODE,
    scheduledDate: DEMO_DATE,
    tradingMode: "P2P",
    universeMode: "CUSTOM",
    newsMode: "MANUAL",
    capitalRule: "SAME",
    defaultStartingCash: rupees(505200),
    themePolicy: "PARTICIPANT_CHOICE",
    rules: DEFAULT_RULES,
    teams: DEMO_TEAMS,
    instruments: customInstruments(),
    rounds: demoRounds(timing),
    news: CUSTOM_NEWS,
    allocation: { mode: "CASH_AND_STOCKS", distribution: "IDENTICAL", identical: { cash: rupees(505200), shares: SHARES } },
    leaderboard: DEFAULT_LEADERBOARD,
    projector: DEFAULT_PROJECTOR,
  };
}
