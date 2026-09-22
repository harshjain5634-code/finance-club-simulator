"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Inbox, TimerReset, XCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatINR, formatPrice } from "@/lib/domain/money";
import type { EventState, TradeProposal } from "@/lib/domain/types";
import { formatDuration } from "@/lib/format";
import { acceptProposal } from "@/lib/mock/commands";
import { proposalView } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type AttentionItem =
  | { kind: "incoming"; proposal: TradeProposal }
  | { kind: "expiring"; proposal: TradeProposal }
  | { kind: "rejected"; proposal: TradeProposal; at: number };

const EXPIRING_MS = 45_000;
const REJECTED_WINDOW_MS = 3 * 60_000;

/** Things that need this team now: incoming proposals, own offers about to expire, and fresh rejections. */
export function useAttentionItems(state: EventState, teamId: string, now: number): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const proposal of state.proposals) {
    if (proposal.status === "PROPOSED" && proposal.counterpartyTeamId === teamId && proposal.expiresAt > now) items.push({ kind: "incoming", proposal });
    else if (proposal.status === "PROPOSED" && proposal.proposerTeamId === teamId && proposal.expiresAt > now && proposal.expiresAt - now <= EXPIRING_MS) items.push({ kind: "expiring", proposal });
    else if ((proposal.status === "REJECTED" || proposal.status === "REJECTED_BY_HOST") && proposal.proposerTeamId === teamId) {
      const at = proposal.history[proposal.history.length - 1]?.at ?? proposal.createdAt;
      if (now - at <= REJECTED_WINDOW_MS) items.push({ kind: "rejected", proposal, at });
    }
  }
  const order = { incoming: 0, expiring: 1, rejected: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.proposal.expiresAt - b.proposal.expiresAt);
}

/**
 * C4 "Needs your attention". Only rendered when there is something to act on, so the dashboard never keeps an
 * empty slot. Each item states the consequence (what you pay, cash after) so a team can decide without opening it.
 */
export function NeedsAttention({ state, teamId, code, items, now, className }: { state: EventState; teamId: string; code: string; items: AttentionItem[]; now: number; className?: string }) {
  return (
    <Card className={cn("overflow-hidden border-accent", className)} aria-labelledby="attention-title">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 id="attention-title" className="text-h3 font-semibold text-fg-primary">
          Needs your attention
        </h2>
        <span className="grid h-5 min-w-5 place-items-center rounded-xs bg-accent px-1 text-caption font-medium text-accent-fg">{items.length}</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {items.slice(0, 3).map((item) => (
          <AttentionRow key={`${item.kind}-${item.proposal.id}`} state={state} teamId={teamId} code={code} item={item} now={now} />
        ))}
      </ul>
      {items.length > 3 && (
        <Link href={`/event/${code}/trade`} className="block border-t border-border px-4 py-2.5 text-[13px] font-medium text-accent-text hover:underline">
          {items.length - 3} more in Trade
        </Link>
      )}
    </Card>
  );
}

function AttentionRow({ state, teamId, code, item, now }: { state: EventState; teamId: string; code: string; item: AttentionItem; now: number }) {
  const [pending, setPending] = useState(false);
  const view = proposalView(state, item.proposal, teamId);
  const remaining = item.proposal.expiresAt - now;
  const Icon = item.kind === "incoming" ? Inbox : item.kind === "expiring" ? TimerReset : XCircle;

  const accept = async () => {
    setPending(true);
    const result = await acceptProposal(state.event.id, teamId, item.proposal.id);
    setPending(false);
    if (!result.ok) {
      toast.error("Trade could not settle", result.message);
      return;
    }
    const outcome = result.value as { kind: string; alreadySettled?: boolean };
    if (outcome.kind === "PENDING_APPROVAL") toast.info("Sent to the host for approval", "Large trades wait for a host check before they settle.");
    else if (!outcome.alreadySettled) toast.success(`Trade settled with ${view.otherTeam}`, `You ${view.youBuy ? "bought" : "sold"} ${item.proposal.quantity} ${view.symbol} at ₹${formatPrice(item.proposal.price)}.`);
  };

  return (
    <li className="flex gap-3 px-4 py-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", item.kind === "rejected" ? "bg-canvas-subtle text-fg-muted" : item.kind === "expiring" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-text")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5 font-medium text-fg-primary">
          {item.kind === "rejected" ? `${view.otherTeam} rejected your offer: ${view.youBuy ? "buy" : "sell"} ${item.proposal.quantity} ${view.symbol} at ₹${formatPrice(item.proposal.price)}` : view.sentence}
        </p>
        {item.kind !== "rejected" && (
          <p className="mt-0.5 text-caption text-fg-secondary">
            {view.youBuy ? "You pay" : "You receive"} {formatINR(view.value, 0)} · cash after {formatINR(view.cashAfter, 0)}
          </p>
        )}
        {item.kind === "rejected" && item.proposal.rejectionReason && <p className="mt-0.5 text-caption text-fg-secondary">“{item.proposal.rejectionReason}”</p>}
        <div className="mt-2.5 flex items-center gap-2">
          {item.kind !== "rejected" && (
            <span className={cn("mr-auto inline-flex items-center gap-1 font-mono text-caption tabular-nums", remaining <= 30_000 ? "text-warning" : "text-fg-muted")}>
              <Clock className="size-3.5" aria-hidden />
              <span className="sr-only">Expires in </span>
              {formatDuration(Math.max(0, remaining))}
            </span>
          )}
          {item.kind === "incoming" ? (
            <>
              <Link href={`/event/${code}/trade?proposal=${item.proposal.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Review
              </Link>
              <Button variant="primary" size="sm" onClick={accept} disabled={pending}>
                {pending ? "Settling…" : "Accept"}
              </Button>
            </>
          ) : item.kind === "expiring" ? (
            <Link href={`/event/${code}/trade`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              View offer
            </Link>
          ) : (
            <Link href={`/event/${code}/trade?symbol=${view.symbol}&side=${view.youBuy ? "BUY" : "SELL"}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Try another price
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
