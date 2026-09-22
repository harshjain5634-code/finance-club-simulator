"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Clock, Eye, Lock, Pause, Play, Plus, Search, Shuffle, SkipForward, Trash, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Switch } from "@/components/ui/controls";
import { Delta } from "@/components/ui/delta";
import { Dialog, DialogContent, DrawerContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { InlineBanner, Kbd } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { NEWS_PRIORITY_LABEL } from "@/components/market/status";
import { BeforeAfter, ImpactLabel } from "@/components/market/widgets";
import { formatPct, formatPrice } from "@/lib/domain/money";
import { configuredImpactOf, describeConfigured, validateNewsItem } from "@/lib/domain/news";
import { scheduledStories, scheduleHold, validateSchedule } from "@/lib/domain/news-schedule";
import { CLAMP_LABEL } from "@/lib/domain/prices";
import { lastNewsReleaseAt, randomNewsView, validateRandomSettings } from "@/lib/domain/random-news";
import { nextPendingRound } from "@/lib/domain/lifecycle";
import type { NewsDraft } from "@/lib/domain/setup";
import { currentRound } from "@/lib/domain/trading-gate";
import type { EventState, NewsImpact, NewsItem } from "@/lib/domain/types";
import { formatClock, formatDuration, formatGapRange } from "@/lib/format";
import {
  pauseRandomNews,
  releaseRandomNewsNow,
  resumeRandomNews,
  saveNews,
  scheduleNews,
  setRandomPoolMembership,
  skipNews,
  skipRandomNews,
  startRandomNews,
  stopRandomNews,
  unscheduleNews,
  updateRandomNewsSettings,
} from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { describeActor, instrumentOf } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";
import { manualQueue } from "./news-control";
import { ReleaseNewsDialog } from "./news-release-dialog";

type Filter = "ALL" | "READY" | "SCHEDULED" | "DRAFT" | "RELEASED";

/**
 * C4 Host News Desk (section 14, frames 103:6439 and 105:6662). Left: every story grouped by round with its state.
 * Right: the selected story in place (what teams read, the host-only price effect, round and random-pool options),
 * with Release / Schedule / Skip pinned at the bottom. Random news settings open in a side drawer.
 */
export function NewsDeskScreen() {
  const { state } = useHostEvent();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [randomOpen, setRandomOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const queue = manualQueue(state);
  const nextUpId = queue[0]?.id ?? null;
  const selectedId = creating ? null : (params.get("story") ?? nextUpId ?? state.news[0]?.id ?? null);
  const selected = state.news.find((n) => n.id === selectedId) ?? null;
  const select = (id: string) => {
    setCreating(false);
    router.replace(`${pathname}?story=${id}`, { scroll: false });
  };

  const counts = {
    ALL: state.news.length,
    READY: state.news.filter((n) => n.status === "READY" && n.scheduledFor == null).length,
    SCHEDULED: scheduledStories(state).length,
    DRAFT: state.news.filter((n) => n.status === "DRAFT").length,
    RELEASED: state.news.filter((n) => n.status === "RELEASED").length,
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return state.news.filter((n) => {
      if (filter === "READY" && !(n.status === "READY" && n.scheduledFor == null)) return false;
      if (filter === "SCHEDULED" && !(n.status === "READY" && n.scheduledFor != null)) return false;
      if (filter === "DRAFT" && n.status !== "DRAFT") return false;
      if (filter === "RELEASED" && n.status !== "RELEASED") return false;
      if (!q) return true;
      const symbols = n.impacts.map((i) => instrumentOf(state, i.instrumentId)?.symbol ?? "").join(" ");
      return `${n.number} ${n.headline} ${symbols}`.toLowerCase().includes(q);
    });
  }, [state, filter, query]);

  const round = currentRound(state);
  const groups = [
    ...[...state.rounds].sort((a, b) => a.number - b.number).map((r) => ({ key: r.id, round: r, items: visible.filter((n) => n.roundId === r.id) })),
    { key: "ANY", round: null, items: visible.filter((n) => n.roundId === null) },
  ].filter((g) => g.items.length > 0);

  const random = state.randomNews;
  const randomLabel = random.mode === "MANUAL" || random.status === "STOPPED" ? "Random: off" : random.status === "PAUSED" ? "Random: paused" : "Random: running";

  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] xl:h-[calc(100dvh-112px-32px-32px)]"
      onKeyDown={(e) => {
        if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }}
    >
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <h1 className="text-h2 font-semibold text-fg-primary">News desk</h1>
          <span className="text-caption text-fg-muted">{state.news.length} stories</span>
          <span className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRandomOpen(true)}>
              <Shuffle className="size-4" />
              {randomLabel}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              New story
            </Button>
          </span>
        </div>
        <div className="flex flex-col gap-2.5 border-b border-border px-4 pt-3 pb-3">
          <SegmentedControl
            size="md"
            label="Filter stories"
            value={filter}
            onChange={setFilter}
            className="w-full [&>button]:flex-1"
            options={[
              { value: "ALL", label: `All ${counts.ALL}` },
              { value: "READY", label: `Ready ${counts.READY}` },
              { value: "SCHEDULED", label: `Timed ${counts.SCHEDULED}` },
              { value: "DRAFT", label: `Draft ${counts.DRAFT}` },
              { value: "RELEASED", label: `Out ${counts.RELEASED}` },
            ]}
          />
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stories, stocks or #"
              aria-label="Search stories"
              className="h-(--control-h) w-full rounded-md border border-border bg-surface pr-10 pl-9 text-[14px] text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent"
            />
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 && <p className="px-4 py-10 text-center text-meta text-fg-secondary">{state.news.length === 0 ? "No stories yet. Create the first one." : "No story matches."}</p>}
          {groups.map((g) => {
            const out = g.items.filter((n) => n.status === "RELEASED").length;
            const toGo = g.items.filter((n) => n.status === "READY").length;
            const running = g.round && round?.id === g.round.id && (g.round.status === "RUNNING" || g.round.status === "PAUSED");
            return (
              <section key={g.key} aria-label={g.round ? `Round ${g.round.number}` : "Not assigned to a round"}>
                <header className="sticky top-0 z-[1] flex items-center justify-between border-b border-border bg-canvas-subtle px-4 py-2">
                  <span className="eyebrow text-fg-secondary">
                    {g.round ? `${g.round.type === "BRIEFING" ? "Briefing" : `Round ${g.round.number}`} · ${g.round.name}${running ? " · running" : g.round.status === "ENDED" ? " · ended" : ""}` : "Not assigned to a round"}
                  </span>
                  <span className="font-mono text-caption text-fg-muted">{g.round ? `${toGo} to go · ${out} out` : "random news can pick"}</span>
                </header>
                <ul>
                  {g.items
                    .sort((a, b) => a.number - b.number)
                    .map((item) => (
                      <StoryListRow key={item.id} state={state} item={item} selected={item.id === selectedId} nextUp={item.id === nextUpId} onSelect={() => select(item.id)} now={now} />
                    ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Card>

      <div className="flex min-h-0 flex-col">
        {creating ? (
          <StoryPane key="new" state={state} item={null} nextUp={false} onCreated={(id) => select(id)} onCancelNew={() => setCreating(false)} />
        ) : selected ? (
          selected.status === "RELEASED" ? (
            <ReleasedPane key={selected.id} state={state} item={selected} />
          ) : (
            <StoryPane key={selected.id} state={state} item={selected} nextUp={selected.id === nextUpId} />
          )
        ) : (
          <Card className="grid flex-1 place-items-center p-10 text-center">
            <p className="text-meta text-fg-secondary">Select a story, or create one.</p>
          </Card>
        )}
      </div>

      <Dialog open={randomOpen} onOpenChange={setRandomOpen}>
        {randomOpen && <RandomNewsDrawer state={state} now={now} onDone={() => setRandomOpen(false)} />}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ list */

function impactSummary(state: EventState, item: NewsItem) {
  if (item.impacts.length === 0) return "No price effect";
  return item.impacts
    .map((i) => {
      const sym = instrumentOf(state, i.instrumentId)?.symbol ?? "?";
      const arrow = i.direction === "UP" ? "▲" : "▼";
      const size = i.mode === "FIXED" ? `${i.fixedPct}%` : `${i.minPct}–${i.maxPct}%`;
      return `${sym} ${arrow} ${size}`;
    })
    .join(", ");
}

function StoryListRow({ state, item, selected, nextUp, onSelect, now }: { state: EventState; item: NewsItem; selected: boolean; nextUp: boolean; onSelect: () => void; now: number }) {
  const release = item.releaseId ? state.newsReleases.find((r) => r.id === item.releaseId) : undefined;
  const randomPick = state.randomNews.status !== "STOPPED" && state.randomNews.scheduledNewsId === item.id;
  const timed = item.status === "READY" && item.scheduledFor != null;
  let meta: ReactNode;
  if (release) {
    meta = (
      <>
        <span className="font-mono">{formatClock(release.releasedAt)}</span>
        {release.impacts.map((i) => (
          <span key={i.instrumentId}>
            {" · "}
            {instrumentOf(state, i.instrumentId)?.symbol} <span className={cn("font-mono", i.appliedPct > 0 ? "text-positive" : i.appliedPct < 0 ? "text-negative" : undefined)}>{i.appliedPct > 0 ? "▲" : i.appliedPct < 0 ? "▼" : ""} {formatPct(Math.abs(i.appliedPct), { signed: false })}</span>
          </span>
        ))}
        {" · "}
        {NEWS_PRIORITY_LABEL[item.priority]}
      </>
    );
  } else {
    meta = (
      <>
        {nextUp && <span className="mr-1.5 rounded-xs bg-accent-soft px-1.5 py-px text-accent-text">Next up</span>}
        {impactSummary(state, item)} · {NEWS_PRIORITY_LABEL[item.priority]}
        {timed && <span className="font-mono"> · {formatClock(item.scheduledFor!)}</span>}
      </>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "relative flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
          selected && "bg-accent-soft/50 hover:bg-accent-soft/60",
        )}
      >
        {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
        <span className="w-7 shrink-0 font-mono text-caption text-fg-muted">#{item.number}</span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[14px] leading-5", item.status === "RELEASED" || item.status === "SKIPPED" ? "text-fg-secondary" : "font-medium text-fg-primary")}>{item.headline}</span>
          <span className="mt-0.5 block truncate text-caption text-fg-muted">{meta}</span>
        </span>
        <StoryStateBadge item={item} randomPick={randomPick} now={now} />
      </button>
    </li>
  );
}

function StoryStateBadge({ item, randomPick, now }: { item: NewsItem; randomPick: boolean; now: number }) {
  if (item.status === "RELEASED") return <Badge tone="neutral">Released</Badge>;
  if (item.status === "SKIPPED") return <Badge tone="outline">Skipped</Badge>;
  if (item.status === "DRAFT") return <Badge tone="outline">Draft</Badge>;
  if (item.scheduledFor != null)
    return (
      <Badge tone={item.scheduledFor <= now ? "warning" : "info"} dot>
        {item.scheduledFor <= now ? "Held" : "Scheduled"}
      </Badge>
    );
  if (randomPick) return <Badge tone="info">Random pick</Badge>;
  return <Badge tone="outline">Ready</Badge>;
}

/* ------------------------------------------------------------------ editor */

type ImpactDraft = Omit<NewsImpact, "id"> & { key: string };

function StoryPane({ state, item, nextUp, onCreated, onCancelNew }: { state: EventState; item: NewsItem | null; nextUp: boolean; onCreated?: (id: string) => void; onCancelNew?: () => void }) {
  const eventId = state.event.id;
  const now = useNow();
  const [headline, setHeadline] = useState(item?.headline ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [roundId, setRoundId] = useState(() => {
    if (item) return item.roundId ?? "ANY";
    const active = currentRound(state);
    return (active && (active.status === "RUNNING" || active.status === "PAUSED") ? active.id : nextPendingRound(state)?.id) ?? "ANY";
  });
  const [priority, setPriority] = useState<NewsItem["priority"]>(item?.priority ?? "NORMAL");
  const [ready, setReady] = useState(item ? item.status === "READY" : false);
  const [impacts, setImpacts] = useState<ImpactDraft[]>(() => (item?.impacts ?? []).map((i) => ({ ...i, key: i.id })));
  const [pending, setPending] = useState(false);
  const [release, setRelease] = useState<NewsItem | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const keyCounter = useRef(0);

  const draftImpacts: NewsImpact[] = impacts.map(({ key, ...rest }) => ({ ...rest, id: key }));
  const error = validateNewsItem({ headline, impacts: draftImpacts });
  const draft: NewsDraft = {
    headline,
    body,
    roundId: roundId === "ANY" ? null : roundId,
    priority,
    status: ready ? "READY" : "DRAFT",
    impacts: impacts.map(({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing }) => ({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing })),
  };
  const dirty =
    !item ||
    JSON.stringify(draft) !==
      JSON.stringify({
        headline: item.headline,
        body: item.body,
        roundId: item.roundId,
        priority: item.priority,
        status: item.status === "READY" ? "READY" : "DRAFT",
        impacts: item.impacts.map(({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing }) => ({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing })),
      });
  const locked = item?.status === "SKIPPED";
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";
  const inPool = item ? !state.randomNews.excludedNewsIds.includes(item.id) : true;
  const randomPick = !!item && state.randomNews.status !== "STOPPED" && state.randomNews.scheduledNewsId === item.id;
  const updateImpact = (key: string, patch: Partial<ImpactDraft>) => setImpacts((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const parsePct = (value: string) => (value === "" ? null : Number(value));

  const save = async () => {
    setPending(true);
    const result = await hostAction(saveNews(eventId, item?.id ?? null, draft), (saved) => `Story #${saved.number} saved`);
    setPending(false);
    if (result.ok && !item) onCreated?.(result.value.id);
  };
  const discard = () => {
    if (!item) return onCancelNew?.();
    setHeadline(item.headline);
    setBody(item.body);
    setRoundId(item.roundId ?? "ANY");
    setPriority(item.priority);
    setReady(item.status === "READY");
    setImpacts(item.impacts.map((i) => ({ ...i, key: i.id })));
  };

  const saved = item && !dirty;
  const canRelease = saved && item.status === "READY" && live;
  const lastEdit = item ? [...state.audit].reverse().find((a) => a.refs.newsItemId === item.id && (a.type === "NEWS_UPDATED" || a.type === "NEWS_CREATED")) : undefined;

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
        {item ? <span className="font-mono text-[14px] font-medium text-fg-primary">#{item.number}</span> : <span className="text-h3 font-semibold text-fg-primary">New story</span>}
        {item && <StoryStateBadge item={item} randomPick={randomPick} now={now} />}
        {nextUp && <Badge tone="info">Next up</Badge>}
        {item?.scheduledFor != null && (
          <span className="font-mono text-caption text-fg-secondary">
            {item.scheduledFor > now ? `goes out ${formatClock(item.scheduledFor, true)} · in ${formatDuration(item.scheduledFor - now)}` : `was due ${formatClock(item.scheduledFor, true)} · held: ${scheduleHold(state) === "TRADING_FROZEN" ? "trading is frozen" : "event not live"}`}
          </span>
        )}
        <span className="ml-auto text-caption text-fg-muted">
          {dirty ? <span className="text-warning">Unsaved changes</span> : lastEdit ? `Saved · edited ${formatClock(lastEdit.at)} by ${describeActor(state, lastEdit.actor)}` : "Saved"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4">
          {locked && <InlineBanner tone="neutral" title="This story was skipped.">It stays on record but can no longer be released. Edit it to reuse the text in a new story.</InlineBanner>}
          <Section title="What teams will read">
            <Field label="Headline" htmlFor="story-headline" required>
              <Input id="story-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Nova Motors secures major government EV contract" disabled={locked} />
            </Field>
            <Field label="Story" htmlFor="story-body" hint="Optional detail shown when a team opens the story.">
              <Textarea id="story-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} />
            </Field>
            <Field label="Importance">
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  size="md"
                  label="Importance"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: "LOW", label: NEWS_PRIORITY_LABEL.LOW },
                    { value: "NORMAL", label: NEWS_PRIORITY_LABEL.NORMAL },
                    { value: "HIGH", label: NEWS_PRIORITY_LABEL.HIGH },
                  ]}
                />
                <span className="min-w-0 flex-1 text-caption text-fg-muted">
                  {priority === "LOW" ? "Update: listed in the news feed, no alert." : priority === "NORMAL" ? "Important: teams get a toast." : "Breaking: teams get a full alert card."} Every release also takes over the projector for {state.event.projector.breakingNewsSeconds} s.
                </span>
              </div>
            </Field>
          </Section>

          <Section
            title={
              <span className="flex items-center gap-2">
                <Lock className="size-4 text-fg-muted" aria-hidden /> Price effect
              </span>
            }
            aside="Only hosts see this. Teams see the headline and the move after it happens."
          >
            {impacts.length === 0 && <p className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-caption text-fg-muted">No price effect: this story is information only.</p>}
            {impacts.map((impact) => {
              const inst = instrumentOf(state, impact.instrumentId);
              return (
                <div key={impact.key} className="rounded-md border border-border p-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(120px,1fr)_auto_auto_auto_auto]">
                    <Field label="Stock">
                      <Select
                        aria-label="Stock"
                        value={impact.instrumentId}
                        onValueChange={(v) => updateImpact(impact.key, { instrumentId: v })}
                        options={state.instruments.map((i) => ({ value: i.id, label: i.symbol, disabled: impacts.some((o) => o.key !== impact.key && o.instrumentId === i.id) }))}
                      />
                    </Field>
                    <Field label="Direction">
                      <SegmentedControl size="md" label="Direction" value={impact.direction} onChange={(v) => updateImpact(impact.key, { direction: v })} options={[{ value: "UP", label: "Up" }, { value: "DOWN", label: "Down" }]} />
                    </Field>
                    <Field label="Size">
                      <SegmentedControl
                        size="md"
                        label="Size"
                        value={impact.mode}
                        onChange={(v) => updateImpact(impact.key, v === "RANGE" ? { mode: v, minPct: impact.minPct ?? 2, maxPct: impact.maxPct ?? 4 } : { mode: v, fixedPct: impact.fixedPct ?? 3 })}
                        options={[{ value: "FIXED", label: "Fixed" }, { value: "RANGE", label: "Range" }]}
                      />
                    </Field>
                    <Field label={impact.mode === "FIXED" ? "Move" : "Range"}>
                      {impact.mode === "FIXED" ? (
                        <span className="flex items-center gap-1.5">
                          <Input aria-label="Fixed percent" inputMode="decimal" value={impact.fixedPct ?? ""} onChange={(e) => updateImpact(impact.key, { fixedPct: parsePct(e.target.value) })} className="w-20 font-mono" />
                          <span className="text-caption text-fg-muted">%</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Input aria-label="Minimum percent" inputMode="decimal" value={impact.minPct ?? ""} onChange={(e) => updateImpact(impact.key, { minPct: parsePct(e.target.value) })} className="w-16 font-mono" />
                          <span className="text-caption text-fg-muted">to</span>
                          <Input aria-label="Maximum percent" inputMode="decimal" value={impact.maxPct ?? ""} onChange={(e) => updateImpact(impact.key, { maxPct: parsePct(e.target.value) })} className="w-16 font-mono" />
                          <span className="text-caption text-fg-muted">%</span>
                        </span>
                      )}
                    </Field>
                    <Field label="Timing">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-(--control-h) items-center rounded-md bg-canvas-subtle px-3 text-[14px] text-fg-primary" title="Gradual moves are not available yet">
                          Immediate
                        </span>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${inst?.symbol}`} onClick={() => setImpacts((list) => list.filter((i) => i.key !== impact.key))}>
                          <Trash className="size-4" />
                        </Button>
                      </span>
                    </Field>
                  </div>
                  <p className="mt-2.5 flex items-center gap-2 rounded-md bg-canvas-subtle px-3 py-2 text-caption text-fg-secondary">
                    <Eye className="size-3.5 shrink-0" aria-hidden />
                    On release {inst?.symbol} {describeConfigured(configuredImpactOf({ ...impact, id: impact.key }))} from ₹{formatPrice(state.prices[impact.instrumentId]?.price ?? 0)}
                    {inst?.circuitPct ? `, inside the ±${inst.circuitPct}% circuit` : ""}.
                  </p>
                </div>
              );
            })}
            <button
              type="button"
              className="self-start text-[14px] font-medium text-accent-text hover:underline disabled:opacity-50"
              disabled={locked || impacts.length >= state.instruments.length}
              onClick={() => {
                keyCounter.current += 1;
                setImpacts((list) => [
                  ...list,
                  { key: `draft-${keyCounter.current}`, instrumentId: state.instruments.find((i) => !list.some((l) => l.instrumentId === i.id))?.id ?? state.instruments[0].id, direction: "UP", mode: "FIXED", fixedPct: 3, minPct: null, maxPct: null, timing: "IMMEDIATE" },
                ]);
              }}
            >
              + Add {impacts.length ? "another " : "a "}stock
            </button>
          </Section>

          <Section title="Release options">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Round" htmlFor="story-round">
                <Select id="story-round" value={roundId} onValueChange={setRoundId} options={[{ value: "ANY", label: "Any round" }, ...state.rounds.map((r) => ({ value: r.id, label: `${r.type === "BRIEFING" ? "Briefing" : `Round ${r.number}`} · ${r.name}` }))]} />
              </Field>
              <Field label="Status">
                <label className="flex h-(--control-h) items-center gap-2.5">
                  <Switch checked={ready} onCheckedChange={setReady} label="Ready to release" disabled={locked} />
                  <span className="text-[14px] text-fg-primary">{ready ? "Ready to release" : "Draft"}</span>
                </label>
              </Field>
              <Field label="Random news">
                <label className="flex h-(--control-h) items-center gap-2.5">
                  <Switch
                    checked={inPool}
                    disabled={!item || locked}
                    onCheckedChange={(included) => item && hostAction(setRandomPoolMembership(eventId, item.id, included), included ? `#${item.number} can be picked by random news` : `#${item.number} left out of random news`)}
                    label="Random news may pick it"
                  />
                  <span className="text-[14px] text-fg-primary">May pick it</span>
                </label>
              </Field>
            </div>
          </Section>
          {error && headline.length > 0 && <p className="text-meta text-negative">{error}</p>}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-surface px-5 py-3">
        {dirty ? (
          <>
            <Button variant="primary" onClick={save} disabled={pending || !!error || locked}>
              {pending ? "Saving…" : item ? "Save changes" : "Create story"}
            </Button>
            <Button variant="ghost" onClick={discard}>
              {item ? "Discard" : "Cancel"}
            </Button>
            <span className="ml-auto text-caption text-fg-muted">Save before you release or schedule. Teams see nothing until you release.</span>
          </>
        ) : item && !locked ? (
          <>
            <Button variant="primary" shortcut={nextUp ? "N" : undefined} onClick={() => setRelease(item)} disabled={!canRelease}>
              <Zap className="size-4" />
              Release now…
            </Button>
            <Button variant="secondary" onClick={() => setScheduleOpen(true)} disabled={item.status !== "READY" || state.event.status === "COMPLETED"}>
              <CalendarClock className="size-4" />
              {item.scheduledFor != null ? "Reschedule…" : "Schedule…"}
            </Button>
            <Button variant="ghost" onClick={() => setSkipOpen(true)}>
              Skip story
            </Button>
            <span className="ml-auto text-caption text-fg-muted">{item.status === "DRAFT" ? "Mark it Ready to release or schedule it." : live ? "Teams see nothing until you release." : "Release opens when the event is live."}</span>
          </>
        ) : (
          <span className="text-caption text-fg-muted">Skipped stories can&apos;t be released.</span>
        )}
      </footer>

      <ReleaseNewsDialog state={state} item={release} onClose={() => setRelease(null)} />
      {item && (
        <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
          {scheduleOpen && <ScheduleDialog state={state} item={item} onDone={() => setScheduleOpen(false)} />}
        </Dialog>
      )}
      {item && (
        <ConfirmActionDialog
          open={skipOpen}
          onOpenChange={setSkipOpen}
          tier="confirm"
          tone="warning"
          title={`Skip story #${item.number}?`}
          description="It stays on record but can no longer be released, by you or by random news. Nothing moves."
          confirmLabel="Skip story"
          onConfirm={() => hostAction(skipNews(eventId, item.id), `Story #${item.number} skipped`)}
        />
      )}
    </Card>
  );
}

function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-fg-primary">{title}</h2>
        {aside && <p className="text-caption text-fg-muted">{aside}</p>}
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ released */

function ReleasedPane({ state, item }: { state: EventState; item: NewsItem }) {
  const release = state.newsReleases.find((r) => r.id === item.releaseId);
  if (!release) return null;
  const late = release.scheduledFor !== null && release.releasedAt - release.scheduledFor > 2000;
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
        <span className="font-mono text-[14px] font-medium text-fg-primary">#{item.number}</span>
        <Badge tone="neutral">Released</Badge>
        <span className="text-caption text-fg-muted">
          <span className="font-mono">{formatClock(release.releasedAt, true)}</span> · {release.source === "RANDOM" ? "random news" : release.scheduledFor ? "scheduled" : "manual"} · {describeActor(state, release.releasedBy)}
          {release.scheduledFor !== null && ` · planned ${formatClock(release.scheduledFor, true)}${late ? " (held, went out late)" : ""}`}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p className="text-caption text-fg-muted">{NEWS_PRIORITY_LABEL[item.priority]} · {state.rounds.find((r) => r.id === release.roundId)?.name ?? "Before the rounds"}</p>
        <h2 className="mt-1 text-h1 font-semibold text-fg-primary">{release.headline}</h2>
        {release.body && <p className="mt-2 text-body text-fg-secondary">{release.body}</p>}
        <h3 className="mt-6 text-h3 font-semibold text-fg-primary">What the market did</h3>
        {release.impacts.length === 0 ? (
          <p className="mt-2 text-meta text-fg-secondary">No price effect.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-[14px]">
            <thead>
              <tr className="h-9 border-b border-border text-caption text-fg-muted">
                <th className="text-left font-medium">Stock</th>
                <th className="text-left font-medium">Configured</th>
                <th className="text-right font-medium">Drawn</th>
                <th className="text-right font-medium">Applied</th>
                <th className="text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {release.impacts.map((i) => (
                <tr key={i.instrumentId} className="h-11 border-b border-border-subtle">
                  <td className="font-mono font-medium text-fg-primary">{instrumentOf(state, i.instrumentId)?.symbol}</td>
                  <td>
                    <ImpactLabel configured={i.configured} />
                  </td>
                  <td className="text-right font-mono">{formatPct(i.resolvedPct)}</td>
                  <td className="text-right">
                    <Delta value={i.appliedPct} variant="pill" showArrow />
                    {i.clamped && (
                      <Badge tone="warning" className="ml-1.5">
                        {i.clampReasons.map((r) => CLAMP_LABEL[r]).join(", ")}
                      </Badge>
                    )}
                  </td>
                  <td className="text-right">
                    <BeforeAfter before={i.previousPrice} after={i.newPrice} className="justify-end" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ schedule */

function toTimeInput(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function fromTimeInput(value: string, now: number): number {
  const [h, m, s = "0"] = value.split(":");
  const d = new Date(now);
  d.setHours(Number(h), Number(m), Number(s), 0);
  // A time earlier than now means tomorrow only if it is far back; otherwise it is simply in the past (and invalid).
  return d.getTime();
}

function ScheduleDialog({ state, item, onDone }: { state: EventState; item: NewsItem; onDone: () => void }) {
  const now = useNow();
  const [openedAt] = useState(now);
  const [time, setTime] = useState(() => toTimeInput(item.scheduledFor ?? Math.ceil((openedAt + 2 * 60_000) / 60_000) * 60_000));
  const [pending, setPending] = useState(false);
  const at = fromTimeInput(time, now);
  const error = validateSchedule(state, item.id, at, now);
  const round = currentRound(state);
  const roundEnds = round?.status === "RUNNING" ? round.endsAt : null;
  const hold = scheduleHold(state);

  const submit = async () => {
    setPending(true);
    const result = await hostAction(scheduleNews(state.event.id, item.id, at), `News #${item.number} scheduled for ${formatClock(at, true)}`);
    setPending(false);
    if (result.ok) onDone();
  };

  return (
    <DialogContent
      title={item.scheduledFor != null ? `Reschedule #${item.number}` : `Schedule #${item.number}`}
      description="The story goes out at this time exactly like a manual release: same price effect, alerts and projector takeover."
      icon={<CalendarClock />}
      footer={
        <>
          {item.scheduledFor != null && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                const r = await hostAction(unscheduleNews(state.event.id, item.id), `Schedule for #${item.number} cancelled`);
                if (r.ok) onDone();
              }}
            >
              Cancel schedule
            </Button>
          )}
          <Button variant="ghost" onClick={onDone}>
            Close
          </Button>
          <Button variant="primary" onClick={submit} disabled={!!error || pending}>
            <Clock className="size-4" />
            {pending ? "Scheduling…" : `Schedule for ${formatClock(at, true)}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] font-medium text-fg-primary">{item.headline}</p>
        <Field label="Release at (today, local time)" htmlFor="schedule-time" error={error ?? undefined}>
          <Input id="schedule-time" type="time" step={1} value={time} onChange={(e) => setTime(e.target.value)} className="w-40 font-mono" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 5, 10].map((m) => (
            <Button key={m} variant="secondary" size="sm" onClick={() => setTime(toTimeInput(now + m * 60_000))}>
              In {m} min
            </Button>
          ))}
          {roundEnds && roundEnds - 60_000 > now + 10_000 && (
            <Button variant="secondary" size="sm" onClick={() => setTime(toTimeInput(roundEnds - 60_000))}>
              1 min before the round ends
            </Button>
          )}
        </div>
        {!error && <p className="text-meta text-fg-secondary">In {formatDuration(Math.max(0, at - now))}{roundEnds && at > roundEnds ? ". That is after this round ends; it goes out between rounds unless you change it." : "."}</p>}
        <ul className="list-disc space-y-1 pl-5 text-caption text-fg-muted">
          <li>If the event is paused or trading is frozen at that time, the story waits and goes out as soon as it can. The planned time stays on record.</li>
          <li>Scheduled stories are taken out of the random pool, and must be at least 30 seconds apart.</li>
          {hold && <li className="text-warning">Right now {hold === "TRADING_FROZEN" ? "trading is frozen" : "the event is not live"}, so a due story would wait.</li>}
        </ul>
      </div>
    </DialogContent>
  );
}

/* ------------------------------------------------------------------ random news drawer */

const GAP_OPTIONS = [30, 60, 90, 120, 180, 300, 420, 600, 900, 1200, 1800, 3600];

function RandomNewsDrawer({ state, now, onDone }: { state: EventState; now: number; onDone: () => void }) {
  const eventId = state.event.id;
  const random = state.randomNews;
  const view = randomNewsView(state, now);
  const [minGap, setMinGap] = useState(random.minGapSeconds);
  const [maxGap, setMaxGap] = useState(random.maxGapSeconds);
  const [perRound, setPerRound] = useState(random.maxPerRound);
  const [scope, setScope] = useState(random.roundScope);
  const [unassigned, setUnassigned] = useState(random.includeUnassigned);
  const [pending, setPending] = useState(false);
  const [releasePick, setReleasePick] = useState(false);
  const changed = minGap !== random.minGapSeconds || maxGap !== random.maxGapSeconds || perRound !== random.maxPerRound || scope !== random.roundScope || unassigned !== random.includeUnassigned;
  const error = validateRandomSettings({ minGapSeconds: minGap, maxGapSeconds: maxGap, maxPerRound: perRound });
  const running = random.mode === "RANDOM" && random.status === "RUNNING";
  const on = random.mode === "RANDOM" && random.status !== "STOPPED";
  const last = lastNewsReleaseAt(state);
  const excluded = state.news.filter((n) => random.excludedNewsIds.includes(n.id) && n.status === "READY");
  const eligibleNames = view.eligibleCount;
  const round = currentRound(state);
  const gapOptions = (selected: number) => [...new Set([...GAP_OPTIONS, selected])].sort((a, b) => a - b).map((s) => ({ value: String(s), label: formatGapRange(s, s) }));

  const saveSettings = async () => {
    setPending(true);
    await hostAction(updateRandomNewsSettings(eventId, { minGapSeconds: minGap, maxGapSeconds: maxGap, maxPerRound: perRound, roundScope: scope, includeUnassigned: unassigned }), "Random news settings saved");
    setPending(false);
  };
  const toggle = async (next: boolean) => {
    if (changed && !error) await saveSettings();
    if (next) await hostAction(startRandomNews(eventId), "Random news on", "The next story is picked inside your gap.");
    else await hostAction(stopRandomNews(eventId), "Random news off", "Stories go out only when you release them.");
  };

  return (
    <DrawerContent
      title={
        <span className="flex items-center gap-2.5">
          <Shuffle className="size-5" aria-hidden />
          Random news
          <Badge tone={running ? "info" : on ? "warning" : "outline"} dot={on}>
            {running ? "Running" : random.status === "PAUSED" && on ? "Paused" : "Off"}
          </Badge>
          <span className="ml-auto">
            <Switch checked={on} onCheckedChange={toggle} label="Random news on or off" />
          </span>
        </span>
      }
      description="Releases Ready stories for you at unpredictable moments, so teams can't time the news. You can still release anything by hand."
      width="md"
      footer={
        <>
          {random.status === "RUNNING" && on && (
            <Button variant="secondary" onClick={() => hostAction(pauseRandomNews(eventId), "Random news paused", "The countdown is held.")}>
              <Pause className="size-4" /> Pause random news
            </Button>
          )}
          {random.status === "PAUSED" && on && (
            <Button variant="secondary" onClick={() => hostAction(resumeRandomNews(eventId), "Random news resumed")}>
              <Play className="size-4" /> Resume
            </Button>
          )}
          {running && view.scheduledItem && (
            <Button variant="ghost" onClick={() => setReleasePick(true)} disabled={state.event.status !== "LIVE"}>
              <Zap className="size-4" /> Release the pick now
            </Button>
          )}
          {running && view.scheduledItem && (
            <Button variant="ghost" onClick={() => hostAction(skipRandomNews(eventId), "Skipped the next pick", "A different story was picked.")}>
              <SkipForward className="size-4" /> Skip the next pick
            </Button>
          )}
          {changed ? (
            <Button variant="primary" className="ml-auto" onClick={saveSettings} disabled={!!error || pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          ) : (
            <Button variant="primary" className="ml-auto" onClick={onDone}>
              Done
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg bg-canvas-subtle p-4 text-[14px] text-fg-primary">
          <div className="flex flex-wrap items-center gap-2">
            Release one story every
            <Select size="sm" className="w-28" aria-label="Minimum gap" value={String(minGap)} onValueChange={(v) => setMinGap(Number(v))} options={gapOptions(minGap)} />
            to
            <Select size="sm" className="w-28" aria-label="Maximum gap" value={String(maxGap)} onValueChange={(v) => setMaxGap(Number(v))} options={gapOptions(maxGap)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            Pick from
            <Select
              size="sm"
              className="w-52"
              aria-label="Eligible round"
              value={scope}
              onValueChange={setScope}
              options={[{ value: "CURRENT", label: "the running round" }, ...state.rounds.filter((r) => r.type === "TRADING").map((r) => ({ value: r.id, label: `Round ${r.number} only` }))]}
            />
            <label className="flex items-center gap-2">
              <Switch checked={unassigned} onCheckedChange={setUnassigned} label="Include stories not assigned to a round" />
              and unassigned stories
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            Leave out
            {excluded.length === 0 ? (
              <span className="text-fg-muted">nothing (switch “May pick it” off on a story)</span>
            ) : (
              excluded.map((n) => (
                <span key={n.id} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-surface px-2 text-[13px]">
                  #{n.number} {n.headline.split(" ").slice(0, 2).join(" ")}
                  <button type="button" aria-label={`Let random news pick #${n.number} again`} onClick={() => hostAction(setRandomPoolMembership(eventId, n.id, true), `#${n.number} back in the random pool`)} className="text-fg-muted hover:text-fg-primary">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            Stop after
            <Select size="sm" className="w-20" aria-label="Stories per round" value={String(perRound)} onValueChange={(v) => setPerRound(Number(v))} options={[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))} />
            random stories in each round
          </div>
          {error && <p className="text-meta text-negative">{error}</p>}
        </div>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-h3 font-semibold text-fg-primary">What happens next</h3>
          <ul className="mt-2.5 flex flex-col gap-2.5 text-meta text-fg-secondary">
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
              <span>
                {!on
                  ? "Random news is off. Nothing goes out unless you release or schedule it."
                  : view.phase === "SCHEDULED" && view.nextReleaseAt
                    ? `Next random story in ${formatDuration(view.remainingMs ?? 0)}. The exact story stays hidden from teams.`
                    : view.message}
                {on && view.phase !== "SCHEDULED" && view.remainingMs !== null && ` Countdown held at ${formatDuration(view.remainingMs)}.`}
              </span>
            </li>
            <li className="flex gap-2.5">
              <Shuffle className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
              <span>
                {eligibleNames} {eligibleNames === 1 ? "story" : "stories"} can be picked right now{scheduledStories(state).length ? `; ${scheduledStories(state).length} scheduled by you ${scheduledStories(state).length === 1 ? "is" : "are"} left out` : ""}.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
              <span>
                Never within {formatGapRange(random.minGapSeconds, random.minGapSeconds)} of any release, including yours.{last ? ` The last one was at ${formatClock(last, true)}.` : ""}
              </span>
            </li>
            <li className="flex gap-2.5">
              <Zap className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
              <span>
                {view.releasedThisRound} of {random.maxPerRound} random stories used{round ? ` in ${round.type === "BRIEFING" ? "the briefing" : `Round ${round.number}`}` : ""}.
              </span>
            </li>
          </ul>
        </section>

        <section>
          <p className="eyebrow text-fg-muted">Good to know</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-meta text-fg-secondary">
            <li>Only you see which story is picked next{view.scheduledItem && on ? `: #${view.scheduledItem.number} ${view.scheduledItem.headline}` : ""}.</li>
            <li>Runs only while the event is live and a round is running. It holds during a pause or between rounds and resumes with the time it had left.</li>
            <li>It also pauses while trading is frozen, and resumes with the time it had left when you unfreeze. Both are recorded in the audit log.</li>
            <li>Only Ready stories are picked. Drafts, scheduled and released stories never are.</li>
          </ul>
        </section>
      </div>
      <ConfirmActionDialog
        open={releasePick}
        onOpenChange={setReleasePick}
        tier="confirm"
        title="Release the random pick now?"
        description={
          last !== null && now - last < random.minGapSeconds * 1000
            ? `The last story went out ${formatDuration(now - last)} ago, inside your minimum gap. Releasing now is a host override.`
            : "The picked story goes out now and the next one is picked inside your gap."
        }
        confirmLabel="Release now"
        onConfirm={({ idempotencyKey }) => hostAction(releaseRandomNewsNow(eventId, idempotencyKey), (release) => `Released: ${release.headline}`)}
      />
    </DrawerContent>
  );
}
