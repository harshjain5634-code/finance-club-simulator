import { computeLeaderboard } from "@/lib/domain/leaderboard";
import { CASH, isTeamAccount, teamIdFromAccount } from "@/lib/domain/ledger";
import { describeConfigured } from "@/lib/domain/news";
import { teamHoldings, teamCash } from "@/lib/domain/portfolio";
import type { EventState, Paise } from "@/lib/domain/types";
import { describeActor, symbolOf, teamNameOf } from "./selectors";

/** Frontend CSV generation (Phase 1). Phase 2 streams the same shapes from database queries. */

type Cell = string | number | boolean | null | undefined;
export type CsvTable = { headers: string[]; rows: Cell[][] };

const rupees = (paise: Paise) => (paise / 100).toFixed(2);
const iso = (at: number) => new Date(at).toISOString();
const ist = (at: number) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }).format(at);

function escape(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(table: CsvTable): string {
  return [table.headers, ...table.rows].map((row) => row.map(escape).join(",")).join("\r\n");
}

export type ExportKind = "trades" | "proposals" | "ledger" | "balances" | "holdings" | "price-events" | "news-releases" | "leaderboard" | "audit";

export const EXPORTS: { kind: ExportKind; label: string; description: string }[] = [
  { kind: "trades", label: "Trades", description: "Every settled P2P trade with buyer, seller and journal" },
  { kind: "proposals", label: "Proposals", description: "All proposals including rejected, expired and failed" },
  { kind: "ledger", label: "Ledger", description: "Every journal posting with balance after" },
  { kind: "balances", label: "Balances", description: "Current cash, holdings value and net worth per team" },
  { kind: "holdings", label: "Holdings", description: "Positions per team with cost basis and P&L" },
  { kind: "price-events", label: "Price events", description: "Every price change with configured, resolved and applied impact" },
  { kind: "news-releases", label: "News releases", description: "Released stories with resolved impacts" },
  { kind: "leaderboard", label: "Leaderboard", description: "Current live standings" },
  { kind: "audit", label: "Audit log", description: "Complete audit trail with before/after values" },
];

export function buildExport(state: EventState, kind: ExportKind): CsvTable {
  const name = teamNameOf(state);
  const symbol = symbolOf(state);
  const round = (roundId: string | null) => state.rounds.find((r) => r.id === roundId)?.name ?? "";

  switch (kind) {
    case "trades":
      return {
        headers: ["trade_id", "settled_at_iso", "settled_at_ist", "round", "stock", "buyer", "seller", "quantity", "price_inr", "value_inr", "proposal_id", "journal_id"],
        rows: state.trades.map((t) => [t.id, iso(t.settledAt), ist(t.settledAt), round(t.roundId), symbol(t.instrumentId), name(t.buyerTeamId), name(t.sellerTeamId), t.quantity, rupees(t.price), rupees(t.value), t.proposalId, t.journalId]),
      };
    case "proposals":
      return {
        headers: ["proposal_id", "created_at_iso", "round", "proposer", "side", "counterparty", "stock", "quantity", "price_inr", "reference_price_inr", "status", "reason", "trade_id", "idempotency_key"],
        rows: state.proposals.map((p) => [p.id, iso(p.createdAt), round(p.roundId), name(p.proposerTeamId), p.side, name(p.counterpartyTeamId), symbol(p.instrumentId), p.quantity, rupees(p.price), rupees(p.referencePriceAtProposal), p.status, p.failureReason ?? p.rejectionReason ?? "", p.tradeId ?? "", p.idempotencyKey]),
      };
    case "ledger":
      return {
        headers: ["journal_id", "at_iso", "type", "reference_id", "memo", "reason", "account", "asset", "amount", "balance_after", "actor"],
        rows: state.journals.flatMap((j) =>
          j.postings.map((p) => [
            j.id,
            iso(j.at),
            j.type,
            j.referenceId,
            j.memo,
            j.reason ?? "",
            isTeamAccount(p.account) ? `TEAM:${name(teamIdFromAccount(p.account))}` : p.account,
            p.asset === CASH ? "CASH_INR" : symbol(p.asset.slice(11)),
            p.asset === CASH ? rupees(p.amount) : p.amount,
            p.asset === CASH ? rupees(p.balanceAfter) : p.balanceAfter,
            describeActor(state, j.actor),
          ]),
        ),
      };
    case "balances":
      return {
        headers: ["team", "login_code", "status", "cash_inr", "holdings_value_inr", "net_worth_inr", "capital_base_inr", "return_pct", "realized_pnl_inr"],
        rows: computeLeaderboard(state).map((r) => {
          const team = state.teams.find((t) => t.id === r.teamId)!;
          const cash = teamCash(state, r.teamId);
          return [r.teamName, team.loginCode, team.status, rupees(cash), rupees(r.netWorth - cash), rupees(r.netWorth), rupees(r.capitalBase), r.returnPct.toFixed(4), rupees(state.realizedPnl[r.teamId] ?? 0)];
        }),
      };
    case "holdings":
      return {
        headers: ["team", "stock", "quantity", "average_cost_inr", "cost_basis_inr", "price_inr", "value_inr", "unrealized_pnl_inr"],
        rows: state.teams.flatMap((team) => teamHoldings(state, team.id).map((h) => [team.name, symbol(h.instrumentId), h.quantity, (h.averageCost / 100).toFixed(4), rupees(h.costBasis), rupees(h.price), rupees(h.value), rupees(h.unrealizedPnl)])),
      };
    case "price-events":
      return {
        headers: ["price_event_id", "at_iso", "round", "stock", "source", "previous_price_inr", "new_price_inr", "configured_impact", "resolved_impact_pct", "applied_pct", "clamped", "clamp_reasons", "news_release_id", "actor", "reason"],
        rows: state.priceEvents.map((e) => [e.id, iso(e.at), round(e.roundId), symbol(e.instrumentId), e.source, rupees(e.previousPrice), rupees(e.newPrice), e.configuredImpact ? describeConfigured(e.configuredImpact) : "", e.resolvedImpactPct ?? "", e.appliedPct, e.clamped, e.clampReasons.join("|"), e.newsReleaseId ?? "", describeActor(state, e.actor), e.reason ?? ""]),
      };
    case "news-releases":
      return {
        headers: ["release_id", "released_at_iso", "round", "headline", "stock", "configured_impact", "resolved_pct", "applied_pct", "previous_price_inr", "new_price_inr", "clamped"],
        rows: state.newsReleases.flatMap((r) =>
          (r.impacts.length ? r.impacts : [null]).map((i) => [r.id, iso(r.releasedAt), round(r.roundId), r.headline, i ? symbol(i.instrumentId) : "", i ? describeConfigured(i.configured) : "", i?.resolvedPct ?? "", i?.appliedPct ?? "", i ? rupees(i.previousPrice) : "", i ? rupees(i.newPrice) : "", i?.clamped ?? ""]),
        ),
      };
    case "leaderboard":
      return {
        headers: ["rank", "team", "net_worth_inr", "capital_base_inr", "return_pct", "round_pnl_inr", "movement"],
        rows: computeLeaderboard(state).map((r) => [r.rank, r.teamName, rupees(r.netWorth), rupees(r.capitalBase), r.returnPct.toFixed(4), rupees(r.roundPnl), r.movement]),
      };
    case "audit":
      return {
        headers: ["audit_id", "at_iso", "at_ist", "type", "actor", "team", "round", "summary", "reason", "before_json", "after_json", "refs_json"],
        rows: state.audit.map((a) => [a.id, iso(a.at), ist(a.at), a.type, describeActor(state, a.actor), a.teamId ? name(a.teamId) : "", round(a.roundId), a.summary, a.reason ?? "", a.before ? JSON.stringify(a.before) : "", a.after ? JSON.stringify(a.after) : "", JSON.stringify(a.refs)]),
      };
  }
}

export function downloadCsv(state: EventState, kind: ExportKind) {
  const csv = toCsv(buildExport(state, kind));
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.event.code}-${kind}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
