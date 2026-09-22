"use client";

import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { formatINR, formatPct } from "@/lib/domain/money";
import { formatMinutes } from "@/lib/format";
import { useTerminal } from "./terminal-context";

export function RulesScreen() {
  const { state } = useTerminal();
  const { rules } = state.event;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Rules" description={`${state.event.name} · ${state.event.code}`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="How the event runs" divider />
          <ol className="divide-y divide-border">
            {state.rounds.map((round) => (
              <li key={round.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="grid size-7 place-items-center rounded-md border border-border bg-surface-raised text-xs font-semibold text-fg-secondary tabular-nums">{round.number}</span>
                <span className="flex-1">
                  <span className="block font-medium text-fg-primary">{round.name}</span>
                  <span className="block text-xs text-fg-muted">{round.type === "BRIEFING" ? "Briefing · trading closed" : "Trading round"}</span>
                </span>
                <span className="text-fg-secondary tabular-nums">{formatMinutes(round.durationSeconds)}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">Cash, shares and prices carry over from one round to the next.</p>
        </Card>
        <Card>
          <CardHeader title="Trading rules" divider />
          <ul className="space-y-2.5 px-4 py-3.5 text-[13px] text-fg-secondary">
            <Rule title="Trade with other teams">Agree a deal, send a proposal, and it settles once the other team accepts.</Rule>
            <Rule title="Whole shares only">Quantities are whole numbers.</Rule>
            <Rule title="No short selling">You can only sell shares you own.</Rule>
            <Rule title="No negative cash">The buyer must have enough cash when the trade settles.</Rule>
            <Rule title={`Price within ±${rules.priceBandPct}%`}>The trade price must stay within {rules.priceBandPct}% of the stock&apos;s reference price.</Rule>
            <Rule title="Proposals expire">After {formatMinutes(rules.proposalExpirySeconds)}; each team can have {rules.maxOpenOutgoingProposals} open proposals.</Rule>
            <Rule title="Host approval">{rules.approvalEnabled && rules.approvalThreshold ? `Trades worth ${formatINR(rules.approvalThreshold)} or more need host approval.` : "Not required in this event."}</Rule>
            <Rule title="What moves prices">News released by the host and host actions. Trades between teams don&apos;t change the reference price.</Rule>
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Scoring" divider />
          <div className="px-4 py-4">
            <p className="rounded-md border border-border bg-surface-raised px-4 py-3 text-center font-mono text-[13px] text-fg-primary">Return % = (Net worth − Starting capital) ÷ Starting capital × 100</p>
            <ul className="mt-3 grid gap-2 text-[13px] text-fg-secondary md:grid-cols-3">
              <li>
                <span className="font-medium text-fg-primary">Net worth</span> = cash + shares × current reference price.
              </li>
              <li>
                <span className="font-medium text-fg-primary">Starting capital</span> = starting cash + starting shares at their starting prices.
              </li>
              <li>
                <span className="font-medium text-fg-primary">Ties</span>: teams with the same return and net worth share a rank, shown as “=7”.
              </li>
            </ul>
            <p className="mt-3 text-xs text-fg-muted">Example: a return of {formatPct(2.5)} means your portfolio is worth 2.5% more than your starting capital.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <span className="font-medium text-fg-primary">{title}.</span> {children}
    </li>
  );
}
