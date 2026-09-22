import type { EventConfig, EventTemplate } from "@/lib/domain/event-config";
import { rupees } from "@/lib/domain/money";
import { finsim26CustomConfig } from "./scenarios/finsim26-custom";
import { finsim26RealConfig } from "./scenarios/finsim26-real";
import { DEFAULT_LEADERBOARD, DEFAULT_PROJECTOR, DEFAULT_RULES } from "./scenarios/shared";

const withoutTeams = (config: EventConfig): EventConfig => ({ ...config, teams: [] });

export const BLANK_TEMPLATE_ID = "blank";

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "classic-mock-stock",
    name: "Classic Mock Stock",
    description: "Eight fictional companies, a briefing plus three trading rounds and a prepared news desk.",
    highlights: ["8 fictional stocks", "4 rounds", "11 news items", "Cash + stock allocation"],
    config: withoutTeams(finsim26CustomConfig()),
  },
  {
    id: "real-companies",
    name: "Real Companies Simulation",
    description: "Recognisable NSE companies with simulation-controlled prices and hypothetical news.",
    highlights: ["8 real companies", "Simulated prices", "6 news items", "Pre-event charts"],
    config: withoutTeams(finsim26RealConfig()),
  },
];

export function blankConfig(): EventConfig {
  return {
    schemaVersion: 1,
    name: "New simulation event",
    code: "NEWEVENT",
    scheduledDate: new Date().toISOString().slice(0, 10),
    tradingMode: "P2P",
    universeMode: "CUSTOM",
    newsMode: "MANUAL",
    capitalRule: "SAME",
    defaultStartingCash: rupees(1000000),
    themePolicy: "PARTICIPANT_CHOICE",
    rules: DEFAULT_RULES,
    teams: [],
    instruments: [],
    rounds: [
      { name: "Opening Market", type: "TRADING", durationSeconds: 15 * 60, tradableSymbols: "ALL", leaderboardVisibilityOverride: null },
    ],
    news: [],
    allocation: { mode: "CASH_ONLY", distribution: "IDENTICAL", identical: { cash: rupees(1000000), shares: {} } },
    leaderboard: DEFAULT_LEADERBOARD,
    projector: DEFAULT_PROJECTOR,
  };
}
