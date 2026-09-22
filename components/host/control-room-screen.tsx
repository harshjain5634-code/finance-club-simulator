"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle, Lock, LockOpen, Medal, Percent, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Tooltip } from "@/components/ui/controls";
import { Delta } from "@/components/ui/delta";
import { InlineBanner } from "@/components/ui/misc";
import { RankMovement } from "@/components/market/tables";
import { useRoundClock } from "@/components/market/round-clock";
import { computeLeaderboard } from "@/lib/domain/leaderboard";
import { readiness } from "@/lib/domain/lifecycle";
import { formatINR, formatPrice } from "@/lib/domain/money";
import type { Instrument } from "@/lib/domain/types";
import { haltInstrument, resumeInstrument } from "@/lib/mock/commands";
import { instrumentRows, tradingVolume } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { ActivityFeed } from "./activity-feed";
import { hostAction, hostBase, useHostEvent } from "./host-context";
import { ManualPriceDialog } from "./market-screens";
import { NewsControlPanel } from "./news-control";

/**
 * Live control room. Round and trading controls sit in the always-visible status bar; this screen groups the
 * routine live work: news, market moves, activity and standings.
 */
export function ControlRoomScreen() {
  const { state, eventId } = useHostEvent();
  const { now, round } = useRoundClock(state);
  const base = hostBase(eventId);
  const { event } = state;
  const setup = event.status === "DRAFT" || event.status === "READY";
  const checklist = readiness(state);
  const volume = tradingVolume(state, round?.id ?? null);
  const pendingApprovals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL").length;
  const openProposals = state.proposals.filter((p) => p.status === "PROPOSED").length;
  const releasedCount = state.news.filter((n) => n.status === "RELEASED").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-lg leading-7 font-semibold tracking-tight text-fg-primary">Control room</h1>
          <p className="text-[13px] text-fg-muted">Round and trading controls are in the bar above. Everything else you need live is here.</p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <Stat label="Trades this round" value={String(volume.count)} />
          <Stat label="Volume" value={formatINR(volume.value, 0)} />
          <Stat label="Open proposals" value={String(openProposals)} />
          <Stat label="News released" value={`${releasedCount}/${state.news.length}`} />
        </dl>
      </div>

      {pendingApprovals > 0 && (
        <InlineBanner
          tone="warning"
          title={`${pendingApprovals} trade${pendingApprovals === 1 ? "" : "s"} waiting for your approval.`}
          action={
            <Link href={`${base}/trades`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Review
              <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          Teams can&apos;t settle these until you approve or reject them.
        </InlineBanner>
      )}

      {setup && (
        <Card>
          <CardHeader title="Before you go live" subtitle={event.status === "READY" ? "Setup is complete. Start the event from the bar above." : "Finish these steps, then start the event from the bar above."} divider />
          <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-3 bg-surface px-4 py-2.5">
                <span className={cn("grid size-5 place-items-center rounded-full", item.done ? "bg-accent/15 text-accent-text" : "border border-border-strong text-fg-muted")}>
                  {item.done ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-1.5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg-primary">{item.label}</p>
                  <p className="truncate text-xs text-fg-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <NewsControlPanel state={state} variant="control-room" />
        </div>
        <Card className="flex flex-col xl:col-span-5">
          <CardHeader
            title="Leaderboard"
            subtitle="Top 5 · live host view"
            icon={<Medal className="size-3.5" />}
            divider
            action={
              <Link href={`${base}/leaderboard`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Full leaderboard
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <ol className="flex-1 divide-y divide-border">
            {computeLeaderboard(state)
              .slice(0, 5)
              .map((row) => (
                <li key={row.teamId} className="grid grid-cols-[2rem_2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-[13px]">
                  <span className={cn("font-semibold tabular-nums", row.rank === 1 ? "text-accent-text" : "text-fg-primary")}>#{row.rank}</span>
                  <RankMovement movement={row.movement} className="text-xs" />
                  <span className="truncate font-medium text-fg-primary">{row.teamName}</span>
                  <span className="text-right leading-tight">
                    <Delta value={row.returnPct} className="block text-[13px] font-semibold" />
                    <span className="block text-[11px] text-fg-muted tabular-nums">{formatINR(row.netWorth, 0)}</span>
                  </span>
                </li>
              ))}
          </ol>
          {event.leaderboard.frozen && <p className="border-t border-border px-4 py-2 text-xs text-warning">Frozen for participants and projector</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <MarketControl />
        <Card className="flex flex-col xl:col-span-5">
          <CardHeader
            title="Live activity"
            subtitle="Newest first"
            divider
            action={
              <Link href={`${base}/audit`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Audit
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="max-h-[27rem] min-h-0 flex-1 overflow-y-auto">
            <ActivityFeed state={state} now={now} limit={60} events={state.audit.filter((a) => a.type !== "NEWS_RANDOM_SCHEDULED")} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold text-fg-primary tabular-nums">{value}</dd>
    </div>
  );
}

/** Compact market table with the three routine price actions; advanced history lives on the Prices page. */
function MarketControl() {
  const { state, eventId } = useHostEvent();
  const [manual, setManual] = useState<{ instrument: Instrument; mode: "SET" | "PERCENT" } | null>(null);
  const [haltTarget, setHaltTarget] = useState<Instrument | null>(null);
  const rows = instrumentRows(state);

  return (
    <Card className="xl:col-span-7">
      <CardHeader
        title="Market"
        subtitle="Change since round open"
        icon={<TrendingUp className="size-3.5" />}
        divider
        action={
          <Link href={`${hostBase(eventId)}/prices`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Price history
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-raised text-[11px] tracking-wide text-fg-muted uppercase">
              <th className="h-8 px-4 text-left font-medium">Stock</th>
              <th className="px-3 text-right font-medium">Price</th>
              <th className="px-3 text-right font-medium">Change</th>
              <th className="px-3 text-left font-medium">Status</th>
              <th className="px-4 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.instrument.id} className="group border-b border-border last:border-b-0 hover:bg-surface-hover">
                <td className="px-4 py-1.5">
                  <span className="font-semibold text-fg-primary">{row.instrument.symbol}</span>
                  <span className="ml-2 hidden text-xs text-fg-muted lg:inline">{row.instrument.name}</span>
                </td>
                <td className="px-3 text-right font-medium text-fg-primary tabular-nums">₹{formatPrice(row.price)}</td>
                <td className="px-3 text-right">
                  <Delta value={row.roundChangePct} variant="pill" />
                </td>
                <td className="px-3">{row.instrument.halted ? <Badge tone="warning" dot>Halted</Badge> : !row.instrument.enabled ? <Badge tone="outline">Disabled</Badge> : <span className="text-xs text-fg-muted">Trading</span>}</td>
                <td className="px-4 text-right whitespace-nowrap">
                  <span className="inline-flex gap-0.5 opacity-80 group-hover:opacity-100">
                    <Tooltip content={`Move ${row.instrument.symbol} by a percentage`}>
                      <Button variant="ghost" size="xs" onClick={() => setManual({ instrument: row.instrument, mode: "PERCENT" })} aria-label={`Move ${row.instrument.symbol} by percent`}>
                        <Percent className="size-3" />
                        Move
                      </Button>
                    </Tooltip>
                    <Tooltip content={`Set ${row.instrument.symbol} to an exact price`}>
                      <Button variant="ghost" size="xs" onClick={() => setManual({ instrument: row.instrument, mode: "SET" })} aria-label={`Set ${row.instrument.symbol} price`}>
                        Set
                      </Button>
                    </Tooltip>
                    <Tooltip content={row.instrument.halted ? "Allow trading again" : "Block all trading in this stock"}>
                      <Button variant="ghost" size="xs" onClick={() => setHaltTarget(row.instrument)} className={row.instrument.halted ? "text-warning" : undefined} aria-label={`${row.instrument.halted ? "Resume" : "Halt"} ${row.instrument.symbol}`}>
                        {row.instrument.halted ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
                        {row.instrument.halted ? "Resume" : "Halt"}
                      </Button>
                    </Tooltip>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2 text-[11px] text-fg-muted">Manual moves need a reason and respect circuit limits, floors, ceilings and ₹0.05 ticks.</p>

      {manual && <ManualPriceDialog key={`${manual.instrument.id}-${manual.mode}`} state={state} instrument={manual.instrument} mode={manual.mode} onClose={() => setManual(null)} />}
      <ConfirmActionDialog
        open={haltTarget !== null}
        onOpenChange={(open) => !open && setHaltTarget(null)}
        tier="confirm"
        tone="warning"
        title={haltTarget?.halted ? `Resume trading in ${haltTarget?.symbol}?` : `Halt ${haltTarget?.symbol}?`}
        description={haltTarget?.halted ? "Teams can propose and settle trades in this stock again." : "No proposal in this stock can be sent or settled until you resume it."}
        confirmLabel={haltTarget?.halted ? `Resume ${haltTarget?.symbol}` : `Halt ${haltTarget?.symbol}`}
        onConfirm={() => (haltTarget!.halted ? hostAction(resumeInstrument(eventId, haltTarget!.id), `${haltTarget!.symbol} resumed`) : hostAction(haltInstrument(eventId, haltTarget!.id), `${haltTarget!.symbol} halted`))}
      />
    </Card>
  );
}
