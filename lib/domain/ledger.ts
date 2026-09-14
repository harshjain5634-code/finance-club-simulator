import { nextId } from "./ids";
import type { Actor, Balances, EventState, JournalType, LedgerJournal, LedgerPosting } from "./types";

export const CASH = "CASH";
export const TREASURY = "SYSTEM:TREASURY";
export const ADJUSTMENTS = "SYSTEM:ADJUSTMENTS";
export const HOUSE = "SYSTEM:HOUSE";

export const teamAccount = (teamId: string) => `TEAM:${teamId}`;
export const instrumentAsset = (instrumentId: string) => `INSTRUMENT:${instrumentId}`;
export const isTeamAccount = (account: string) => account.startsWith("TEAM:");
export const teamIdFromAccount = (account: string) => account.slice("TEAM:".length);
export const instrumentIdFromAsset = (asset: string) => (asset.startsWith("INSTRUMENT:") ? asset.slice(11) : null);

export function getBalance(balances: Balances, account: string, asset: string): number {
  return balances[account]?.[asset] ?? 0;
}

export type PostingDraft = { account: string; asset: string; amount: number };

export type JournalDraft = {
  type: JournalType;
  referenceId: string;
  memo: string;
  reason?: string | null;
  postings: PostingDraft[];
};

export class LedgerError extends Error {
  constructor(
    public code: "UNBALANCED" | "NEGATIVE_BALANCE" | "EMPTY" | "NON_INTEGER",
    message: string,
  ) {
    super(message);
  }
}

/** Every journal must net to zero for each asset (cash and every instrument). */
export function isBalanced(postings: Pick<LedgerPosting, "asset" | "amount">[]): boolean {
  const totals = new Map<string, number>();
  for (const p of postings) totals.set(p.asset, (totals.get(p.asset) ?? 0) + p.amount);
  return [...totals.values()].every((total) => total === 0);
}

/**
 * Validates and applies a journal: team accounts can never go negative, amounts are integers,
 * and postings balance per asset. Nothing is written unless every check passes.
 */
export function postJournal(
  state: EventState,
  draft: JournalDraft,
  meta: { at: number; actor: Actor },
): LedgerJournal {
  const postings = draft.postings.filter((p) => p.amount !== 0);
  if (postings.length === 0) throw new LedgerError("EMPTY", "Journal has no postings");
  if (postings.some((p) => !Number.isInteger(p.amount))) throw new LedgerError("NON_INTEGER", "Amounts must be integers");
  if (!isBalanced(postings)) throw new LedgerError("UNBALANCED", "Journal does not balance per asset");

  const projected = new Map<string, number>();
  for (const p of postings) {
    const key = `${p.account}|${p.asset}`;
    const current = projected.get(key) ?? getBalance(state.balances, p.account, p.asset);
    const next = current + p.amount;
    if (isTeamAccount(p.account) && next < 0) {
      throw new LedgerError("NEGATIVE_BALANCE", `${p.account} would have a negative ${p.asset} balance`);
    }
    projected.set(key, next);
  }

  const running = new Map<string, number>();
  const stored: LedgerPosting[] = postings.map((p) => {
    const key = `${p.account}|${p.asset}`;
    const current = running.get(key) ?? getBalance(state.balances, p.account, p.asset);
    const balanceAfter = current + p.amount;
    running.set(key, balanceAfter);
    return { ...p, balanceAfter };
  });

  for (const [key, value] of running) {
    const [account, asset] = key.split("|");
    state.balances[account] = { ...(state.balances[account] ?? {}), [asset]: value };
  }

  const journal: LedgerJournal = {
    id: nextId(state, "JRN", 9000),
    type: draft.type,
    roundId: state.event.currentRoundId,
    referenceId: draft.referenceId,
    at: meta.at,
    actor: meta.actor,
    memo: draft.memo,
    reason: draft.reason ?? null,
    postings: stored,
  };
  state.journals.push(journal);
  return journal;
}

export type ReconciliationCheck = { id: string; label: string; passed: boolean; detail: string };
export type ReconciliationReport = { passed: boolean; checkedAt: number; checks: ReconciliationCheck[] };

/** Recomputes every balance from the journals and compares it with the stored projections. */
export function reconcile(state: EventState, at: number): ReconciliationReport {
  const unbalanced = state.journals.filter((j) => !isBalanced(j.postings));

  const recomputed: Balances = {};
  for (const journal of state.journals) {
    for (const p of journal.postings) {
      recomputed[p.account] = recomputed[p.account] ?? {};
      recomputed[p.account][p.asset] = (recomputed[p.account][p.asset] ?? 0) + p.amount;
    }
  }

  const accounts = new Set([...Object.keys(recomputed), ...Object.keys(state.balances)]);
  const cashMismatches: string[] = [];
  const holdingMismatches: string[] = [];
  const negatives: string[] = [];

  for (const account of accounts) {
    const assets = new Set([...Object.keys(recomputed[account] ?? {}), ...Object.keys(state.balances[account] ?? {})]);
    for (const asset of assets) {
      const fromLedger = recomputed[account]?.[asset] ?? 0;
      const projection = state.balances[account]?.[asset] ?? 0;
      if (fromLedger !== projection) (asset === CASH ? cashMismatches : holdingMismatches).push(`${account} ${asset}`);
      if (isTeamAccount(account) && projection < 0) negatives.push(`${account} ${asset}`);
    }
  }

  const checks: ReconciliationCheck[] = [
    {
      id: "balanced",
      label: "Ledger balanced",
      passed: unbalanced.length === 0,
      detail:
        unbalanced.length === 0
          ? `${state.journals.length} journals net to zero per asset`
          : `${unbalanced.length} unbalanced journal(s): ${unbalanced.map((j) => j.id).join(", ")}`,
    },
    {
      id: "cash",
      label: "Cash projections match",
      passed: cashMismatches.length === 0,
      detail: cashMismatches.length === 0 ? "Every cash balance equals the sum of its postings" : cashMismatches.join(", "),
    },
    {
      id: "holdings",
      label: "Holdings projections match",
      passed: holdingMismatches.length === 0,
      detail:
        holdingMismatches.length === 0 ? "Every share balance equals the sum of its postings" : holdingMismatches.join(", "),
    },
    {
      id: "non-negative",
      label: "No negative team balances",
      passed: negatives.length === 0,
      detail: negatives.length === 0 ? "No team has negative cash or shares" : negatives.join(", "),
    },
  ];

  return { passed: checks.every((c) => c.passed), checkedAt: at, checks };
}
