import type { EventConfig, TeamConfig } from "@/lib/domain/event-config";
import { rupees } from "@/lib/domain/money";

export const DEMO_EVENT_ID = "demo-event";
export const DEMO_EVENT_CODE = "FINSIM26";
export const DEMO_EVENT_NAME = "Finance Club Mock Stock 2026";
export const DEMO_DATE = "2026-09-18";

/** Demo credentials are fixed so the launcher and checklist can reference them. */
export const DEMO_TEAMS: TeamConfig[] = [
  { name: "Alpha Capital", loginCode: "ALPHA", pin: "4821", startingCash: 0 },
  { name: "Beta Street", loginCode: "BETA", pin: "7390", startingCash: 0 },
  { name: "Bull Brigade", loginCode: "BULL", pin: "2046", startingCash: 0 },
  { name: "Candle Kings", loginCode: "CANDLE", pin: "5173", startingCash: 0 },
  { name: "Delta Capital", loginCode: "DELTA", pin: "6612", startingCash: 0 },
  { name: "Equity Edge", loginCode: "EQUITY", pin: "3398", startingCash: 0 },
  { name: "Falcon Funds", loginCode: "FALCON", pin: "9027", startingCash: 0 },
  { name: "Gamma Trading", loginCode: "GAMMA", pin: "1854", startingCash: 0 },
  { name: "Market Mavericks", loginCode: "MAVERICK", pin: "4470", startingCash: 0 },
  { name: "Quant Club", loginCode: "QUANT", pin: "8261", startingCash: 0 },
  { name: "Sigma Securities", loginCode: "SIGMA", pin: "3935", startingCash: 0 },
  { name: "Value Hunters", loginCode: "VALUE", pin: "7708", startingCash: 0 },
];

export type ScenarioTiming = "STANDARD" | "QUICK";

/** Standard: 3/15/15/15 minutes. Quick: 1/4/4/4 minutes for rehearsing the flow. */
export function demoRounds(timing: ScenarioTiming): EventConfig["rounds"] {
  const minutes = timing === "QUICK" ? [1, 4, 4, 4] : [3, 15, 15, 15];
  return [
    { name: "Market Briefing", type: "BRIEFING", durationSeconds: minutes[0] * 60, tradableSymbols: "ALL", leaderboardVisibilityOverride: null },
    { name: "Opening Market", type: "TRADING", durationSeconds: minutes[1] * 60, tradableSymbols: "ALL", leaderboardVisibilityOverride: null },
    { name: "Expansion", type: "TRADING", durationSeconds: minutes[2] * 60, tradableSymbols: "ALL", leaderboardVisibilityOverride: null },
    { name: "Market Crisis", type: "TRADING", durationSeconds: minutes[3] * 60, tradableSymbols: "ALL", leaderboardVisibilityOverride: null },
  ];
}

export const DEFAULT_RULES: EventConfig["rules"] = {
  priceBandPct: 10,
  approvalEnabled: false,
  approvalThreshold: rupees(200000),
  proposalExpirySeconds: 180,
  maxOpenOutgoingProposals: 5,
  tickSize: 5,
};

export const DEFAULT_LEADERBOARD: EventConfig["leaderboard"] = {
  participantVisibility: "FULL",
  participantTopN: 10,
  projectorVisibility: "TOP_N",
  projectorTopN: 10,
};

export const DEFAULT_PROJECTOR: EventConfig["projector"] = {
  breakingNewsSeconds: 12,
  tickerEnabled: true,
  theme: "DARK",
};
