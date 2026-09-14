"use client";

import { useEffect, useMemo } from "react";
import { EyeOff, Medal, Newspaper, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { EmptyState, InlineBanner, PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaderboardTable, LedgerTable, ProposalsTable, RankMovement, TradesTable } from "@/components/market/tables";
import { NewsReleaseItem } from "@/components/market/widgets";
import { effectiveParticipantVisibility, participantLeaderboardView, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { formatINR, formatPct } from "@/lib/domain/money";
import { formatClock, formatMinutes } from "@/lib/format";
import { useNow } from "@/lib/mock/hooks";
import { ledgerForTeam, proposalsForTeam, releasesNewestFirst, tradesForTeam } from "@/lib/mock/selectors";
import { markNewsRead, useTerminal } from "./terminal-context";

export function TransactionsScreen() {
  const { state, teamId } = useTerminal();
  const now = useNow();
  const proposals = proposalsForTeam(state, teamId).all;
  const trades = tradesForTeam(state, teamId);
  const ledger = useMemo(() => ledgerForTeam(state, teamId), [state, teamId]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Transactions" description="Every proposal, settled trade and ledger movement involving your team." />
      <Card>
        <Tabs defaultValue="proposals">
          <TabsList>
            <TabsTrigger value="proposals" count={proposals.length}>Proposals</TabsTrigger>
            <TabsTrigger value="trades" count={trades.length}>Trades</TabsTrigger>
            <TabsTrigger value="ledger" count={ledger.length}>Ledger</TabsTrigger>
          </TabsList>
          <TabsContent value="proposals">
            <ProposalsTable state={state} proposals={proposals} perspectiveTeamId={teamId} now={now} />
          </TabsContent>
          <TabsContent value="trades">
            <TradesTable state={state} trades={trades} perspectiveTeamId={teamId} now={now} />
          </TabsContent>
          <TabsContent value="ledger">
            <p className="border-b border-border px-4 py-2.5 text-xs text-fg-muted">
              The ledger is append-only: allocations, trades, host adjustments and resets each add a balanced journal; nothing is edited.
            </p>
            <LedgerTable state={state} rows={ledger} now={now} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

export function NewsScreen() {
  const { state, teamId } = useTerminal();
  const now = useNow();
  const releases = releasesNewestFirst(state);
  const count = releases.length;

  useEffect(() => {
    markNewsRead(state.event.id, teamId);
  }, [state.event.id, teamId, count]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="News" description="Released headlines and the price moves they caused. Upcoming news is never shown before release." />
      <Card>
        <CardHeader title="Event news feed" subtitle={`${count} released`} icon={<Newspaper className="size-3.5" />} divider />
        {count === 0 ? (
          <EmptyState icon={<Newspaper className="size-4" />} title="No news released yet" description="When the host releases a story it appears here and as a breaking alert." />
        ) : (
          <div className="divide-y divide-border">
            {releases.map((release) => (
              <NewsReleaseItem key={release.id} state={state} release={release} now={now} showImpactDetail />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function LeaderboardScreen() {
  const { state, teamId } = useTerminal();
  const published = publishedLeaderboard(state);
  const visibility = effectiveParticipantVisibility(state);
  const view = participantLeaderboardView(published.rows, visibility, state.event.leaderboard.participantTopN, teamId);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Leaderboard"
        description="Ranked by percentage return: (net worth − capital base) ÷ capital base. Ties: higher net worth, then team name."
        meta={
          <>
            <Badge tone="outline">{visibility === "TOP_N" ? `Top ${state.event.leaderboard.participantTopN}` : visibility === "OWN_RANK" ? "Own rank only" : visibility === "HIDDEN" ? "Hidden" : "Full leaderboard"}</Badge>
            {published.frozenAt && (
              <Badge tone="warning" dot>
                Frozen at {formatClock(published.frozenAt)}
              </Badge>
            )}
          </>
        }
      />
      {published.frozenAt && (
        <InlineBanner tone="warning" icon={<Snowflake className="size-4" />} title="Leaderboard frozen.">
          Standings are shown as of {formatClock(published.frozenAt, true)}; live changes will appear when the host unfreezes it.
        </InlineBanner>
      )}
      {view.mode === "HIDDEN" && (
        <Card>
          <EmptyState icon={<EyeOff className="size-4" />} title="Leaderboard hidden by the host" description="Keep trading: rankings will be revealed later in the event." />
        </Card>
      )}
      {view.mode === "OWN_RANK" && (
        <Card className="px-5 py-6">
          {view.ownRow ? (
            <div className="flex flex-wrap items-center gap-6">
              <span className="grid size-14 place-items-center rounded-lg border border-border bg-surface-raised text-accent">
                <Medal className="size-6" />
              </span>
              <div>
                <p className="text-xs text-fg-muted">Your rank</p>
                <p className="text-3xl font-semibold text-fg-primary tabular-nums">
                  #{view.ownRow.rank} <span className="text-base font-normal text-fg-muted">of {published.rows.length}</span>
                </p>
              </div>
              <div className="text-[13px]">
                <p className="text-fg-muted">Return</p>
                <p className="font-medium"><Delta value={view.ownRow.returnPct} /></p>
              </div>
              <div className="text-[13px]">
                <p className="text-fg-muted">Net worth</p>
                <p className="font-medium text-fg-primary tabular-nums">{formatINR(view.ownRow.netWorth)}</p>
              </div>
              <div className="text-[13px]">
                <p className="text-fg-muted">Movement this round</p>
                <RankMovement movement={view.ownRow.movement} className="font-medium" />
              </div>
              <p className="w-full text-xs text-fg-muted">The host is showing each team its own rank only.</p>
            </div>
          ) : (
            <p className="text-[13px] text-fg-muted">Not ranked yet.</p>
          )}
        </Card>
      )}
      {(view.mode === "FULL" || view.mode === "TOP_N") && (
        <Card>
          <CardHeader
            title={view.mode === "TOP_N" ? `Top ${view.topN}` : "All teams"}
            subtitle={view.ownRow ? `You are #${view.ownRow.rank} · ${formatPct(view.ownRow.returnPct)}` : undefined}
            divider
          />
          <LeaderboardTable rows={view.rows} highlightTeamId={teamId} pinnedRow={view.ownPinned ? view.ownRow : null} />
        </Card>
      )}
    </div>
  );
}

export function RulesScreen() {
  const { state } = useTerminal();
  const { rules } = state.event;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Rules" description={`${state.event.name} · ${state.event.code}`} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Event structure" divider />
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
          <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">Cash, holdings and prices carry over from one round to the next.</p>
        </Card>
        <Card>
          <CardHeader title="Trading rules" divider />
          <ul className="space-y-2.5 px-4 py-3.5 text-[13px] text-fg-secondary">
            <Rule title="Peer-to-peer trading">Agree trades with other teams; the counterparty must accept before anything settles.</Rule>
            <Rule title="Whole shares only">Quantities are whole numbers of shares.</Rule>
            <Rule title="No short selling">You can only sell shares you already hold.</Rule>
            <Rule title="No negative cash">A buyer must have enough cash when the trade settles.</Rule>
            <Rule title={`±${rules.priceBandPct}% price band`}>Trade prices must be within {rules.priceBandPct}% of the stock&apos;s reference price at proposal and at settlement.</Rule>
            <Rule title="Proposal expiry">Proposals expire after {formatMinutes(rules.proposalExpirySeconds)}; each team can have {rules.maxOpenOutgoingProposals} open proposals.</Rule>
            <Rule title="Host approval">{rules.approvalEnabled && rules.approvalThreshold ? `Trades worth ${formatINR(rules.approvalThreshold)} or more need host approval before settling.` : "Not required in this event."}</Rule>
            <Rule title="Reference prices">P2P trade prices never move the reference price; prices change through host news and host actions.</Rule>
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Scoring" divider />
          <div className="px-4 py-4">
            <p className="rounded-md border border-border bg-surface-raised px-4 py-3 text-center font-mono text-[13px] text-fg-primary">Return % = (Net worth − Capital base) ÷ Capital base × 100</p>
            <ul className="mt-3 grid gap-2 text-[13px] text-fg-secondary md:grid-cols-3">
              <li><span className="font-medium text-fg-primary">Net worth</span> = cash + shares × current reference price.</li>
              <li><span className="font-medium text-fg-primary">Capital base</span> = starting cash + allocated shares at starting prices, adjusted only by host capital changes.</li>
              <li><span className="font-medium text-fg-primary">Ties</span> are broken by higher net worth, then team name.</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="font-medium text-fg-primary">{title}.</span> {children}
    </li>
  );
}
