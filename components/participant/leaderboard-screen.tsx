"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, Snowflake, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { effectiveParticipantVisibility, participantLeaderboardView, publishedLeaderboard, sharedRanks } from "@/lib/domain/leaderboard";
import { formatINR } from "@/lib/domain/money";
import type { LeaderboardRow } from "@/lib/domain/types";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTerminal } from "./terminal-context";

type Basis = "EVENT" | "ROUND";

function Move({ movement }: { movement: number }) {
  if (movement === 0) return <span className="text-fg-disabled">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-caption text-fg-secondary">
      {movement > 0 ? "▲" : "▼"} {Math.abs(movement)}
      <span className="sr-only">{movement > 0 ? "places up" : "places down"}</span>
    </span>
  );
}

/**
 * C4 Leaderboard (section 12). Ranking logic is untouched; teams with the same return and net worth share a rank
 * shown as "=7". Own team is highlighted and pinned, the podium names the top three, and the side card turns
 * standings into distances ("₹2,267 behind #3").
 */
export function LeaderboardScreen() {
  const { state, teamId } = useTerminal();
  const [basis, setBasis] = useState<Basis>("EVENT");
  const published = useMemo(() => publishedLeaderboard(state), [state]);
  const visibility = effectiveParticipantVisibility(state);
  const view = participantLeaderboardView(published.rows, visibility, state.event.leaderboard.participantTopN, teamId);
  const shared = useMemo(() => sharedRanks(published.rows), [published]);
  const own = view.ownRow;
  const label = (row: LeaderboardRow) => shared[row.teamId]?.label ?? `#${row.rank}`;

  const rows = view.mode === "FULL" || view.mode === "TOP_N" ? view.rows : [];
  const ordered = basis === "ROUND" ? [...rows].sort((a, b) => b.roundPnl - a.roundPnl) : rows;
  const podium = published.rows.slice(0, 3);
  const above = own ? published.rows.find((r) => r.rank === own.rank - 1) : undefined;
  const below = own ? published.rows.find((r) => r.rank === own.rank + 1) : undefined;
  const tiedWith = own && shared[teamId]?.tied ? published.rows.filter((r) => shared[r.teamId]?.rank === shared[teamId].rank).length - 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leaderboard" className="md:hidden" />

      {published.frozenAt && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-warning-soft px-4 py-2.5 text-meta text-fg-primary">
          <Snowflake className="size-4 text-warning" aria-hidden />
          Standings are frozen at {formatClock(published.frozenAt, true)}. Live standings return when the host unfreezes them.
        </p>
      )}

      {view.mode === "HIDDEN" ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-canvas-subtle text-fg-secondary">
            <EyeOff className="size-5" />
          </span>
          <p className="mt-3 text-h3 font-semibold text-fg-primary">The leaderboard is hidden right now</p>
          <p className="mt-1 max-w-sm text-meta text-fg-secondary">The host will reveal rankings later. Keep trading: your return still counts.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="mr-auto">
                <h2 className="text-h2 font-semibold text-fg-primary">{published.frozenAt ? "Frozen standings" : "Standings · live"}</h2>
                <p className="text-caption text-fg-muted">Ranked by return · net worth = cash + shares at the last price</p>
              </div>
              {rows.length > 0 && (
                <SegmentedControl
                  size="md"
                  label="Ranking basis"
                  value={basis}
                  onChange={setBasis}
                  options={[
                    { value: "EVENT", label: "Whole event" },
                    { value: "ROUND", label: "This round" },
                  ]}
                />
              )}
            </div>

            {view.mode !== "OWN_RANK" && podium.length === 3 && basis === "EVENT" && (
              <ol className="hidden gap-3 sm:grid sm:grid-cols-3" aria-label="Top three">
                {podium.map((row, i) => (
                  <li key={row.teamId} className={cn("rounded-lg border bg-surface px-4 py-3.5", row.teamId === teamId ? "border-accent" : "border-border")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("inline-flex h-6 items-center gap-1 rounded-xs px-2 text-caption font-semibold", i === 0 ? "bg-fg-primary text-fg-inverse" : "bg-canvas-subtle text-fg-secondary")}>
                        {i === 0 && <Trophy className="size-3.5" aria-hidden />}
                        {shared[row.teamId]?.tied ? label(row) : ["1st", "2nd", "3rd"][i]}
                      </span>
                      <Avatar name={row.teamName} size="sm" tone="accent" />
                    </div>
                    <p className="mt-3 truncate text-h3 font-semibold text-fg-primary">{row.teamName}</p>
                    <p className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[14px] font-medium text-fg-primary">{formatINR(row.netWorth, 0)}</span>
                      <Delta value={row.returnPct} showArrow className="font-mono text-caption" />
                    </p>
                  </li>
                ))}
              </ol>
            )}

            {rows.length > 0 && (
              <Card className="overflow-hidden" data-density="compact">
                <table className="w-full border-collapse">
                  <caption className="sr-only">{basis === "ROUND" ? "Teams by profit this round" : "Standings"}</caption>
                  <thead>
                    <tr className="h-9 bg-canvas-subtle text-caption text-fg-muted">
                      <th scope="col" className="w-16 px-4 text-left font-medium">Rank</th>
                      <th scope="col" className="hidden w-14 text-left font-medium sm:table-cell">Move</th>
                      <th scope="col" className="text-left font-medium">Team</th>
                      <th scope="col" className="hidden w-36 px-3 text-right font-medium sm:table-cell">Net worth</th>
                      <th scope="col" className="w-28 px-3 text-right font-medium">Return</th>
                      <th scope="col" className="hidden w-32 px-4 text-right font-medium sm:table-cell">Round P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((row) => {
                      const mine = row.teamId === teamId;
                      return (
                        <tr key={row.teamId} className={cn("h-11 border-t border-border-subtle max-sm:h-14", mine && "bg-surface-selected")} aria-current={mine ? "true" : undefined}>
                          <td className={cn("px-4 font-mono text-[14px]", row.rank === 1 ? "font-medium text-accent-text" : "text-fg-primary")}>{label(row)}</td>
                          <td className="hidden sm:table-cell">
                            <Move movement={row.movement} />
                          </td>
                          <td>
                            <span className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={row.teamName} size="sm" tone="accent" />
                              <span className="min-w-0">
                                <span className={cn("block truncate text-[14px]", mine ? "font-semibold text-fg-primary" : "text-fg-primary")}>{row.teamName}</span>
                                <span className="block font-mono text-caption text-fg-muted sm:hidden">{formatINR(row.netWorth, 0)}</span>
                              </span>
                              {mine && <Badge tone="accent">You</Badge>}
                            </span>
                          </td>
                          <td className="hidden px-3 text-right font-mono text-[14px] text-fg-primary sm:table-cell">{formatINR(row.netWorth, 0)}</td>
                          <td className="px-3 text-right">
                            <Delta value={row.returnPct} variant="pill" showArrow />
                          </td>
                          <td className="hidden px-4 text-right font-mono text-[14px] sm:table-cell">
                            <Delta value={row.roundPnl} format="inr" decimals={0} />
                          </td>
                        </tr>
                      );
                    })}
                    {view.mode === "TOP_N" && view.ownPinned && own && (
                      <tr className="h-11 border-t-2 border-border bg-surface-selected">
                        <td className="px-4 font-mono text-[14px] text-fg-primary">{label(own)}</td>
                        <td className="hidden sm:table-cell">
                          <Move movement={own.movement} />
                        </td>
                        <td>
                          <span className="flex items-center gap-2.5">
                            <Avatar name={own.teamName} size="sm" tone="accent" />
                            <span className="min-w-0">
                              <span className="block truncate text-[14px] font-semibold text-fg-primary">{own.teamName}</span>
                              <span className="block font-mono text-caption text-fg-muted sm:hidden">{formatINR(own.netWorth, 0)}</span>
                            </span>
                            <Badge tone="accent">You</Badge>
                          </span>
                        </td>
                        <td className="hidden px-3 text-right font-mono text-[14px] text-fg-primary sm:table-cell">{formatINR(own.netWorth, 0)}</td>
                        <td className="px-3 text-right">
                          <Delta value={own.returnPct} variant="pill" showArrow />
                        </td>
                        <td className="hidden px-4 text-right font-mono text-[14px] sm:table-cell">
                          <Delta value={own.roundPnl} format="inr" decimals={0} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {view.mode === "TOP_N" && <p className="border-t border-border px-4 py-2.5 text-caption text-fg-muted">The host is showing the top {view.topN} teams.</p>}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {own && (
              <Card className="p-5">
                <h2 className="text-h3 font-semibold text-fg-primary">Your rank</h2>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-value-l font-semibold text-fg-primary">{label(own)}</span>
                  <span className="text-meta text-fg-muted">
                    of {published.rows.length}
                    {own.movement !== 0 && ` · ${own.movement > 0 ? "▲" : "▼"} ${Math.abs(own.movement)} this round`}
                  </span>
                </p>
                {tiedWith > 0 && <p className="mt-1 text-caption text-fg-secondary">Level with {tiedWith} other {tiedWith === 1 ? "team" : "teams"} on return and net worth.</p>}
                {view.mode !== "OWN_RANK" && (
                  <dl className="mt-4 flex flex-col gap-3">
                    {above && above.netWorth > own.netWorth && (
                      <div>
                        <div className="flex items-center gap-2">
                          <ArrowUp className="size-4 text-fg-muted" aria-hidden />
                          <dt className="flex-1 text-[13px] text-fg-secondary">
                            Behind #{above.rank} {above.teamName}
                          </dt>
                          <dd className="font-mono text-[13px] font-medium text-fg-primary">{formatINR(above.netWorth - own.netWorth, 0)}</dd>
                        </div>
                        <p className="mt-0.5 pl-6 text-caption text-fg-muted">{gapLabel((above.netWorth - own.netWorth) / Math.max(1, own.netWorth))} of your net worth</p>
                      </div>
                    )}
                    {below && own.netWorth > below.netWorth && (
                      <div>
                        <div className="flex items-center gap-2">
                          <ArrowDown className="size-4 text-fg-muted" aria-hidden />
                          <dt className="flex-1 text-[13px] text-fg-secondary">
                            Ahead of #{below.rank} {below.teamName}
                          </dt>
                          <dd className="font-mono text-[13px] font-medium text-fg-primary">{formatINR(own.netWorth - below.netWorth, 0)}</dd>
                        </div>
                      </div>
                    )}
                  </dl>
                )}
                {view.mode === "OWN_RANK" && <p className="mt-3 text-caption text-fg-muted">The host is showing each team its own rank only.</p>}
              </Card>
            )}
            <Card className="p-5">
              <h2 className="text-h3 font-semibold text-fg-primary">How ranking works</h2>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-meta text-fg-secondary marker:text-fg-muted">
                <li>Return = (net worth − starting capital) ÷ starting capital. Unsold gains count.</li>
                <li>Net worth = cash + every share at its last price.</li>
                <li>Teams with the same return and net worth share a rank, shown as “=7”; the next team keeps its own place.</li>
                <li>“Move” compares with the ranking at the start of this round.</li>
                <li>Final results freeze when the host ends the event.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function gapLabel(ratio: number) {
  const pct = ratio * 100;
  return pct > 0 && pct < 0.1 ? "Under 0.1%" : `About ${pct.toFixed(1)}%`;
}
