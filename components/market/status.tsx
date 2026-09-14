import { Badge, type BadgeTone } from "@/components/ui/badge";
import { MARKET_STATE_LABEL } from "@/lib/domain/trading-gate";
import type {
  AdjustmentType,
  EventStatus,
  JournalType,
  MarketState,
  NewsStatus,
  PriceEventSource,
  ProposalStatus,
  RoundStatus,
  TeamStatus,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const marketTone: Record<MarketState, BadgeTone> = {
  NOT_STARTED: "neutral",
  BRIEFING: "accent",
  OPEN: "accent",
  PAUSED: "warning",
  FROZEN: "warning",
  BETWEEN_ROUNDS: "neutral",
  COMPLETED: "neutral",
};

export function MarketStateBadge({ state, className, size = "sm" }: { state: MarketState; className?: string; size?: "sm" | "md" }) {
  const live = state === "OPEN";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border font-medium whitespace-nowrap",
        size === "md" ? "h-8 px-2.5 text-xs" : "h-6 px-2 text-[11px]",
        marketTone[state] === "warning" ? "border-warning/40 bg-warning/10 text-warning" : marketTone[state] === "accent" ? "border-accent/30 bg-accent/10 text-fg-primary" : "border-border bg-surface text-fg-secondary",
        className,
      )}
    >
      <span className="relative flex size-2">
        {live && <span className="absolute inset-0 animate-pulse-dot rounded-full bg-accent/60" />}
        <span className={cn("relative size-2 rounded-full", live ? "bg-accent" : marketTone[state] === "warning" ? "bg-warning" : state === "BRIEFING" ? "bg-accent/70" : "bg-fg-muted")} />
      </span>
      {MARKET_STATE_LABEL[state]}
    </span>
  );
}

const eventTone: Record<EventStatus, BadgeTone> = { DRAFT: "outline", READY: "accent", LIVE: "accent", PAUSED: "warning", COMPLETED: "neutral" };
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge tone={eventTone[status]} dot={status === "LIVE" || status === "PAUSED"} className={status === "LIVE" ? "[&>span:first-child]:animate-pulse-dot" : undefined}>
      {status === "LIVE" ? "Live" : status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

const roundTone: Record<RoundStatus, BadgeTone> = { PENDING: "outline", RUNNING: "accent", PAUSED: "warning", ENDED: "neutral" };
const roundLabel: Record<RoundStatus, string> = { PENDING: "Upcoming", RUNNING: "Running", PAUSED: "Paused", ENDED: "Ended" };
export function RoundStatusBadge({ status }: { status: RoundStatus }) {
  return <Badge tone={roundTone[status]}>{roundLabel[status]}</Badge>;
}

const proposalTone: Record<ProposalStatus, BadgeTone> = {
  PROPOSED: "accent",
  ACCEPTED: "accent",
  PENDING_APPROVAL: "warning",
  SETTLED: "solid",
  REJECTED: "outline",
  REJECTED_BY_HOST: "warning",
  CANCELLED: "outline",
  EXPIRED: "outline",
  FAILED: "warning",
};
const proposalLabel: Record<ProposalStatus, string> = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  PENDING_APPROVAL: "Pending approval",
  SETTLED: "Settled",
  REJECTED: "Rejected",
  REJECTED_BY_HOST: "Rejected by host",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
};
export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return <Badge tone={proposalTone[status]}>{proposalLabel[status]}</Badge>;
}

const newsTone: Record<NewsStatus, BadgeTone> = { DRAFT: "outline", READY: "accent", RELEASED: "solid", SKIPPED: "neutral" };
export function NewsStatusBadge({ status }: { status: NewsStatus }) {
  return <Badge tone={newsTone[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function TeamStatusBadge({ status }: { status: TeamStatus }) {
  return <Badge tone={status === "ACTIVE" ? "neutral" : "warning"}>{status === "ACTIVE" ? "Active" : "Disabled"}</Badge>;
}

export function InstrumentStateBadge({ halted, enabled }: { halted: boolean; enabled: boolean }) {
  if (!enabled) return <Badge tone="outline">Disabled</Badge>;
  if (halted) return <Badge tone="warning" dot>Halted</Badge>;
  return <Badge tone="neutral">Trading</Badge>;
}

const adjustmentTone: Record<AdjustmentType, BadgeTone> = { CAPITAL_CHANGE: "accent", AWARD: "positive", PENALTY: "negative", CORRECTION: "outline" };
const adjustmentLabel: Record<AdjustmentType, string> = { CAPITAL_CHANGE: "Capital change", AWARD: "Award", PENALTY: "Penalty", CORRECTION: "Correction" };
export function AdjustmentTypeBadge({ type }: { type: AdjustmentType }) {
  return <Badge tone={adjustmentTone[type]}>{adjustmentLabel[type]}</Badge>;
}

const journalTone: Record<JournalType, BadgeTone> = { ALLOCATION: "accent", TRADE: "neutral", ADJUSTMENT: "warning", RESET: "warning", REVERSAL: "outline" };
export function JournalTypeBadge({ type }: { type: JournalType }) {
  return <Badge tone={journalTone[type]}>{type.charAt(0) + type.slice(1).toLowerCase()}</Badge>;
}

const sourceLabel: Record<PriceEventSource, string> = {
  OPENING: "Opening",
  NEWS: "News",
  MANUAL: "Manual",
  GRADUAL_STEP: "Gradual",
  BACKGROUND: "Background",
  TRADE_IMPACT: "Trade impact",
};
export function PriceSourceBadge({ source }: { source: PriceEventSource }) {
  return <Badge tone={source === "NEWS" ? "accent" : source === "MANUAL" ? "warning" : "neutral"}>{sourceLabel[source]}</Badge>;
}

export function SideBadge({ buy }: { buy: boolean }) {
  return (
    <Badge tone={buy ? "accent" : "outline"} className="w-10 justify-center">
      {buy ? "Buy" : "Sell"}
    </Badge>
  );
}
