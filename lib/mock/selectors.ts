import { actorLabel } from "@/lib/domain/audit";
import { isTeamAccount, teamAccount } from "@/lib/domain/ledger";
import { computeLeaderboard, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { changePct } from "@/lib/domain/money";
import { holdingsValue, netWorth, returnPct, teamCash, teamHoldings, type HoldingView } from "@/lib/domain/portfolio";
import { currentRound } from "@/lib/domain/trading-gate";
import type {
  AuditEvent,
  EventState,
  Instrument,
  LedgerJournal,
  NewsRelease,
  Paise,
  PriceSnapshot,
  Team,
  TradeProposal,
} from "@/lib/domain/types";

/** View-model selectors: pure derivations used by the UI. */

export const teamNameOf = (state: EventState) => (teamId: string) => state.teams.find((t) => t.id === teamId)?.name ?? teamId;
export const instrumentOf = (state: EventState, instrumentId: string) => state.instruments.find((i) => i.id === instrumentId);
export const symbolOf = (state: EventState) => (instrumentId: string) => instrumentOf(state, instrumentId)?.symbol ?? instrumentId;

export type InstrumentRow = {
  instrument: Instrument;
  snapshot: PriceSnapshot;
  price: Paise;
  roundChangePct: number;
  eventChangePct: number;
  sparkline: number[];
};

export function instrumentRows(state: EventState, { enabledOnly = false } = {}): InstrumentRow[] {
  return state.instruments
    .filter((i) => !enabledOnly || i.enabled)
    .map((instrument) => {
      const snapshot = state.prices[instrument.id];
      const eventPath = state.priceEvents.filter((e) => e.instrumentId === instrument.id).map((e) => e.newPrice);
      const history = instrument.history.slice(-30).map((p) => p.price);
      return {
        instrument,
        snapshot,
        price: snapshot.price,
        roundChangePct: changePct(snapshot.roundOpenPrice, snapshot.price),
        eventChangePct: changePct(state.event.startedAt ? snapshot.eventOpenPrice : instrument.startingPrice, snapshot.price),
        sparkline: [...history, ...(eventPath.length ? [snapshot.eventOpenPrice, ...eventPath] : [])],
      };
    });
}

export type ChartRange = "15M" | "ROUND" | "EVENT" | "PRE_EVENT";
export type ChartPoint = { t: number; value: number };

function stepSeries(points: ChartPoint[], start: number, end: number, initial: number): ChartPoint[] {
  const inWindow = points.filter((p) => p.t > start && p.t <= end);
  const before = points.filter((p) => p.t <= start);
  const opening = before.length ? before[before.length - 1].value : initial;
  const series = [{ t: start, value: opening }, ...inWindow];
  const last = series[series.length - 1];
  if (last.t < end) series.push({ t: end, value: last.value });
  return series;
}

export function rangeWindow(state: EventState, range: ChartRange, now: number): { start: number; end: number } {
  const eventStart = state.event.startedAt ?? now - 15 * 60_000;
  const end = state.event.endedAt ?? now;
  if (range === "15M") return { start: Math.max(end - 15 * 60_000, Math.min(eventStart, end - 60_000)), end };
  if (range === "ROUND") {
    const round = currentRound(state);
    return { start: round?.startedAt ?? eventStart, end: round?.endedAt ?? end };
  }
  return { start: eventStart, end };
}

export function priceSeries(state: EventState, instrumentId: string, range: ChartRange, now: number): ChartPoint[] {
  const instrument = instrumentOf(state, instrumentId);
  if (!instrument) return [];
  if (range === "PRE_EVENT") return instrument.history.map((p) => ({ t: p.t, value: p.price }));
  const events = state.priceEvents.filter((e) => e.instrumentId === instrumentId).map((e) => ({ t: e.at, value: e.newPrice }));
  const { start, end } = rangeWindow(state, range, now);
  return stepSeries(events, start, Math.max(end, start + 1000), instrument.startingPrice);
}

export function netWorthSeries(state: EventState, teamId: string, range: ChartRange, now: number): ChartPoint[] {
  const points = state.valuations.filter((v) => v.netWorth[teamId] !== undefined).map((v) => ({ t: v.t, value: v.netWorth[teamId] }));
  const { start, end } = rangeWindow(state, range, now);
  const current = netWorth(state, teamId);
  const series = stepSeries(points, start, Math.max(end, start + 1000), points[0]?.value ?? current);
  series[series.length - 1] = { ...series[series.length - 1], value: current };
  return series;
}

export type TeamSummary = {
  team: Team;
  cash: Paise;
  holdingsValue: Paise;
  netWorth: Paise;
  capitalBase: Paise;
  returnPct: number;
  realizedPnl: Paise;
  unrealizedPnl: Paise;
  roundPnl: Paise;
  rank: number | null;
  movement: number;
  holdings: HoldingView[];
};

export function teamSummary(state: EventState, teamId: string): TeamSummary | null {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const holdings = teamHoldings(state, teamId);
  const worth = netWorth(state, teamId);
  const base = state.capitalBase[teamId] ?? 0;
  const live = computeLeaderboard(state).find((r) => r.teamId === teamId);
  return {
    team,
    cash: teamCash(state, teamId),
    holdingsValue: holdingsValue(state, teamId),
    netWorth: worth,
    capitalBase: base,
    returnPct: returnPct(worth, base),
    realizedPnl: state.realizedPnl[teamId] ?? 0,
    unrealizedPnl: holdings.reduce((sum, h) => sum + h.unrealizedPnl, 0),
    roundPnl: live?.roundPnl ?? 0,
    rank: live?.rank ?? null,
    movement: live?.movement ?? 0,
    holdings,
  };
}

export function publishedRankOf(state: EventState, teamId: string) {
  return publishedLeaderboard(state).rows.find((r) => r.teamId === teamId) ?? null;
}

export function movers(state: EventState, limit = 5) {
  const rows = instrumentRows(state, { enabledOnly: true });
  const gainers = rows.filter((r) => r.roundChangePct > 0).sort((a, b) => b.roundChangePct - a.roundChangePct).slice(0, limit);
  const losers = rows.filter((r) => r.roundChangePct < 0).sort((a, b) => a.roundChangePct - b.roundChangePct).slice(0, limit);
  return { gainers, losers };
}

export function releasesNewestFirst(state: EventState): NewsRelease[] {
  return [...state.newsReleases].sort((a, b) => b.releasedAt - a.releasedAt);
}

export function proposalsForTeam(state: EventState, teamId: string) {
  const involved = state.proposals.filter((p) => p.proposerTeamId === teamId || p.counterpartyTeamId === teamId);
  const sorted = [...involved].sort((a, b) => b.createdAt - a.createdAt);
  return {
    all: sorted,
    incomingOpen: sorted.filter((p) => p.counterpartyTeamId === teamId && p.status === "PROPOSED"),
    outgoingOpen: sorted.filter((p) => p.proposerTeamId === teamId && (p.status === "PROPOSED" || p.status === "PENDING_APPROVAL")),
    pendingApproval: sorted.filter((p) => p.status === "PENDING_APPROVAL"),
  };
}

export function tradesForTeam(state: EventState, teamId: string) {
  return state.trades.filter((t) => t.buyerTeamId === teamId || t.sellerTeamId === teamId).sort((a, b) => b.settledAt - a.settledAt);
}

export type TeamLedgerRow = { journal: LedgerJournal; cashChange: number; shareChanges: { instrumentId: string; amount: number }[]; cashAfter: number | null };

export function ledgerForTeam(state: EventState, teamId: string): TeamLedgerRow[] {
  const account = teamAccount(teamId);
  return state.journals
    .filter((j) => j.postings.some((p) => p.account === account))
    .map((journal) => {
      const own = journal.postings.filter((p) => p.account === account);
      const cash = own.find((p) => p.asset === "CASH");
      return {
        journal,
        cashChange: cash?.amount ?? 0,
        cashAfter: cash?.balanceAfter ?? null,
        shareChanges: own.filter((p) => p.asset !== "CASH").map((p) => ({ instrumentId: p.asset.slice(11), amount: p.amount })),
      };
    })
    .sort((a, b) => b.journal.at - a.journal.at);
}

export function describeActor(state: EventState, actor: AuditEvent["actor"]) {
  return actorLabel(actor, teamNameOf(state));
}

export function counterpartyLabel(state: EventState, proposal: TradeProposal, perspectiveTeamId: string) {
  const other = proposal.proposerTeamId === perspectiveTeamId ? proposal.counterpartyTeamId : proposal.proposerTeamId;
  return teamNameOf(state)(other);
}

/** From a team's perspective: does this proposal make them the buyer? */
export function isBuyerFor(proposal: TradeProposal, teamId: string) {
  return proposal.proposerTeamId === teamId ? proposal.side === "BUY" : proposal.side === "SELL";
}

export function tradingVolume(state: EventState, roundId: string | null) {
  const trades = roundId ? state.trades.filter((t) => t.roundId === roundId) : state.trades;
  return { count: trades.length, value: trades.reduce((sum, t) => sum + t.value, 0) };
}

export function systemAccountsTouched(journal: LedgerJournal) {
  return journal.postings.filter((p) => !isTeamAccount(p.account)).map((p) => p.account);
}
