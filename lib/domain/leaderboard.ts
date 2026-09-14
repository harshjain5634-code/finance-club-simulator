import { netWorth, returnPct } from "./portfolio";
import { currentRound } from "./trading-gate";
import type {
  EventState,
  LeaderboardRow,
  Paise,
  ParticipantLeaderboardVisibility,
  ProjectorLeaderboardVisibility,
  StandingMark,
} from "./types";

export type RankInput = {
  teamId: string;
  teamName: string;
  netWorth: Paise;
  capitalBase: Paise;
};

/** Ranking: highest return %, then higher net worth, then team name (A→Z). Ranks are unique. */
export function compareStandings(a: RankInput, b: RankInput): number {
  const returnDiff = returnPct(b.netWorth, b.capitalBase) - returnPct(a.netWorth, a.capitalBase);
  if (Math.abs(returnDiff) > 1e-9) return returnDiff;
  if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;
  return a.teamName.localeCompare(b.teamName);
}

export function rankTeams(inputs: RankInput[]): (RankInput & { rank: number; returnPct: number })[] {
  return [...inputs]
    .sort(compareStandings)
    .map((row, index) => ({ ...row, rank: index + 1, returnPct: returnPct(row.netWorth, row.capitalBase) }));
}

function standingInputs(state: EventState): RankInput[] {
  return state.teams
    .filter((team) => team.status === "ACTIVE" || netWorth(state, team.id) > 0)
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      netWorth: netWorth(state, team.id),
      capitalBase: state.capitalBase[team.id] ?? 0,
    }));
}

export function createStandingMark(state: EventState, at: number): StandingMark {
  const ranked = rankTeams(standingInputs(state));
  return {
    at,
    netWorth: Object.fromEntries(ranked.map((r) => [r.teamId, r.netWorth])),
    capitalBase: Object.fromEntries(ranked.map((r) => [r.teamId, r.capitalBase])),
    ranks: Object.fromEntries(ranked.map((r) => [r.teamId, r.rank])),
  };
}

/** The mark that movement and round P&L are measured from: current round start, else event start. */
export function activeMark(state: EventState): StandingMark | null {
  const round = currentRound(state);
  if (round && state.roundMarks[round.id]) return state.roundMarks[round.id];
  return state.eventStartMark;
}

export function computeLeaderboard(state: EventState): LeaderboardRow[] {
  const mark = activeMark(state);
  return rankTeams(standingInputs(state)).map((row) => {
    const profit = row.netWorth - row.capitalBase;
    const markProfit = mark ? (mark.netWorth[row.teamId] ?? row.netWorth) - (mark.capitalBase[row.teamId] ?? row.capitalBase) : profit;
    const previousRank = mark?.ranks[row.teamId];
    return {
      teamId: row.teamId,
      teamName: row.teamName,
      rank: row.rank,
      movement: previousRank ? previousRank - row.rank : 0,
      netWorth: row.netWorth,
      capitalBase: row.capitalBase,
      returnPct: row.returnPct,
      roundPnl: mark ? profit - markProfit : 0,
    };
  });
}

/** What participants and the projector see: the frozen snapshot while frozen, otherwise live. */
export function publishedLeaderboard(state: EventState): { rows: LeaderboardRow[]; frozenAt: number | null } {
  const settings = state.event.leaderboard;
  if (settings.frozen && settings.frozenRows) return { rows: settings.frozenRows, frozenAt: settings.frozenAt };
  return { rows: computeLeaderboard(state), frozenAt: null };
}

export function effectiveParticipantVisibility(state: EventState): ParticipantLeaderboardVisibility {
  return currentRound(state)?.leaderboardVisibilityOverride ?? state.event.leaderboard.participantVisibility;
}

export type ParticipantLeaderboardView =
  | { mode: "HIDDEN"; ownRow: null; rows: []; topN: number }
  | { mode: "OWN_RANK"; ownRow: LeaderboardRow | null; rows: []; topN: number }
  | { mode: "FULL" | "TOP_N"; ownRow: LeaderboardRow | null; rows: LeaderboardRow[]; ownPinned: boolean; topN: number };

export function participantLeaderboardView(
  rows: LeaderboardRow[],
  visibility: ParticipantLeaderboardVisibility,
  topN: number,
  ownTeamId: string,
): ParticipantLeaderboardView {
  const ownRow = rows.find((r) => r.teamId === ownTeamId) ?? null;
  if (visibility === "HIDDEN") return { mode: "HIDDEN", ownRow: null, rows: [], topN };
  if (visibility === "OWN_RANK") return { mode: "OWN_RANK", ownRow, rows: [], topN };
  if (visibility === "FULL") return { mode: "FULL", ownRow, rows, ownPinned: false, topN };
  const top = rows.slice(0, topN);
  const ownPinned = !!ownRow && ownRow.rank > topN;
  return { mode: "TOP_N", ownRow, rows: top, ownPinned, topN };
}

export function projectorLeaderboardRows(
  rows: LeaderboardRow[],
  visibility: ProjectorLeaderboardVisibility,
  topN: number,
): LeaderboardRow[] | null {
  if (visibility === "HIDDEN") return null;
  return visibility === "TOP_N" ? rows.slice(0, topN) : rows;
}
