"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import {
  ArrowLeftRight,
  Check,
  CircleAlert,
  Circle,
  CircleCheck,
  Clock,
  Flag,
  Lock,
  LockOpen,
  MoreHorizontal,
  Newspaper,
  Percent,
  Send,
  Shuffle,
  Snowflake,
  TrendingUp,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonKbd } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Delta } from "@/components/ui/delta";
import { NewsPriorityBadge } from "@/components/market/status";
import { useRoundClock } from "@/components/market/round-clock";
import { computeLeaderboard, sharedRanks } from "@/lib/domain/leaderboard";
import { readiness } from "@/lib/domain/lifecycle";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { highValueThreshold, monitorProposal } from "@/lib/domain/monitoring";
import { currentRound } from "@/lib/domain/trading-gate";
import type { AuditEvent, EventState, Instrument, NewsItem, TradeProposal } from "@/lib/domain/types";
import { formatClock, formatDuration, formatQuantity } from "@/lib/format";
import { approveProposal, haltInstrument, rejectProposalByHost, resumeInstrument, skipNews } from "@/lib/mock/commands";
import { instrumentOf, instrumentRows, teamNameOf, tradingVolume } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, hostBase, useHostEvent } from "./host-context";
import { useHostCommands } from "./host-commands";
import { ManualPriceDialog } from "./market-screens";
import { manualQueue, StoryImpacts } from "./news-control";

/**
 * C4 Host Control Room (section 13, frame 97:5623). Round, trading and news primaries live in the Live Control
 * Strip above; the workspace groups what needs a decision now: the news queue, approvals and exceptions, the
 * trade tape, and a glanceable market and standings column.
 */
export function ControlRoomScreen() {
  const { state } = useHostEvent();
  const setup = state.event.status === "DRAFT" || state.event.status === "READY";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Control room</h1>
      {setup && <SetupChecklist state={state} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:h-[calc(100dvh-112px-32px-32px)] xl:min-h-[640px] xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)_minmax(300px,340px)]">
        <NewsQueueCard state={state} />
        <div className="flex min-h-0 flex-col gap-4">
          <NeedsYouCard state={state} />
          <TradeActivityCard state={state} />
        </div>
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-2 xl:col-span-1">
          <MarketCard state={state} />
          <StandingsCard state={state} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared card chrome */

function Panel({ icon: Icon, title, meta, action, className, children, tone }: { icon: LucideIcon; title: string; meta?: ReactNode; action?: ReactNode; className?: string; children: ReactNode; tone?: "warning" }) {
  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", tone === "warning" && "border-warning", className)}>
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <Icon className="size-4 shrink-0 text-fg-secondary" aria-hidden />
        <h2 className="text-h3 font-semibold text-fg-primary">{title}</h2>
        {meta && <span className="min-w-0 truncate text-caption text-fg-muted">{meta}</span>}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </header>
      {children}
    </Card>
  );
}

function GoLink({ href, label, keys }: { href: string; label: string; keys?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text hover:underline">
      {label}
      {keys && <span className="font-mono text-caption text-accent-text/80">{keys}</span>}
    </Link>
  );
}

/* ------------------------------------------------------------------ setup */

function SetupChecklist({ state }: { state: EventState }) {
  const items = readiness(state);
  return (
    <Card>
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-h3 font-semibold text-fg-primary">Before you go live</h2>
        <p className="text-caption text-fg-muted">{state.event.status === "READY" ? "Setup is complete. Start the event from the strip above." : "Finish these steps, then start the event from the strip above."}</p>
      </header>
      <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 bg-surface px-4 py-2.5">
            <span className={cn("grid size-5 place-items-center rounded-full", item.done ? "bg-positive-soft text-positive" : "border border-border-strong text-fg-muted")}>
              {item.done ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-1.5" />}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg-primary">{item.label}</p>
              <p className="truncate text-caption text-fg-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ news queue */

function NewsQueueCard({ state }: { state: EventState }) {
  const { eventId } = useHostEvent();
  const { run, available } = useHostCommands();
  const [skip, setSkip] = useState<NewsItem | null>(null);
  const base = hostBase(eventId);
  const round = currentRound(state);
  const queue = manualQueue(state);
  const next = queue[0] ?? null;
  const waiting = [...queue.slice(1), ...state.news.filter((n) => n.status === "DRAFT").sort((a, b) => a.number - b.number)];
  const released = [...state.newsReleases].sort((a, b) => b.releasedAt - a.releasedAt);
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";
  const roundLabel = (item: NewsItem) => {
    const r = state.rounds.find((x) => x.id === item.roundId);
    return r ? (r.type === "BRIEFING" ? "Briefing" : `Round ${r.number}`) : "Any round";
  };

  return (
    <Panel
      icon={Newspaper}
      title="News queue"
      meta={`${released.length} released · ${queue.length} ready · ${waiting.length - Math.max(0, queue.length - 1)} draft`}
      action={<GoLink href={`${base}/news`} label="Desk" keys="G N" />}
      className="xl:h-full"
    >
      {next ? (
        <div className="shrink-0 border-b border-border bg-accent-soft/40 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-accent-text">Next up</span>
            <NewsPriorityBadge priority={next.priority} />
            <span className="ml-auto font-mono text-caption text-fg-muted">
              #{next.number} · {roundLabel(next)}
            </span>
          </div>
          <p className="mt-2 text-[15px] leading-6 font-medium text-fg-primary">{next.headline}</p>
          <p className="mt-1 flex items-center gap-1.5 text-caption text-fg-muted">
            <Lock className="size-3" aria-hidden />
            Host only ·
            <StoryImpacts state={state} item={next} />
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" className="flex-1" shortcut="N" onClick={() => run("releaseNext")} disabled={!available("releaseNext")}>
              <Zap className="size-4" />
              {live ? "Release now…" : "Release when live"}
            </Button>
            <Button variant="secondary" onClick={() => setSkip(next)}>
              Skip
            </Button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-b border-border px-4 py-5 text-center">
          <p className="text-[14px] font-medium text-fg-primary">No story is ready</p>
          <p className="mt-1 text-caption text-fg-muted">Mark drafts as Ready on the News desk to queue them.</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul>
          {waiting.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
              <span className="w-7 shrink-0 font-mono text-caption text-fg-muted">#{item.number}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[14px] leading-5 text-fg-primary">{item.headline}</span>
                <span className="block truncate text-caption text-fg-muted">
                  {item.impacts.map((i) => instrumentOf(state, i.instrumentId)?.symbol).join(", ") || "No price impact"} · {item.priority === "HIGH" ? "breaking" : item.priority === "NORMAL" ? "important" : "update"} · {roundLabel(item)}
                </span>
              </span>
              <Badge tone={item.status === "READY" ? "outline" : "neutral"}>{item.status === "READY" ? "Ready" : "Draft"}</Badge>
            </li>
          ))}
        </ul>
        {released.length > 0 && (
          <>
            <p className="eyebrow px-4 pt-4 pb-1.5 text-fg-muted">Released</p>
            <ul>
              {released.map((release) => {
                const item = state.news.find((n) => n.id === release.newsItemId);
                return (
                  <li key={release.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-0">
                    <span className="w-7 shrink-0 font-mono text-caption text-fg-muted">#{item?.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] leading-5 text-fg-secondary">{release.headline}</span>
                      <span className="block truncate text-caption text-fg-muted">
                        <span className="font-mono">{formatClock(release.releasedAt)}</span>
                        {release.impacts.map((impact) => (
                          <span key={impact.instrumentId}>
                            {" · "}
                            {instrumentOf(state, impact.instrumentId)?.symbol}{" "}
                            <span className={cn("font-mono", impact.appliedPct > 0 ? "text-positive" : impact.appliedPct < 0 ? "text-negative" : undefined)}>
                              {impact.appliedPct > 0 ? "▲" : impact.appliedPct < 0 ? "▼" : ""} {formatPct(Math.abs(impact.appliedPct), { signed: false })}
                            </span>
                          </span>
                        ))}
                        {release.source === "RANDOM" && " · random"}
                      </span>
                    </span>
                    <Badge tone="neutral">Released</Badge>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <RandomNewsFooter state={state} base={base} roundRunning={!!round} />

      <ConfirmActionDialog
        open={skip !== null}
        onOpenChange={(open) => !open && setSkip(null)}
        tier="confirm"
        tone="warning"
        title={`Skip news #${skip?.number}?`}
        description="The story is marked Skipped and leaves the queue. Nothing is released and no price moves. You can find it on the News desk."
        confirmLabel="Skip story"
        onConfirm={() => hostAction(skipNews(eventId, skip!.id), `News #${skip!.number} skipped`)}
      />
    </Panel>
  );
}

function RandomNewsFooter({ state, base, roundRunning }: { state: EventState; base: string; roundRunning: boolean }) {
  const { now } = useRoundClock(state);
  const random = state.randomNews;
  let text: string;
  if (random.mode === "MANUAL" || random.status === "STOPPED") text = "Random news is off. Stories go out only when you release them.";
  else if (random.status === "PAUSED") text = "Random news is paused. Nothing goes out until you resume it.";
  else if (random.nextReleaseAt) text = `Random news is on · next story in ${formatDuration(Math.max(0, random.nextReleaseAt - now))} (at ${formatClock(random.nextReleaseAt, true)})`;
  else text = roundRunning ? "Random news is on · picking the next story" : "Random news is on · waits for a running round";
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border bg-canvas-subtle px-4 py-3">
      <Shuffle className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <p className="min-w-0 flex-1 text-caption text-fg-secondary">{text}</p>
      <GoLink href={`${base}/news`} label={random.mode === "MANUAL" ? "Set up" : "Manage"} />
    </div>
  );
}

/* ------------------------------------------------------------------ needs you */

function NeedsYouCard({ state }: { state: EventState }) {
  const { eventId } = useHostEvent();
  const { now } = useRoundClock(state);
  const [reject, setReject] = useState<TradeProposal | null>(null);
  const base = hostBase(eventId);
  const approvals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL").sort((a, b) => waitingSince(a) - waitingSince(b));
  const halted = state.instruments.filter((i) => i.halted);
  const failed = state.proposals.filter((p) => p.status === "FAILED" && now - (p.history.at(-1)?.at ?? 0) < 5 * 60_000);
  const count = approvals.length + halted.length + failed.length;
  const top = approvals[0];

  const approve = (p: TradeProposal) => hostAction(approveProposal(eventId, p.id, `approve-${p.id}`), (t) => `${t.id} settled`, "Both teams see the decision now.");

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      if (e.key === "a") {
        e.preventDefault();
        void approve(top);
      } else if (e.key === "r") {
        e.preventDefault();
        setReject(top);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.id]);

  return (
    <Panel
      icon={CircleAlert}
      title="Needs you"
      meta={count === 0 ? "all clear" : `${approvals.length ? `${approvals.length} approval${approvals.length === 1 ? "" : "s"}` : ""}${approvals.length && halted.length + failed.length ? " · " : ""}${halted.length + failed.length ? `${halted.length + failed.length} exception${halted.length + failed.length === 1 ? "" : "s"}` : ""}`}
      action={<GoLink href={`${base}/trades`} label="Trades" keys="G T" />}
      tone={approvals.length ? "warning" : undefined}
      className="max-h-[50%] shrink-0"
    >
      {count === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <CircleCheck className="size-5 shrink-0 text-positive" aria-hidden />
          <p className="text-meta text-fg-secondary">
            Nothing needs you right now.{" "}
            {state.event.rules.approvalEnabled ? "Trades that need approval appear here first." : "Trades settle as soon as both teams agree; unusual ones are flagged in the tape below."}
          </p>
        </div>
      ) : (
        <ul className="min-h-0 overflow-y-auto">
          {approvals.map((p, i) => (
            <ApprovalRow key={p.id} state={state} proposal={p} now={now} focused={i === 0} onApprove={() => approve(p)} onReject={() => setReject(p)} />
          ))}
          {halted.map((inst) => (
            <li key={inst.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0">
              <Lock className="size-4 shrink-0 text-warning" aria-hidden />
              <p className="min-w-0 flex-1 text-[14px] text-fg-primary">
                <span className="font-mono font-medium">{inst.symbol}</span> is halted. No proposal in it can be sent or settled.
              </p>
              <GoLink href={`${base}/prices`} label="Market" />
            </li>
          ))}
          {failed.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0">
              <X className="size-4 shrink-0 text-negative" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-[14px] text-fg-primary">
                <span className="font-mono text-fg-muted">{p.id}</span> failed at settlement: {p.failureReason}
              </p>
            </li>
          ))}
        </ul>
      )}
      <ConfirmActionDialog
        open={reject !== null}
        onOpenChange={(open) => !open && setReject(null)}
        tier="reason"
        tone="warning"
        title={`Reject ${reject?.id}?`}
        description="The trade does not settle. Both teams see your reason immediately."
        confirmLabel="Reject trade"
        reasonLabel="Reason (shown to both teams)"
        onConfirm={({ reason, idempotencyKey }) => hostAction(rejectProposalByHost(eventId, reject!.id, reason, idempotencyKey), `${reject!.id} rejected`)}
      />
    </Panel>
  );
}

function waitingSince(p: TradeProposal) {
  return [...p.history].reverse().find((h) => h.status === "PENDING_APPROVAL")?.at ?? p.createdAt;
}

function ApprovalRow({ state, proposal, now, focused, onApprove, onReject }: { state: EventState; proposal: TradeProposal; now: number; focused: boolean; onApprove: () => void; onReject: () => void }) {
  const name = teamNameOf(state);
  const symbol = instrumentOf(state, proposal.instrumentId)?.symbol;
  const seller = proposal.side === "SELL" ? proposal.proposerTeamId : proposal.counterpartyTeamId;
  const buyer = proposal.side === "SELL" ? proposal.counterpartyTeamId : proposal.proposerTeamId;
  const m = monitorProposal(state, proposal);
  return (
    <li className={cn("border-b border-border-subtle px-4 py-3 last:border-0", focused && "bg-warning-soft/40")}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-caption text-fg-muted">{proposal.id}</span>
        {m.flags.includes("FAR_FROM_MARKET") && <FlagBadge>Far from market</FlagBadge>}
        {m.flags.includes("HIGH_VALUE") && <FlagBadge>Over {formatINR(highValueThreshold(state.event), 0)}</FlagBadge>}
        <span className="ml-auto flex items-center gap-1 font-mono text-caption text-fg-muted">
          <Clock className="size-3" aria-hidden />
          {formatDuration(Math.max(0, now - waitingSince(proposal)))}
        </span>
      </div>
      <p className="mt-1.5 text-[15px] leading-6 font-medium text-fg-primary">
        {name(seller)} sells {formatQuantity(proposal.quantity)} <span className="font-mono">{symbol}</span> to {name(buyer)}
      </p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-caption">
        <span className="font-mono text-[13px] text-fg-primary">
          {formatQuantity(proposal.quantity)} × ₹{formatPrice(proposal.price)} = {formatINR(m.value, 0)}
        </span>
        {m.lastPrice !== null && m.vsLastPct !== null && (
          <span className={Math.abs(m.vsLastPct) >= 5 ? "text-warning" : "text-fg-muted"}>
            {Math.abs(m.vsLastPct) < 0.005 ? "At the last price" : `${formatPct(Math.abs(m.vsLastPct), { signed: false })} ${m.vsLastPct > 0 ? "above" : "below"} the last price (₹${formatPrice(m.lastPrice)})`}
          </span>
        )}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onApprove} aria-keyshortcuts={focused ? "A" : undefined}>
          Approve{focused && <ButtonKbd variant="primary">A</ButtonKbd>}
        </Button>
        <Button variant="secondary" size="sm" onClick={onReject} aria-keyshortcuts={focused ? "R" : undefined}>
          Reject…{focused && <ButtonKbd>R</ButtonKbd>}
        </Button>
        <span className="ml-auto text-caption text-fg-muted">Both teams see the decision instantly</span>
      </div>
    </li>
  );
}

function FlagBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-xs border border-warning/50 px-1.5 text-caption font-medium text-warning">
      <Flag className="size-3" aria-hidden />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ trade activity */

const TAPE_TYPES = new Set(["TRADE_PROPOSED", "TRADE_ACCEPTED", "TRADE_SETTLED", "TRADE_REJECTED", "TRADE_REJECTED_BY_HOST", "TRADE_FAILED", "TRADE_APPROVAL_REQUESTED", "TRADE_CANCELLED", "TRADE_EXPIRED", "NEWS_RELEASED", "PRICE_CHANGED", "INSTRUMENT_HALTED", "TRADING_FROZEN", "TRADING_UNFROZEN"]);

function TradeActivityCard({ state }: { state: EventState }) {
  const { eventId } = useHostEvent();
  const round = currentRound(state);
  const volume = tradingVolume(state, round?.id ?? null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const rows = useMemo(
    () =>
      state.audit
        .filter((a) => TAPE_TYPES.has(a.type) && (pausedAt === null || a.at <= pausedAt))
        .slice(-60)
        .reverse(),
    [state.audit, pausedAt],
  );
  const newer = pausedAt === null ? 0 : state.audit.filter((a) => TAPE_TYPES.has(a.type) && a.at > pausedAt).length;

  return (
    <Panel
      icon={ArrowLeftRight}
      title="Trade activity"
      meta={pausedAt === null ? `live · ${volume.count} trade${volume.count === 1 ? "" : "s"} this round · ${formatINR(volume.value, 0)}` : `paused${newer ? ` · ${newer} new` : ""}`}
      action={
        <button type="button" onClick={() => setPausedAt(pausedAt === null ? Date.now() : null)} className="text-[13px] font-medium text-accent-text hover:underline">
          {pausedAt === null ? "Pause feed" : "Resume feed"}
        </button>
      }
      className="min-h-[280px] flex-1"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-meta text-fg-secondary">No trades yet. Proposals, settlements and news appear here as they happen.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto" aria-live={pausedAt === null ? "polite" : "off"}>
          {rows.map((a) => (
            <TapeRow key={a.id} state={state} event={a} />
          ))}
        </ol>
      )}
      <p className="shrink-0 border-t border-border px-4 py-2 text-caption text-fg-muted">
        Full history with filters in the <GoLink href={`${hostBase(eventId)}/trades`} label="Trade monitor" /> and <GoLink href={`${hostBase(eventId)}/audit`} label="Audit log" />.
      </p>
    </Panel>
  );
}

function tapeIcon(t: AuditEvent["type"]) {
  if (t === "TRADE_SETTLED") return <Check className="size-4 text-positive" />;
  if (t === "TRADE_PROPOSED") return <Send className="size-4 text-fg-muted" />;
  if (t === "NEWS_RELEASED") return <Zap className="size-4 text-warning" />;
  if (t.includes("REJECTED") || t === "TRADE_FAILED") return <X className="size-4 text-fg-muted" />;
  if (t === "PRICE_CHANGED") return <TrendingUp className="size-4 text-fg-muted" />;
  if (t === "TRADE_APPROVAL_REQUESTED") return <Clock className="size-4 text-warning" />;
  if (t === "TRADING_FROZEN") return <Snowflake className="size-4 text-warning" />;
  if (t === "TRADING_UNFROZEN") return <Snowflake className="size-4 text-fg-muted" />;
  if (t === "INSTRUMENT_HALTED") return <Lock className="size-4 text-warning" />;
  return <Circle className="size-3 text-fg-muted" />;
}

function TapeRow({ state, event }: { state: EventState; event: AuditEvent }) {
  const proposal = event.refs.proposalId ? state.proposals.find((p) => p.id === event.refs.proposalId) : undefined;
  const trade = event.refs.tradeId ? state.trades.find((t) => t.id === event.refs.tradeId) : undefined;
  const value = trade?.value ?? (proposal ? proposal.price * proposal.quantity : null);
  const flags = proposal && (event.type === "TRADE_SETTLED" || event.type === "TRADE_PROPOSED") ? monitorProposal(state, proposal).flags : [];
  const t = event.type;
  const icon = tapeIcon(t);
  return (
    <li className="grid grid-cols-[64px_20px_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-border-subtle px-4 py-2.5 last:border-0">
      <span className="pt-0.5 font-mono text-caption text-fg-muted">{formatClock(event.at, true)}</span>
      <span className="pt-0.5" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-[14px] leading-5 text-fg-primary">{event.summary}</span>
        {flags.length > 0 && (
          <span className="mt-1 flex gap-1.5">
            {flags.includes("HIGH_VALUE") && <FlagBadge>High value</FlagBadge>}
            {flags.includes("FAR_FROM_MARKET") && <FlagBadge>Far from market</FlagBadge>}
          </span>
        )}
      </span>
      <span className="pt-0.5 text-right font-mono text-[13px] text-fg-secondary">{value !== null && t.startsWith("TRADE") ? formatINR(value, 0) : ""}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ market + standings */

function MarketCard({ state }: { state: EventState }) {
  const { eventId } = useHostEvent();
  const [manual, setManual] = useState<{ instrument: Instrument; mode: "SET" | "PERCENT" } | null>(null);
  const [haltTarget, setHaltTarget] = useState<Instrument | null>(null);
  const rows = instrumentRows(state);
  const halted = rows.filter((r) => r.instrument.halted).length;

  return (
    <Panel icon={TrendingUp} title="Market" meta={`${rows.length} stocks · ${halted ? `${halted} halted` : "none halted"}`} action={<GoLink href={`${hostBase(eventId)}/prices`} label="All" />} className="shrink-0">
      <ul className="max-h-[320px] overflow-y-auto">
        {rows.map((row) => (
          <li key={row.instrument.id} className="flex h-9 items-center gap-2 border-b border-border-subtle pr-2 pl-4 last:border-0">
            <span className="w-20 truncate font-mono text-[13px] font-medium text-fg-primary">
              {row.instrument.symbol}
              {row.instrument.halted && <Lock className="ml-1 inline size-3 text-warning" aria-label="halted" />}
            </span>
            <span className="flex-1 text-right font-mono text-[13px] text-fg-primary">{formatPrice(row.price)}</span>
            <Delta value={row.roundChangePct} variant="pill" showArrow className="w-[76px] justify-end" />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.instrument.symbol}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className="z-50 w-56 animate-fade-in rounded-lg border border-border-strong bg-surface-raised p-1 shadow-popover">
                  <MenuItem icon={<Percent className="size-4" />} label={`Move ${row.instrument.symbol} by %`} onSelect={() => setManual({ instrument: row.instrument, mode: "PERCENT" })} />
                  <MenuItem icon={<TrendingUp className="size-4" />} label="Set an exact price" onSelect={() => setManual({ instrument: row.instrument, mode: "SET" })} />
                  <MenuItem
                    icon={row.instrument.halted ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                    label={row.instrument.halted ? "Resume trading" : "Halt trading"}
                    tone="warning"
                    onSelect={() => setHaltTarget(row.instrument)}
                  />
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </li>
        ))}
      </ul>
      {manual && <ManualPriceDialog key={`${manual.instrument.id}-${manual.mode}`} state={state} instrument={manual.instrument} mode={manual.mode} onClose={() => setManual(null)} />}
      <ConfirmActionDialog
        open={haltTarget !== null}
        onOpenChange={(open) => !open && setHaltTarget(null)}
        tier="confirm"
        tone="warning"
        title={haltTarget?.halted ? `Resume trading in ${haltTarget?.symbol}?` : `Halt ${haltTarget?.symbol}?`}
        description={haltTarget?.halted ? "Teams can propose and settle trades in this stock again." : "No proposal in this stock can be sent or settled until you resume it."}
        confirmLabel={haltTarget?.halted ? `Resume ${haltTarget?.symbol}` : `Halt ${haltTarget?.symbol}`}
        onConfirm={() =>
          haltTarget!.halted ? hostAction(resumeInstrument(eventId, haltTarget!.id), `${haltTarget!.symbol} resumed`) : hostAction(haltInstrument(eventId, haltTarget!.id), `${haltTarget!.symbol} halted`)
        }
      />
    </Panel>
  );
}

function MenuItem({ icon, label, onSelect, tone }: { icon: ReactNode; label: string; onSelect: () => void; tone?: "warning" }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] outline-none data-highlighted:bg-surface-hover", tone === "warning" ? "text-warning" : "text-fg-primary")}>
      {icon}
      {label}
    </DropdownMenu.Item>
  );
}

function StandingsCard({ state }: { state: EventState }) {
  const { eventId } = useHostEvent();
  const board = computeLeaderboard(state);
  const ranks = sharedRanks(board);
  const top = board.slice(0, 5);
  const last = board.at(-1);
  return (
    <Panel
      icon={Trophy}
      title="Standings"
      meta={state.event.leaderboard.frozen ? "frozen for teams" : `${board.length} teams`}
      action={<GoLink href={`${hostBase(eventId)}/leaderboard`} label="All" keys="G L" />}
      className="min-h-0 flex-1"
    >
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {top.map((row) => (
          <li key={row.teamId} className="flex h-9 items-center gap-3 border-b border-border-subtle px-4 last:border-0">
            <span className={cn("w-7 font-mono text-[13px]", row.rank === 1 ? "font-medium text-accent-text" : "text-fg-muted")}>{ranks[row.teamId]?.label.replace("#", "") ?? row.rank}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-fg-primary">{row.teamName}</span>
            <span className="font-mono text-[13px] text-fg-primary">{formatINR(row.netWorth, 0)}</span>
            <Delta value={row.returnPct} showArrow className="w-[68px] justify-end font-mono text-[13px]" />
          </li>
        ))}
      </ol>
      {board.length > 5 && last && (
        <p className="shrink-0 border-t border-border px-4 py-2 text-caption text-fg-muted">
          +{board.length - 5} more · lowest {last.teamName} <Delta value={last.returnPct} showArrow className="font-mono" />
        </p>
      )}
    </Panel>
  );
}
