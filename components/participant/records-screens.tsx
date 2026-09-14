"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { EyeOff, Newspaper, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { HelpText, StatePanel } from "@/components/ui/guidance";
import { InlineBanner, PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadStory } from "@/components/market/news-modules";
import { LeaderboardTable, LedgerTable, ProposalsTable, RankMovement, TradesTable } from "@/components/market/tables";
import { NewsReleaseItem } from "@/components/market/widgets";
import { effectiveParticipantVisibility, participantLeaderboardView, publishedLeaderboard } from "@/lib/domain/leaderboard";
import { formatINR, formatPct } from "@/lib/domain/money";
import { formatClock, formatMinutes } from "@/lib/format";
import { useNow } from "@/lib/mock/hooks";
import { ledgerForTeam, proposalsForTeam, releasesNewestFirst, tradesForTeam } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { markNewsRead, useTerminal } from "./terminal-context";

export function TransactionsScreen() {
  const { state, teamId } = useTerminal();
  const now = useNow();
  const proposals = proposalsForTeam(state, teamId).all;
  const trades = tradesForTeam(state, teamId);
  const ledger = useMemo(() => ledgerForTeam(state, teamId), [state, teamId]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Transactions" description="Every proposal, settled trade and balance change involving your team." />
      <Card>
        <Tabs defaultValue="trades">
          <TabsList>
            <TabsTrigger value="trades" count={trades.length}>
              Trades
            </TabsTrigger>
            <TabsTrigger value="proposals" count={proposals.length}>
              Proposals
            </TabsTrigger>
            <TabsTrigger value="ledger" count={ledger.length}>
              Ledger
            </TabsTrigger>
          </TabsList>
          <TabsContent value="trades">
            <TradesTable state={state} trades={trades} perspectiveTeamId={teamId} now={now} />
          </TabsContent>
          <TabsContent value="proposals">
            <ProposalsTable state={state} proposals={proposals} perspectiveTeamId={teamId} now={now} />
          </TabsContent>
          <TabsContent value="ledger">
            <HelpText className="border-b border-border px-4 py-2.5">Every change to your cash or shares is recorded here and never edited: starting allocation, trades and host adjustments.</HelpText>
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
  const [latest, ...earlier] = releases;

  useEffect(() => {
    markNewsRead(state.event.id, teamId);
  }, [state.event.id, teamId, count]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="News" description="Prices may react immediately when news is released." />
      {!latest ? (
        <Card>
          <StatePanel icon={<Newspaper className="size-5" />} title="No news yet" description="News released by the host will appear here, and as an alert on every screen." />
        </Card>
      ) : (
        <>
          <section aria-label="Latest story">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-fg-muted uppercase">Latest</p>
            <Card className="p-1.5">
              <LeadStory state={state} release={latest} now={now} size="lg" />
            </Card>
          </section>
          {earlier.length > 0 && (
            <Card>
              <CardHeader title="Earlier stories" subtitle={`${earlier.length} released before`} divider />
              <div className="divide-y divide-border">
                {earlier.map((release) => (
                  <NewsReleaseItem key={release.id} state={state} release={release} now={now} showImpactDetail />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function LeaderboardScreen() {
  const { state, teamId } = useTerminal();
  const published = publishedLeaderboard(state);
  const visibility = effectiveParticipantVisibility(state);
  const view = participantLeaderboardView(published.rows, visibility, state.event.leaderboard.participantTopN, teamId);
  const leader = published.rows[0];
  const own = view.ownRow;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leaderboard"
        description="Rankings are based on return %, not absolute portfolio size."
        meta={
          published.frozenAt ? (
            <Badge tone="warning" dot>
              Frozen at {formatClock(published.frozenAt)}
            </Badge>
          ) : undefined
        }
      />
      {published.frozenAt && (
        <InlineBanner tone="warning" icon={<Snowflake className="size-4" />} title="Standings are frozen.">
          You&apos;re seeing standings from {formatClock(published.frozenAt, true)}. Live standings return when the host unfreezes the leaderboard.
        </InlineBanner>
      )}

      {view.mode === "HIDDEN" ? (
        <Card>
          <StatePanel icon={<EyeOff className="size-5" />} title="The leaderboard is hidden right now" description="The host will reveal rankings later. Keep trading: your return still counts." />
        </Card>
      ) : (
        own && (
          <Card className="grid grid-cols-2 sm:grid-cols-4">
            <Standing label="Your rank" value={<>#{own.rank}<span className="ml-1 text-sm font-normal text-fg-muted">of {published.rows.length}</span></>} className="border-r border-b border-border sm:border-b-0" />
            <Standing label="Your return" value={<Delta value={own.returnPct} className="text-inherit" />} valueClassName={own.returnPct > 0 ? "text-positive" : own.returnPct < 0 ? "text-negative" : undefined} className="border-b border-border sm:border-r sm:border-b-0" />
            <Standing label="Movement this round" value={<RankMovement movement={own.movement} className="text-inherit" />} className="border-r border-border" />
            <Standing
              label={view.mode === "OWN_RANK" ? "Net worth" : leader && leader.teamId !== teamId ? `Behind ${leader.teamName}` : "Leading"}
              value={view.mode === "OWN_RANK" || !leader || leader.teamId === teamId ? formatINR(own.netWorth, 0) : `${(leader.returnPct - own.returnPct).toFixed(2)} pts`}
            />
          </Card>
        )
      )}

      {view.mode === "OWN_RANK" && <HelpText>The host is showing each team its own rank only.</HelpText>}

      {(view.mode === "FULL" || view.mode === "TOP_N") && (
        <Card>
          <CardHeader title={view.mode === "TOP_N" ? `Top ${view.topN}` : "All teams"} subtitle="Ties are broken by net worth, then team name" divider />
          <LeaderboardTable rows={view.rows} highlightTeamId={teamId} pinnedRow={view.ownPinned ? view.ownRow : null} />
        </Card>
      )}
    </div>
  );
}

function Standing({ label, value, valueClassName, className }: { label: string; value: ReactNode; valueClassName?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 px-4 py-3.5", className)}>
      <p className="truncate text-xs text-fg-secondary">{label}</p>
      <p className={cn("mt-1 truncate text-xl font-semibold text-fg-primary tabular-nums", valueClassName)}>{value}</p>
    </div>
  );
}

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
                <span className="font-medium text-fg-primary">Ties</span> are broken by net worth, then team name.
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
