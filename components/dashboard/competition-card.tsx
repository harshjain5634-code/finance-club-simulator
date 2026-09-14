import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { calendarDaysBetween, formatCurrency, formatDate } from "@/lib/format";
import type { Competition } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompetitionCard({ competition, asOf }: { competition: Competition; asOf: number }) {
  const totalDays = calendarDaysBetween(competition.startsAt, competition.endsAt);
  const daysRemaining = Math.max(0, calendarDaysBetween(asOf, competition.endsAt));
  const elapsedPct = Math.min(100, Math.max(0, ((asOf - competition.startsAt) / (competition.endsAt - competition.startsAt)) * 100));
  const gapToLeader = competition.leaderValue - competition.portfolioValue;
  const topPct = Math.max(1, Math.ceil((competition.rank / competition.participants) * 100));

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Competition"
        subtitle={`Ends ${formatDate(competition.endsAt, { day: "numeric", month: "short", year: "numeric" })}`}
        action={
          <Badge tone="accent">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden />
            Live
          </Badge>
        }
        divider
      />

      <div className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
        <p className="text-[13px] leading-snug font-medium text-fg">{competition.name}</p>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-fg-subtle">Your rank</p>
            <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-2xl leading-7 font-semibold tracking-tight text-fg">#{competition.rank}</span>
              <span className="text-xs text-fg-subtle">of {competition.participants}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <Badge tone="neutral">Top {topPct}%</Badge>
            {competition.rankChange !== 0 && (
              <span className={cn("tabular-nums", competition.rankChange > 0 ? "text-positive" : "text-negative")}>
                {competition.rankChange > 0 ? "▲" : "▼"} {Math.abs(competition.rankChange)} since yesterday
              </span>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
          <div className="px-3 py-2">
            <dt className="text-[11px] text-fg-subtle">Your portfolio</dt>
            <dd className="mt-0.5 text-[13px] font-semibold text-fg tabular-nums">
              {formatCurrency(competition.portfolioValue, 0)}
            </dd>
          </div>
          <div className="border-l border-line px-3 py-2">
            <dt className="text-[11px] text-fg-subtle">Leader</dt>
            <dd className="mt-0.5 text-[13px] font-semibold text-fg tabular-nums">
              {formatCurrency(competition.leaderValue, 0)}
            </dd>
          </div>
          <div className="col-span-2 border-t border-line bg-surface-raised/50 px-3 py-1.5 text-[11px] text-fg-subtle">
            <span className="text-fg-muted tabular-nums">{formatCurrency(gapToLeader, 0)}</span> behind the leader
          </div>
        </dl>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-subtle">
              Day {totalDays - daysRemaining} of {totalDays}
            </span>
            <span className="font-medium text-fg tabular-nums">{daysRemaining} days remaining</span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-hover"
            role="progressbar"
            aria-label="Competition progress"
            aria-valuenow={Math.round(elapsedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${elapsedPct}%` }} />
          </div>
        </div>

        <Link href="/leaderboard" className={buttonClasses({ variant: "secondary", className: "mt-auto w-full" })}>
          View leaderboard
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
