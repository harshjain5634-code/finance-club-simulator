"use client";

import {
  ArrowLeftRight,
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  Coins,
  Flag,
  Lock,
  Newspaper,
  Settings2,
  Snowflake,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AuditEvent, AuditType, EventState } from "@/lib/domain/types";
import { formatClock, formatRelative } from "@/lib/format";
import { describeActor } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<AuditType, { icon: LucideIcon; tone?: "accent" | "warning" }>> = {
  EVENT_STARTED: { icon: CirclePlay, tone: "accent" },
  EVENT_PAUSED: { icon: CirclePause, tone: "warning" },
  EVENT_RESUMED: { icon: CirclePlay, tone: "accent" },
  EVENT_ENDED: { icon: Flag },
  ROUND_STARTED: { icon: CirclePlay, tone: "accent" },
  ROUND_PAUSED: { icon: CirclePause, tone: "warning" },
  ROUND_RESUMED: { icon: CirclePlay },
  ROUND_ENDED: { icon: Flag },
  TRADING_FROZEN: { icon: Snowflake, tone: "warning" },
  TRADING_UNFROZEN: { icon: Snowflake },
  TRADE_PROPOSED: { icon: ArrowLeftRight },
  TRADE_ACCEPTED: { icon: ArrowLeftRight },
  TRADE_SETTLED: { icon: CircleCheck, tone: "accent" },
  TRADE_FAILED: { icon: CircleX, tone: "warning" },
  TRADE_REJECTED: { icon: CircleX },
  TRADE_REJECTED_BY_HOST: { icon: CircleX, tone: "warning" },
  TRADE_APPROVAL_REQUESTED: { icon: Lock, tone: "warning" },
  NEWS_RELEASED: { icon: Newspaper, tone: "accent" },
  PRICE_CHANGED: { icon: TrendingUp },
  CASH_ADJUSTED: { icon: Coins, tone: "warning" },
  HOLDING_ADJUSTED: { icon: Coins, tone: "warning" },
  TEAM_RESET: { icon: Users, tone: "warning" },
  TEAM_CREATED: { icon: Users },
  INSTRUMENT_HALTED: { icon: Lock, tone: "warning" },
};

export function ActivityFeed({ state, events, now, limit = 30, className }: { state: EventState; events?: AuditEvent[]; now: number; limit?: number; className?: string }) {
  const rows = (events ?? state.audit).slice(-limit).reverse();
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-[13px] text-fg-muted">No activity yet.</p>;
  return (
    <ol className={cn("divide-y divide-border", className)}>
      {rows.map((event) => {
        const meta = ICONS[event.type] ?? { icon: Settings2 };
        const Icon = meta.icon;
        return (
          <li key={event.id} className="flex gap-3 px-4 py-2.5">
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border",
                meta.tone === "accent" ? "border-accent/30 bg-accent/10 text-accent-text" : meta.tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-surface-raised text-fg-muted",
              )}
            >
              <Icon className="size-3" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-fg-primary">{event.summary}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-fg-muted">
                <span>{describeActor(state, event.actor)}</span>
                <span className="tabular-nums" title={formatClock(event.at, true)}>
                  {formatRelative(event.at, now)}
                </span>
                {event.reason && <span className="truncate">“{event.reason}”</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
