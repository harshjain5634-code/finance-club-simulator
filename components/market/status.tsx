import { Badge, type BadgeTone } from "@/components/ui/badge";
import type {
  AdjustmentType,
  NewsPriority,
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

/** C4 participant-facing labels for market state. */
export const MARKET_STATE_DISPLAY: Record<MarketState, string> = {
  NOT_STARTED: "Pre-event",
  BRIEFING: "Briefing",
  OPEN: "Trading open",
  PAUSED: "Paused",
  FROZEN: "Trading frozen",
  BETWEEN_ROUNDS: "Between rounds",
  COMPLETED: "Event completed",
};

const marketTone: Record<MarketState, string> = {
  NOT_STARTED: "border border-border bg-surface-hover text-fg-secondary",
  BRIEFING: "bg-accent-soft text-accent-text",
  OPEN: "bg-accent text-accent-fg",
  PAUSED: "bg-warning-soft text-warning",
  FROZEN: "bg-warning text-warning-fg",
  BETWEEN_ROUNDS: "border border-border bg-surface-hover text-fg-secondary",
  COMPLETED: "border border-border bg-surface-hover text-fg-secondary",
};

/** C4 Status Badge for the market: solid accent = open, solid amber = frozen. Dot + text, never colour alone. */
export function MarketStateBadge({ state, className, size = "sm" }: { state: MarketState; className?: string; size?: "sm" | "md" }) {
  const live = state === "OPEN";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm font-medium whitespace-nowrap",
        size === "md" ? "h-7 px-2.5 text-[13px]" : "h-[22px] px-2 text-caption",
        marketTone[state],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-current", live && "animate-pulse-dot")} />
      {MARKET_STATE_DISPLAY[state]}
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
  SETTLED: "neutral",
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

const newsTone: Record<NewsStatus, BadgeTone> = { DRAFT: "outline", READY: "info", RELEASED: "neutral", SKIPPED: "outline" };
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
    <Badge tone="neutral" className="w-11 justify-center">
      {buy ? "Buy" : "Sell"}
    </Badge>
  );
}

/**
 * Participant-facing news importance. Internal priorities stay LOW / NORMAL / HIGH.
 * LOW → Update (quiet) · NORMAL → Important (toast) · HIGH → Breaking (interrupts).
 */
export const NEWS_PRIORITY_LABEL: Record<NewsPriority, string> = { LOW: "Update", NORMAL: "Important", HIGH: "Breaking" };
const newsPriorityTone: Record<NewsPriority, BadgeTone> = { LOW: "neutral", NORMAL: "info", HIGH: "warning" };
export function NewsPriorityBadge({ priority, className }: { priority: NewsPriority; className?: string }) {
  return (
    <Badge tone={newsPriorityTone[priority]} className={className}>
      {NEWS_PRIORITY_LABEL[priority]}
    </Badge>
  );
}
