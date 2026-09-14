"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CirclePause, CirclePlay, Dices, Eye, Newspaper, Settings2, SkipForward, Square, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/guidance";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ImpactLabel } from "@/components/market/widgets";
import { formatPct } from "@/lib/domain/money";
import { configuredImpactOf } from "@/lib/domain/news";
import { lastNewsReleaseAt, randomNewsView, validateRandomSettings } from "@/lib/domain/random-news";
import { currentRound } from "@/lib/domain/trading-gate";
import type { EventState, NewsItem } from "@/lib/domain/types";
import { formatClock, formatDuration, formatGapRange, formatRelative } from "@/lib/format";
import {
  pauseRandomNews,
  releaseRandomNewsNow,
  resumeRandomNews,
  setNewsReleaseMode,
  skipRandomNews,
  startRandomNews,
  stopRandomNews,
  updateRandomNewsSettings,
} from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { instrumentOf, releasesNewestFirst } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, hostBase } from "./host-context";
import { ReleaseNewsDialog } from "./news-release-dialog";

export function StoryImpacts({ state, item, className }: { state: EventState; item: NewsItem; className?: string }) {
  if (item.impacts.length === 0) return <span className={cn("text-xs text-fg-muted", className)}>No price impact</span>;
  return (
    <span className={cn("flex flex-wrap gap-x-3 gap-y-0.5", className)}>
      {item.impacts.map((impact) => (
        <span key={impact.id} className="inline-flex items-center gap-1.5 text-xs">
          <span className="font-medium text-fg-primary">{instrumentOf(state, impact.instrumentId)?.symbol}</span>
          <ImpactLabel configured={configuredImpactOf(impact)} />
        </span>
      ))}
    </span>
  );
}

/** Manual queue: READY stories for the running round first, then any-round stories, then later rounds. */
export function manualQueue(state: EventState): NewsItem[] {
  const round = currentRound(state);
  const rank = (item: NewsItem) => (round && item.roundId === round.id ? 0 : item.roundId === null ? 1 : 2);
  return state.news.filter((n) => n.status === "READY").sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}

type NewsControlProps = { state: EventState; variant: "control-room" | "desk" };

/** Live news control: switch between manual and random release, see what's next and act in one or two clicks. */
export function NewsControlPanel({ state, variant }: NewsControlProps) {
  const now = useNow();
  const random = state.randomNews;
  const eventId = state.event.id;
  const [releaseItem, setReleaseItem] = useState<NewsItem | null>(null);
  const [modeTarget, setModeTarget] = useState<"MANUAL" | "RANDOM" | null>(null);
  const last = releasesNewestFirst(state)[0];

  return (
    <Card className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md border border-border bg-surface-raised text-fg-secondary">
            <Newspaper className="size-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-fg-primary">{variant === "desk" ? "Release mode" : "Live news"}</h2>
            <p className="text-xs text-fg-muted">
              {last ? (
                <>
                  Last story {formatRelative(last.releasedAt, now)} · {last.source === "RANDOM" ? "random" : "manual"}
                </>
              ) : (
                "No story released yet"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            options={[
              { value: "MANUAL", label: "Manual" },
              { value: "RANDOM", label: "Random" },
            ]}
            value={random.mode}
            onChange={(mode) => (random.status === "RUNNING" && mode === "MANUAL" ? setModeTarget(mode) : hostAction(setNewsReleaseMode(eventId, mode), mode === "RANDOM" ? "Random mode selected" : "Manual mode selected"))}
            label="News release mode"
            size="md"
          />
          {variant === "control-room" && (
            <Link href={`${hostBase(eventId)}/news`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              News desk
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </header>

      {random.mode === "MANUAL" ? <ManualBody state={state} variant={variant} onRelease={setReleaseItem} /> : <RandomBody state={state} now={now} />}

      <ReleaseNewsDialog state={state} item={releaseItem} onClose={() => setReleaseItem(null)} />
      <ConfirmActionDialog
        open={modeTarget !== null}
        onOpenChange={(open) => !open && setModeTarget(null)}
        tier="confirm"
        tone="warning"
        title="Switch to manual mode?"
        description="Random mode stops and the scheduled story is cancelled. Nothing is released."
        confirmLabel="Stop random & switch"
        onConfirm={() => hostAction(setNewsReleaseMode(eventId, "MANUAL"), "Manual mode selected")}
      />
    </Card>
  );
}

function ManualBody({ state, variant, onRelease }: { state: EventState; variant: NewsControlProps["variant"]; onRelease: (item: NewsItem) => void }) {
  const queue = manualQueue(state);
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";
  const round = currentRound(state);
  const [next, ...rest] = queue;

  if (variant === "desk") {
    return <p className="px-4 py-3 text-[13px] text-fg-secondary">Manual mode: release stories yourself from the Ready list below. Switch to Random to let the scheduler pick stories at safe intervals.</p>;
  }
  if (!next) {
    return <p className="px-4 py-8 text-center text-[13px] text-fg-muted">No ready stories. Prepare stories in the news desk.</p>;
  }
  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
          Next available
          {round && next.roundId === round.id && <Badge tone="accent">This round</Badge>}
        </p>
        <p className="mt-1.5 text-[15px] leading-snug font-semibold text-fg-primary">
          <span className="mr-1.5 font-mono text-xs font-normal text-fg-muted">#{next.number}</span>
          {next.headline}
        </p>
        <StoryImpacts state={state} item={next} className="mt-2" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => onRelease(next)} disabled={!live}>
            <Zap className="size-3.5" />
            Release now
          </Button>
          <Button variant="secondary" onClick={() => onRelease(next)}>
            <Eye className="size-3.5" />
            Preview
          </Button>
          {!live && <span className="self-center text-xs text-fg-muted">Start the event to release news.</span>}
        </div>
      </div>
      {rest.length > 0 && (
        <div className="border-t border-border">
          <p className="px-4 pt-2.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">Up next</p>
          <ul className="pb-1.5">
            {rest.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-1.5">
                <span className="w-7 font-mono text-xs text-fg-muted">#{item.number}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg-primary" title={item.headline}>
                  {item.headline}
                </span>
                <Button variant="ghost" size="xs" onClick={() => onRelease(item)} disabled={!live}>
                  Release…
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RandomBody({ state, now }: { state: EventState; now: number }) {
  const eventId = state.event.id;
  const random = state.randomNews;
  const view = randomNewsView(state, now);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const round = currentRound(state);
  const scopeLabel = random.roundScope === "CURRENT" ? "current round" : `R${state.rounds.find((r) => r.id === random.roundScope)?.number ?? "?"} only`;
  const running = random.status === "RUNNING";
  const counting = view.phase === "SCHEDULED" && view.remainingMs !== null;
  const last = lastNewsReleaseAt(state);

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
            <span className={cn("size-2 rounded-full", running ? (view.phase === "SCHEDULED" ? "animate-pulse-dot bg-accent" : "bg-warning") : random.status === "PAUSED" ? "bg-warning" : "bg-fg-muted")} aria-hidden />
            <span className={running && view.phase === "SCHEDULED" ? "text-accent" : random.status === "STOPPED" ? "text-fg-muted" : "text-warning"}>
              {random.status === "STOPPED" ? "Random mode · stopped" : random.status === "PAUSED" ? "Random mode · paused" : view.phase === "SCHEDULED" ? "Next random news" : "Random mode · waiting"}
            </span>
          </p>
          {counting ? (
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl leading-none font-semibold text-fg-primary tabular-nums">in {formatDuration(view.remainingMs!)}</span>
              {view.nextReleaseAt && <span className="text-xs text-fg-muted tabular-nums">at {formatClock(view.nextReleaseAt, true)}</span>}
            </p>
          ) : (
            <p className="mt-1 text-[14px] font-medium text-fg-primary">{view.message}</p>
          )}
          {random.status !== "STOPPED" && view.phase !== "SCHEDULED" && view.remainingMs !== null && <p className="mt-0.5 text-xs text-fg-muted tabular-nums">Countdown held at {formatDuration(view.remainingMs)}</p>}
        </div>
        <div className="text-right text-xs text-fg-muted">
          <p>
            Every {formatGapRange(random.minGapSeconds, random.maxGapSeconds)}
            <InfoTip className="ml-1 align-middle" content="The next story is scheduled at a random moment inside this gap, and never sooner than the minimum gap after the previous story." />
          </p>
          <p>
            {round ? `${view.releasedThisRound}/${random.maxPerRound} this round` : `Max ${random.maxPerRound} per round`} · {view.eligibleCount} eligible · {scopeLabel}
          </p>
        </div>
      </div>

      {view.scheduledItem && random.status !== "STOPPED" && (
        <div className="rounded-md border border-border bg-surface-raised/60 px-3 py-2.5">
          <p className="text-[11px] tracking-wide text-fg-muted uppercase">Scheduled story</p>
          <p className="mt-0.5 text-[13px] font-medium text-fg-primary">
            <span className="mr-1.5 font-mono text-xs text-fg-muted">#{view.scheduledItem.number}</span>
            {view.scheduledItem.headline}
          </p>
          <StoryImpacts state={state} item={view.scheduledItem} className="mt-1" />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {random.status === "STOPPED" && (
          <Button variant="primary" onClick={() => hostAction(startRandomNews(eventId), "Random news started", "The next story is scheduled inside your gap.")}>
            <CirclePlay className="size-3.5" />
            Start random mode
          </Button>
        )}
        {random.status === "RUNNING" && (
          <>
            <Button variant="primary" onClick={() => setConfirmRelease(true)} disabled={state.event.status !== "LIVE" || view.eligibleCount === 0}>
              <Zap className="size-3.5" />
              Release now
            </Button>
            <Button variant="secondary" onClick={() => hostAction(skipRandomNews(eventId), "Scheduled story skipped", "A different story has been scheduled.")} disabled={!view.scheduledItem}>
              <SkipForward className="size-3.5" />
              Skip
            </Button>
            <Button variant="secondary" onClick={() => hostAction(pauseRandomNews(eventId), "Random news paused")}>
              <CirclePause className="size-3.5" />
              Pause
            </Button>
          </>
        )}
        {random.status === "PAUSED" && (
          <Button variant="primary" onClick={() => hostAction(resumeRandomNews(eventId), "Random news resumed")}>
            <CirclePlay className="size-3.5" />
            Resume
          </Button>
        )}
        {random.status !== "STOPPED" && (
          <Button variant="ghost" onClick={() => hostAction(stopRandomNews(eventId), "Random news stopped")}>
            <Square className="size-3.5" />
            Stop
          </Button>
        )}
        <Button variant="ghost" onClick={() => setSettingsOpen(true)} className="ml-auto">
          <Settings2 className="size-3.5" />
          Settings
        </Button>
      </div>

      <RandomSettingsDialog state={state} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ConfirmActionDialog
        open={confirmRelease}
        onOpenChange={setConfirmRelease}
        tier="confirm"
        title="Release the next random story now?"
        description={
          last !== null && now - last < random.minGapSeconds * 1000
            ? `The last story went out ${formatDuration(now - last)} ago, inside your ${formatDuration(random.minGapSeconds * 1000)} minimum gap. Releasing now is a host override.`
            : "The scheduled story is released immediately and the next one is scheduled inside your gap."
        }
        confirmLabel="Release now"
        onConfirm={({ idempotencyKey }) =>
          hostAction(
            releaseRandomNewsNow(eventId, idempotencyKey),
            (release) => `Released: ${release.headline}`,
            (release) => release.impacts.map((i) => `${instrumentOf(state, i.instrumentId)?.symbol} ${formatPct(i.appliedPct)}`).join(" · ") || undefined,
          )
        }
      />
    </div>
  );
}

const GAP_PRESETS = [
  { value: "60-120", label: "1–2 min", min: 60, max: 120 },
  { value: "120-300", label: "2–5 min", min: 120, max: 300 },
  { value: "300-600", label: "5–10 min", min: 300, max: 600 },
];

function RandomSettingsDialog({ state, open, onOpenChange }: { state: EventState; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <RandomSettingsForm state={state} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function RandomSettingsForm({ state, onDone }: { state: EventState; onDone: () => void }) {
  const random = state.randomNews;
  const [roundScope, setRoundScope] = useState(random.roundScope);
  const [includeUnassigned, setIncludeUnassigned] = useState(random.includeUnassigned);
  const [minText, setMinText] = useState(String(random.minGapSeconds));
  const [maxText, setMaxText] = useState(String(random.maxGapSeconds));
  const [perRoundText, setPerRoundText] = useState(String(random.maxPerRound));
  const [pending, setPending] = useState(false);
  const values = { minGapSeconds: Number(minText), maxGapSeconds: Number(maxText), maxPerRound: Number(perRoundText) };
  const error = validateRandomSettings(values);
  const preset = GAP_PRESETS.find((p) => p.min === values.minGapSeconds && p.max === values.maxGapSeconds)?.value ?? "CUSTOM";

  const save = async () => {
    setPending(true);
    const result = await hostAction(updateRandomNewsSettings(state.event.id, { roundScope, includeUnassigned, ...values }), "Random news settings saved");
    setPending(false);
    if (result.ok) onDone();
  };

  return (
    <DialogContent
      title="Random news settings"
      description="The scheduler picks one unused story at a time and releases it at a random moment inside the gap."
      icon={<Dices className="size-4" />}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={pending || !!error}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Gap between stories">
          <SegmentedControl
            options={[...GAP_PRESETS.map((p) => ({ value: p.value, label: p.label })), { value: "CUSTOM", label: "Custom" }]}
            value={preset}
            onChange={(value) => {
              const chosen = GAP_PRESETS.find((p) => p.value === value);
              if (chosen) {
                setMinText(String(chosen.min));
                setMaxText(String(chosen.max));
              }
            }}
            label="Gap presets"
            size="md"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Minimum gap (sec)" htmlFor="rn-min" hint={Number(minText) >= 30 ? formatDuration(Number(minText) * 1000) : "At least 30s"}>
            <Input id="rn-min" inputMode="numeric" value={minText} onChange={(e) => setMinText(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Maximum gap (sec)" htmlFor="rn-max" hint={Number(maxText) > 0 ? formatDuration(Number(maxText) * 1000) : undefined}>
            <Input id="rn-max" inputMode="numeric" value={maxText} onChange={(e) => setMaxText(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Max per round" htmlFor="rn-per-round">
            <Input id="rn-per-round" inputMode="numeric" value={perRoundText} onChange={(e) => setPerRoundText(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <Field label="Eligible round" htmlFor="rn-round" hint="Stories assigned to that round are picked; the scheduler waits while any other round runs.">
          <Select
            id="rn-round"
            value={roundScope}
            onValueChange={setRoundScope}
            options={[{ value: "CURRENT", label: "Current round (follows the event)" }, ...state.rounds.filter((r) => r.type === "TRADING").map((r) => ({ value: r.id, label: `Only Round ${r.number} · ${r.name}` }))]}
          />
        </Field>
        <label className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5">
          <span>
            <span className="block text-[13px] font-medium text-fg-primary">Include &ldquo;any round&rdquo; stories</span>
            <span className="block text-xs text-fg-muted">Stories not assigned to a round can be picked in every round.</span>
          </span>
          <Switch checked={includeUnassigned} onCheckedChange={setIncludeUnassigned} label="Include stories not assigned to a round" />
        </label>
        <p className="text-xs text-fg-muted">Released stories are never picked again. Exclude individual stories with the &ldquo;Random pool&rdquo; switch in the Ready list.</p>
        {error && <p className="text-[13px] text-warning">{error}</p>}
      </div>
    </DialogContent>
  );
}
