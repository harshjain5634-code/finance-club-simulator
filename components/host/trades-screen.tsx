"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, Flag, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonKbd } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { JournalTypeBadge, ProposalStatusBadge } from "@/components/market/status";
import { changePct, formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { highValueThreshold, monitorProposal, type TradeFlag } from "@/lib/domain/monitoring";
import { teamCash, teamShares } from "@/lib/domain/portfolio";
import { currentRound } from "@/lib/domain/trading-gate";
import type { EventState, TradeProposal } from "@/lib/domain/types";
import { formatClock, formatDuration, formatQuantity } from "@/lib/format";
import { approveProposal, rejectProposalByHost } from "@/lib/mock/commands";
import { downloadCsv } from "@/lib/mock/exports";
import { useNow } from "@/lib/mock/hooks";
import { describeActor, symbolOf, teamNameOf } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";

type Filter = "ALL" | "APPROVALS" | "OPEN" | "SETTLED" | "REJECTED" | "EXPIRED" | "EXCEPTIONS" | "FLAGGED";

const REJECTED = new Set(["REJECTED", "REJECTED_BY_HOST", "CANCELLED"]);

function matches(filter: Filter, p: TradeProposal, flags: TradeFlag[]) {
  switch (filter) {
    case "APPROVALS":
      return p.status === "PENDING_APPROVAL";
    case "OPEN":
      return p.status === "PROPOSED" || p.status === "ACCEPTED";
    case "SETTLED":
      return p.status === "SETTLED";
    case "REJECTED":
      return REJECTED.has(p.status);
    case "EXPIRED":
      return p.status === "EXPIRED";
    case "EXCEPTIONS":
      return p.status === "FAILED";
    case "FLAGGED":
      return flags.length > 0;
    default:
      return true;
  }
}

function sellerBuyer(p: TradeProposal) {
  return p.side === "SELL" ? { seller: p.proposerTeamId, buyer: p.counterpartyTeamId } : { seller: p.counterpartyTeamId, buyer: p.proposerTeamId };
}

function statusLabel(p: TradeProposal) {
  if (p.status === "REJECTED") return p.rejectionReason?.startsWith("Countered") ? "Countered" : "Rejected by team";
  if (p.status === "REJECTED_BY_HOST") return "Rejected by host";
  if (p.status === "CANCELLED") return "Withdrawn";
  return null;
}

/**
 * C4 Host Trades (section 15, frame 106:6924). One list of every proposal and trade, grouped so decisions come
 * first: needs approval (oldest first), open proposals (closest to expiry), then everything earlier. The right pane
 * explains the selected row: monitoring flags, both teams' position afterwards, the ledger journal and the audit
 * trail, with Approve / Reject for approvals (A / R).
 */
export function TradesMonitorScreen() {
  const { state, eventId } = useHostEvent();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [roundId, setRoundId] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const name = teamNameOf(state);
  const symbol = symbolOf(state);

  const rows = useMemo(
    () =>
      state.proposals.map((p) => ({
        p,
        flags: monitorProposal(state, p).flags,
      })),
    [state],
  );
  const inRound = rows.filter((r) => roundId === "ALL" || r.p.roundId === roundId);
  const counts = Object.fromEntries((["ALL", "APPROVALS", "OPEN", "SETTLED", "REJECTED", "EXPIRED", "EXCEPTIONS", "FLAGGED"] as Filter[]).map((f) => [f, inRound.filter((r) => matches(f, r.p, r.flags)).length])) as Record<Filter, number>;
  const q = query.trim().toLowerCase();
  const visible = inRound.filter((r) => matches(filter, r.p, r.flags)).filter((r) => {
    if (!q) return true;
    const { seller, buyer } = sellerBuyer(r.p);
    return `${r.p.id} ${r.p.tradeId ?? ""} ${name(seller)} ${name(buyer)} ${symbol(r.p.instrumentId)}`.toLowerCase().includes(q);
  });

  const approvals = visible.filter((r) => r.p.status === "PENDING_APPROVAL").sort((a, b) => waitingSince(a.p) - waitingSince(b.p));
  const open = visible.filter((r) => r.p.status === "PROPOSED" || r.p.status === "ACCEPTED").sort((a, b) => a.p.expiresAt - b.p.expiresAt);
  const earlier = visible.filter((r) => !approvals.includes(r) && !open.includes(r)).sort((a, b) => lastAt(b.p) - lastAt(a.p));

  const selectedId = params.get("id") ?? approvals[0]?.p.id ?? open[0]?.p.id ?? earlier[0]?.p.id ?? null;
  const selected = state.proposals.find((p) => p.id === selectedId || p.tradeId === selectedId) ?? null;
  const select = (id: string) => router.replace(`${pathname}?id=${id}`, { scroll: false });

  const round = currentRound(state);
  const settledValue = inRound.filter((r) => r.p.status === "SETTLED").reduce((s, r) => s + r.p.price * r.p.quantity, 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-[calc(100dvh-112px-32px-32px)] xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
          <h1 className="text-h2 font-semibold text-fg-primary">Trades</h1>
          <span className="text-caption text-fg-muted">
            {roundId === "ALL" ? "All rounds" : (state.rounds.find((r) => r.id === roundId)?.name ?? "")} · {counts.SETTLED} settled · {formatINR(settledValue, 0)} traded
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Select
              size="sm"
              className="w-48"
              aria-label="Round"
              value={roundId}
              onValueChange={setRoundId}
              options={[{ value: "ALL", label: "All rounds" }, ...state.rounds.map((r) => ({ value: r.id, label: `${r.type === "BRIEFING" ? "Briefing" : `Round ${r.number}`} · ${r.name}${round?.id === r.id ? " (now)" : ""}` }))]}
            />
            <Button variant="ghost" size="sm" onClick={() => downloadCsv(state, "proposals")}>
              <Download className="size-4" /> Export CSV
            </Button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <SegmentedControl
            size="md"
            label="Filter trades"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: `All ${counts.ALL}` },
              { value: "APPROVALS", label: `Approvals ${counts.APPROVALS}` },
              { value: "OPEN", label: `Open ${counts.OPEN}` },
              { value: "SETTLED", label: `Settled ${counts.SETTLED}` },
              { value: "REJECTED", label: `Rejected ${counts.REJECTED}` },
              { value: "EXPIRED", label: `Expired ${counts.EXPIRED}` },
              { value: "EXCEPTIONS", label: `Failed ${counts.EXCEPTIONS}` },
              { value: "FLAGGED", label: `Flagged ${counts.FLAGGED}` },
            ]}
          />
          <label className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Team, stock or ID"
              aria-label="Search trades"
              className="h-(--control-h) w-full rounded-md border border-border bg-surface pr-3 pl-9 text-[14px] text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <caption className="sr-only">Proposals and trades</caption>
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="h-9 border-b border-border text-caption text-fg-muted">
                <th scope="col" className="pl-5 text-left font-medium">Time</th>
                <th scope="col" className="px-3 text-left font-medium">ID</th>
                <th scope="col" className="px-3 text-left font-medium">Seller → buyer</th>
                <th scope="col" className="px-3 text-left font-medium">Stock</th>
                <th scope="col" className="px-3 text-right font-medium">Qty</th>
                <th scope="col" className="px-3 text-right font-medium">Price</th>
                <th scope="col" className="px-3 text-right font-medium">vs last</th>
                <th scope="col" className="px-3 text-right font-medium">Value</th>
                <th scope="col" className="pr-5 pl-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-meta text-fg-secondary">
                    {state.proposals.length === 0 ? "No proposals yet. They appear here the moment a team sends one." : "Nothing matches these filters."}
                  </td>
                </tr>
              )}
              {approvals.length > 0 && <GroupRow label="Needs approval" hint="oldest first · A approve · R reject" />}
              {approvals.map((r) => (
                <TradeRow key={r.p.id} state={state} p={r.p} flags={r.flags} now={now} selected={selected?.id === r.p.id} onSelect={() => select(r.p.id)} />
              ))}
              {open.length > 0 && <GroupRow label="Open proposals" hint={`${open.length} · closest to expiry first`} />}
              {open.map((r) => (
                <TradeRow key={r.p.id} state={state} p={r.p} flags={r.flags} now={now} selected={selected?.id === r.p.id} onSelect={() => select(r.p.id)} />
              ))}
              {earlier.length > 0 && (approvals.length > 0 || open.length > 0) && <GroupRow label="Earlier" hint="newest first" />}
              {earlier.map((r) => (
                <TradeRow key={r.p.id} state={state} p={r.p} flags={r.flags} now={now} selected={selected?.id === r.p.id} onSelect={() => select(r.p.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected ? (
        <DetailPane key={selected.id} state={state} p={selected} now={now} eventId={eventId} />
      ) : (
        <Card className="grid place-items-center p-10 text-center text-meta text-fg-secondary">Select a row to see its details and audit trail.</Card>
      )}
    </div>
  );
}

function waitingSince(p: TradeProposal) {
  return [...p.history].reverse().find((h) => h.status === "PENDING_APPROVAL")?.at ?? p.createdAt;
}
function lastAt(p: TradeProposal) {
  return p.history.at(-1)?.at ?? p.createdAt;
}

function GroupRow({ label, hint }: { label: string; hint: string }) {
  return (
    <tr className="h-8 bg-canvas-subtle">
      <th scope="colgroup" colSpan={9} className="px-5 text-left">
        <span className="flex items-center justify-between">
          <span className="eyebrow text-fg-secondary">{label}</span>
          <span className="text-caption font-normal text-fg-muted">{hint}</span>
        </span>
      </th>
    </tr>
  );
}

function TradeRow({ state, p, flags, now, selected, onSelect }: { state: EventState; p: TradeProposal; flags: TradeFlag[]; now: number; selected: boolean; onSelect: () => void }) {
  const name = teamNameOf(state);
  const { seller, buyer } = sellerBuyer(p);
  const vs = changePct(p.referencePriceAtProposal, p.price);
  const label = statusLabel(p);
  return (
    <tr
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      aria-selected={selected}
      className={cn("h-(--row-h) cursor-pointer border-b border-border-subtle hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none", selected && "bg-accent-soft/50 shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-accent-soft/60")}
    >
      <td className="pl-5 font-mono text-[13px] text-fg-muted">{formatClock(lastAt(p), true)}</td>
      <td className="px-3 font-mono text-[13px] text-fg-muted">{p.tradeId ?? p.id}</td>
      <td className="max-w-[260px] truncate px-3 text-[14px] text-fg-primary">
        {name(seller)} → {name(buyer)}
      </td>
      <td className="px-3 font-mono text-[13px] font-medium text-fg-primary">{symbolOf(state)(p.instrumentId)}</td>
      <td className="px-3 text-right font-mono text-[13px] text-fg-primary">{formatQuantity(p.quantity)}</td>
      <td className="px-3 text-right font-mono text-[13px] text-fg-primary">{formatPrice(p.price)}</td>
      <td className={cn("px-3 text-right font-mono text-[13px]", Math.abs(vs) >= 5 ? "text-warning" : "text-fg-muted")}>{formatPct(vs, { decimals: 1 })}</td>
      <td className="px-3 text-right font-mono text-[13px] text-fg-primary">{formatINR(p.price * p.quantity, 0)}</td>
      <td className="pr-5 pl-3">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {p.status === "PENDING_APPROVAL" ? (
            <Badge tone="warning" dot>
              Waiting
            </Badge>
          ) : p.status === "PROPOSED" ? (
            <Badge tone="outline">{formatDuration(Math.max(0, p.expiresAt - now))} left</Badge>
          ) : label ? (
            <Badge tone="outline">{label}</Badge>
          ) : (
            <ProposalStatusBadge status={p.status} />
          )}
          {flags.length > 0 && <Flag className="size-3.5 text-warning" aria-label={flags.map((f) => (f === "HIGH_VALUE" ? "high value" : "far from market")).join(", ")} />}
        </span>
      </td>
    </tr>
  );
}

function DetailPane({ state, p, now, eventId }: { state: EventState; p: TradeProposal; now: number; eventId: string }) {
  const [reject, setReject] = useState(false);
  const name = teamNameOf(state);
  const symbol = symbolOf(state)(p.instrumentId);
  const { seller, buyer } = sellerBuyer(p);
  const m = monitorProposal(state, p);
  const value = p.price * p.quantity;
  const trade = p.tradeId ? state.trades.find((t) => t.id === p.tradeId) : undefined;
  const journal = trade ? state.journals.find((j) => j.id === trade.journalId) : undefined;
  const audit = state.audit.filter((a) => a.refs.proposalId === p.id || (trade && a.refs.tradeId === trade.id) || a.refs.counterProposalId === p.id);
  const pending = p.status === "PENDING_APPROVAL";
  const label = statusLabel(p);
  const refVs = changePct(p.referencePriceAtProposal, p.price);
  const moneyVsMarket = (p.price - p.referencePriceAtProposal) * p.quantity;

  const approve = () => hostAction(approveProposal(eventId, p.id, `approve-${p.id}`), (t) => `${t.id} settled`, "Both teams see the decision now.");

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      if (e.key === "a") {
        e.preventDefault();
        void approve();
      } else if (e.key === "r") {
        e.preventDefault();
        setReject(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, p.id]);

  // Positions afterwards: settled trades show the recorded balances; pending ones show what would happen.
  const after = (teamId: string, sign: 1 | -1) => {
    if (journal) {
      const cash = journal.postings.find((x) => x.account === `TEAM:${teamId}` && x.asset === "CASH")?.balanceAfter;
      const shares = journal.postings.find((x) => x.account === `TEAM:${teamId}` && x.asset !== "CASH")?.balanceAfter;
      return cash !== undefined ? `${formatINR(cash, 0)} · ${formatQuantity(shares ?? 0)} ${symbol}` : null;
    }
    if (p.status !== "PENDING_APPROVAL" && p.status !== "PROPOSED" && p.status !== "ACCEPTED") return null;
    return `${formatINR(teamCash(state, teamId) + sign * value, 0)} · ${formatQuantity(teamShares(state, teamId, p.instrumentId) - sign * p.quantity)} ${symbol}`;
  };

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] font-medium text-fg-primary">{p.tradeId ?? p.id}</span>
          {pending ? (
            <Badge tone="warning" dot>
              Waiting for you · {formatDuration(Math.max(0, now - waitingSince(p)))}
            </Badge>
          ) : p.status === "PROPOSED" ? (
            <Badge tone="outline">Open · {formatDuration(Math.max(0, p.expiresAt - now))} left</Badge>
          ) : label ? (
            <Badge tone="outline">{label}</Badge>
          ) : (
            <ProposalStatusBadge status={p.status} />
          )}
          <button
            type="button"
            aria-label="Copy ID"
            className="ml-auto grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg-primary"
            onClick={() => {
              void navigator.clipboard?.writeText(p.tradeId ?? p.id);
              toast.info("ID copied", p.tradeId ?? p.id);
            }}
          >
            <Copy className="size-4" />
          </button>
        </div>
        <h2 className="mt-2 text-h2 font-semibold text-fg-primary">
          {name(seller)} sells {formatQuantity(p.quantity)} <span className="font-mono">{symbol}</span> to {name(buyer)}
        </h2>
        {p.tradeId && <p className="mt-0.5 font-mono text-caption text-fg-muted">from proposal {p.id}</p>}

        {m.flags.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-soft px-4 py-3">
            {m.flags.includes("FAR_FROM_MARKET") && (
              <FlagNote title="Far from market">
                ₹{formatPrice(p.price)} is {formatPct(Math.abs(refVs), { signed: false })} {refVs > 0 ? "above" : "below"} the price when it was proposed (₹{formatPrice(p.referencePriceAtProposal)}). {name(refVs > 0 ? buyer : seller)} {refVs > 0 ? "pays" : "receives"} {formatINR(Math.abs(moneyVsMarket), 0)} {refVs > 0 ? "more" : "less"} than market value, which can move value between teams.
              </FlagNote>
            )}
            {m.flags.includes("HIGH_VALUE") && (
              <FlagNote title={`Over ${formatINR(highValueThreshold(state.event), 0)}`}>
                {state.event.rules.approvalEnabled && state.event.rules.approvalThreshold !== null && value >= state.event.rules.approvalThreshold
                  ? "Above your approval limit, so it waits for a host."
                  : "A monitoring flag only: nothing is blocked. Worth a look if it seems out of character."}
              </FlagNote>
            )}
          </div>
        )}

        <dl className="mt-4 flex flex-col gap-2 text-[14px]">
          <Row label="Quantity × price" value={`${formatQuantity(p.quantity)} × ₹${formatPrice(p.price)}`} />
          <Row label="Value" value={formatINR(value, 0)} />
          <Row label="Price when proposed" value={`₹${formatPrice(p.referencePriceAtProposal)}`} />
          {after(seller, 1) && <Row label={`${name(seller)} after`} value={after(seller, 1)!} />}
          {after(buyer, -1) && <Row label={`${name(buyer)} after`} value={after(buyer, -1)!} />}
          {(p.rejectionReason || p.failureReason) && <Row label="Reason" value={p.failureReason ?? p.rejectionReason!} mono={false} />}
          {p.counterOfProposalId && <Row label="Counter-offer to" value={p.counterOfProposalId} />}
        </dl>

        {journal && (
          <section className="mt-5">
            <h3 className="flex items-center gap-2 text-h3 font-semibold text-fg-primary">
              Ledger <span className="font-mono text-caption font-normal text-fg-muted">{journal.id}</span> <JournalTypeBadge type={journal.type} />
            </h3>
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="h-8 border-b border-border text-caption text-fg-muted">
                  <th className="text-left font-medium">Account</th>
                  <th className="text-left font-medium">Asset</th>
                  <th className="text-right font-medium">Change</th>
                  <th className="text-right font-medium">After</th>
                </tr>
              </thead>
              <tbody>
                {journal.postings.map((x, i) => {
                  const cash = x.asset === "CASH";
                  return (
                    <tr key={i} className="h-8 border-b border-border-subtle">
                      <td className="truncate text-fg-primary">{x.account.startsWith("TEAM:") ? name(x.account.slice(5)) : x.account}</td>
                      <td className="font-mono text-fg-secondary">{cash ? "CASH" : symbolOf(state)(x.asset.slice(11))}</td>
                      <td className="text-right font-mono">{`${x.amount > 0 ? "+" : ""}${cash ? formatINR(x.amount, 0) : x.amount}`}</td>
                      <td className="text-right font-mono text-fg-secondary">{cash ? formatINR(x.balanceAfter, 0) : x.balanceAfter}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1.5 text-caption text-fg-muted">Postings net to zero for cash and for the stock.</p>
          </section>
        )}

        <section className="mt-5">
          <h3 className="text-h3 font-semibold text-fg-primary">Audit trail</h3>
          <ol className="mt-2 border-l border-border pl-4">
            {audit.map((a) => (
              <li key={a.id} className="relative pb-3">
                <span aria-hidden className={cn("absolute top-1.5 -left-[21px] size-2 rounded-full", a.type === "TRADE_APPROVAL_REQUESTED" ? "bg-warning" : a.type === "TRADE_SETTLED" ? "bg-positive" : "bg-fg-muted")} />
                <p className="font-mono text-caption text-fg-muted">{formatClock(a.at, true)}</p>
                <p className="text-[14px] text-fg-primary">{a.summary}</p>
                <p className="text-caption text-fg-muted">
                  {describeActor(state, a.actor)}
                  {a.reason ? ` · “${a.reason}”` : ""}
                </p>
              </li>
            ))}
            {pending && <li className="text-caption text-fg-muted">Approve settles at once. Reject needs a reason, and both teams see it.</li>}
          </ol>
        </section>
      </div>
      {pending && (
        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <Button variant="primary" onClick={approve} aria-keyshortcuts="A">
            Approve <ButtonKbd variant="primary">A</ButtonKbd>
          </Button>
          <Button variant="secondary" onClick={() => setReject(true)} aria-keyshortcuts="R">
            Reject… <ButtonKbd>R</ButtonKbd>
          </Button>
        </footer>
      )}
      <ConfirmActionDialog
        open={reject}
        onOpenChange={setReject}
        tier="reason"
        tone="warning"
        title={`Reject ${p.id}?`}
        description="The trade does not settle. Both teams see your reason immediately."
        confirmLabel="Reject trade"
        reasonLabel="Reason (shown to both teams)"
        onConfirm={({ reason, idempotencyKey }) => hostAction(rejectProposalByHost(eventId, p.id, reason, idempotencyKey), `${p.id} rejected`)}
      />
    </Card>
  );
}

function FlagNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Flag className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div>
        <p className="text-[14px] font-semibold text-warning">{title}</p>
        <p className="text-caption text-fg-secondary">{children}</p>
      </div>
    </div>
  );
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className={cn("text-right text-fg-primary", mono && "font-mono text-[13px]")}>{value}</dd>
    </div>
  );
}
