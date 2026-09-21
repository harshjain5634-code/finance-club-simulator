"use client";

import { useState } from "react";
import { CalendarClock, Eye, Newspaper, Pencil, Plus, SkipForward, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Switch, Tooltip } from "@/components/ui/controls";
import { Delta } from "@/components/ui/delta";
import { Dialog } from "@/components/ui/dialog";
import { StatePanel } from "@/components/ui/guidance";
import { PageHeader } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewsStatusBadge } from "@/components/market/status";
import { BeforeAfter, ImpactLabel } from "@/components/market/widgets";
import { formatPct } from "@/lib/domain/money";
import { CLAMP_LABEL } from "@/lib/domain/prices";
import { randomNewsView } from "@/lib/domain/random-news";
import type { EventState, NewsItem } from "@/lib/domain/types";
import { formatClock, formatDuration } from "@/lib/format";
import { releaseRandomNewsNow, setRandomPoolMembership, skipNews, skipRandomNews } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { describeActor, instrumentOf, releasesNewestFirst } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";
import { NewsEditor } from "./market-screens";
import { NewsControlPanel, StoryImpacts } from "./news-control";
import { ReleaseNewsDialog } from "./news-release-dialog";

export function NewsDeskScreen() {
  const { state } = useHostEvent();
  const now = useNow();
  const [editing, setEditing] = useState<NewsItem | "new" | null>(null);
  const [releaseItem, setReleaseItem] = useState<NewsItem | null>(null);
  const [skipItem, setSkipItem] = useState<NewsItem | null>(null);
  const [roundFilter, setRoundFilter] = useState("ALL");
  const random = state.randomNews;
  const view = randomNewsView(state, now);

  const ready = state.news
    .filter((n) => n.status === "READY" || n.status === "DRAFT")
    .filter((n) => roundFilter === "ALL" || n.roundId === roundFilter || (roundFilter === "ANY" && n.roundId === null))
    .sort((a, b) => (a.roundId ?? "").localeCompare(b.roundId ?? "") || a.number - b.number);
  const releases = releasesNewestFirst(state);
  const skipped = state.news.filter((n) => n.status === "SKIPPED");
  const scheduledCount = random.mode === "RANDOM" && view.scheduledItem && random.status !== "STOPPED" ? 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="News"
        description="Prepare stories, then release them yourself or let random mode pick them at safe intervals."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" /> New story
          </Button>
        }
      />

      <NewsControlPanel state={state} variant="desk" />

      <Card>
        <Tabs defaultValue="ready">
          <TabsList>
            <TabsTrigger value="ready" count={ready.length}>
              Ready
            </TabsTrigger>
            <TabsTrigger value="scheduled" count={scheduledCount}>
              Scheduled
            </TabsTrigger>
            <TabsTrigger value="released" count={releases.length}>
              Released
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ready">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <Select
                size="sm"
                className="w-56"
                aria-label="Filter by round"
                value={roundFilter}
                onValueChange={setRoundFilter}
                options={[{ value: "ALL", label: "All rounds" }, ...state.rounds.map((r) => ({ value: r.id, label: `R${r.number} · ${r.name}` })), { value: "ANY", label: "Any round (unassigned)" }]}
              />
              <span className="ml-auto text-xs text-fg-muted">Click a story to preview it. Drafts can&apos;t be released until marked Ready.</span>
            </div>
            {ready.length === 0 ? (
              <StatePanel size="sm" icon={<Newspaper className="size-4" />} title="No stories waiting" description="Create a story or check the Released tab." />
            ) : (
              <ul className="divide-y divide-border">
                {ready.map((item) => (
                  <StoryRow
                    key={item.id}
                    state={state}
                    item={item}
                    onPreview={() => setReleaseItem(item)}
                    onEdit={() => setEditing(item)}
                    onSkip={() => setSkipItem(item)}
                    scheduled={random.scheduledNewsId === item.id && random.status !== "STOPPED"}
                  />
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="scheduled">
            {scheduledCount && view.scheduledItem ? (
              <div className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-accent/30 bg-accent/6 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
                      <CalendarClock className="size-3.5" /> Random release
                    </p>
                    <p className="mt-1 text-[15px] font-semibold text-fg-primary">
                      <span className="mr-1.5 font-mono text-xs font-normal text-fg-muted">#{view.scheduledItem.number}</span>
                      {view.scheduledItem.headline}
                    </p>
                    <StoryImpacts state={state} item={view.scheduledItem} className="mt-1.5" />
                  </div>
                  <div className="text-right">
                    {view.phase === "SCHEDULED" && view.nextReleaseAt ? (
                      <>
                        <p className="font-mono text-2xl font-semibold text-fg-primary tabular-nums">{formatDuration(view.remainingMs ?? 0)}</p>
                        <p className="text-xs text-fg-muted tabular-nums">at {formatClock(view.nextReleaseAt, true)}</p>
                      </>
                    ) : (
                      <p className="text-[13px] text-warning">{view.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => hostAction(releaseRandomNewsNow(state.event.id), (r) => `Released: ${r.headline}`)} disabled={state.event.status !== "LIVE" || random.status !== "RUNNING"}>
                    <Zap className="size-3.5" /> Release now
                  </Button>
                  <Button variant="secondary" onClick={() => hostAction(skipRandomNews(state.event.id), "Scheduled story skipped")} disabled={random.status !== "RUNNING"}>
                    <SkipForward className="size-3.5" /> Skip this story
                  </Button>
                </div>
              </div>
            ) : (
              <StatePanel
                size="sm"
                icon={<CalendarClock className="size-4" />}
                title="Nothing scheduled"
                description={random.mode === "MANUAL" ? "Switch the release mode to Random above to let the scheduler pick stories automatically." : view.message}
              />
            )}
            {random.log.length > 0 && (
              <div className="border-t border-border">
                <p className="px-4 pt-3 text-[11px] font-medium tracking-wide text-fg-muted uppercase">Random schedule log</p>
                <ul className="divide-y divide-border px-4 pb-2">
                  {[...random.log]
                    .reverse()
                    .slice(0, 12)
                    .map((entry) => {
                      const item = state.news.find((n) => n.id === entry.newsItemId);
                      return (
                        <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-xs">
                          <Badge tone={entry.outcome === "SKIPPED" ? "outline" : "accent"}>{entry.outcome === "RELEASED" ? "Released" : entry.outcome === "RELEASED_EARLY" ? "Released early" : "Skipped"}</Badge>
                          <span className="min-w-0 flex-1 truncate text-fg-primary">
                            #{item?.number} {item?.headline}
                          </span>
                          <span className="text-fg-muted tabular-nums">
                            scheduled {formatClock(entry.scheduledFor, true)} · {entry.outcome === "SKIPPED" ? "skipped" : "released"} {formatClock(entry.at, true)}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="released">
            {releases.length === 0 ? (
              <StatePanel size="sm" icon={<Newspaper className="size-4" />} title="Nothing released yet" />
            ) : (
              <ul className="divide-y divide-border">
                {releases.map((release) => (
                  <li key={release.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <span className="font-medium text-fg-secondary tabular-nums">{formatClock(release.releasedAt, true)}</span>
                      <Badge tone={release.source === "RANDOM" ? "accent" : "neutral"}>{release.source === "RANDOM" ? "Random" : "Manual"}</Badge>
                      {release.scheduledFor !== null && <span className="tabular-nums">scheduled {formatClock(release.scheduledFor, true)}</span>}
                      <span>· {state.rounds.find((r) => r.id === release.roundId)?.name ?? "Pre-round"}</span>
                      <span>· {describeActor(state, release.releasedBy)}</span>
                    </div>
                    <p className="mt-1 text-[14px] font-semibold text-fg-primary">{release.headline}</p>
                    {release.impacts.length > 0 && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[560px] text-xs">
                          <thead>
                            <tr className="text-[11px] tracking-wide text-fg-muted uppercase">
                              <th className="py-1 text-left font-medium">Stock</th>
                              <th className="py-1 text-left font-medium">Configured</th>
                              <th className="py-1 text-right font-medium">Resolved</th>
                              <th className="py-1 text-right font-medium">Applied</th>
                              <th className="py-1 text-right font-medium">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {release.impacts.map((i) => (
                              <tr key={i.instrumentId} className="border-t border-border/60">
                                <td className="py-1 font-medium text-fg-primary">{instrumentOf(state, i.instrumentId)?.symbol}</td>
                                <td className="py-1">
                                  <ImpactLabel configured={i.configured} />
                                </td>
                                <td className="py-1 text-right font-mono tabular-nums">{formatPct(i.resolvedPct)}</td>
                                <td className="py-1 text-right">
                                  <Delta value={i.appliedPct} className="text-xs" />
                                  {i.clamped && (
                                    <Badge tone="warning" className="ml-1.5">
                                      {i.clampReasons.map((r) => CLAMP_LABEL[r]).join(", ")}
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-1 text-right">
                                  <BeforeAfter before={i.previousPrice} after={i.newPrice} className="justify-end text-xs" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {skipped.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <p className="text-[11px] font-medium tracking-wide text-fg-muted uppercase">Skipped stories</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-fg-secondary">
                  {skipped.map((item) => (
                    <li key={item.id}>
                      <span className="mr-1.5 font-mono text-xs text-fg-muted">#{item.number}</span>
                      {item.headline}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null && <NewsEditor key={editing === "new" ? "new" : editing.id} state={state} item={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <ReleaseNewsDialog state={state} item={releaseItem} onClose={() => setReleaseItem(null)} />
      <ConfirmActionDialog
        open={skipItem !== null}
        onOpenChange={(open) => !open && setSkipItem(null)}
        tier="confirm"
        title={`Skip story #${skipItem?.number}?`}
        description="Skipped stories stay on record but can no longer be released, manually or randomly."
        confirmLabel="Skip story"
        onConfirm={() => hostAction(skipNews(state.event.id, skipItem!.id), `Story #${skipItem!.number} skipped`)}
      />
    </div>
  );
}

function StoryRow({ state, item, onPreview, onEdit, onSkip, scheduled }: { state: EventState; item: NewsItem; onPreview: () => void; onEdit: () => void; onSkip: () => void; scheduled: boolean }) {
  const live = state.event.status === "LIVE" || state.event.status === "PAUSED";
  const round = state.rounds.find((r) => r.id === item.roundId);
  const inPool = !state.randomNews.excludedNewsIds.includes(item.id);
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 hover:bg-surface-hover/50", scheduled && "bg-accent/5")}>
      <button type="button" onClick={onPreview} className="min-w-0 flex-1 basis-80 text-left" aria-label={`Preview story ${item.number}`}>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-muted">#{item.number}</span>
          <span className="truncate text-[13px] font-medium text-fg-primary">{item.headline}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-xs text-fg-muted">{round ? `R${round.number} · ${round.name}` : "Any round"}</span>
          <StoryImpacts state={state} item={item} />
        </span>
      </button>
      <div className="flex items-center gap-2">
        {scheduled && <Badge tone="accent">Scheduled</Badge>}
        <NewsStatusBadge status={item.status} />
        {state.randomNews.mode === "RANDOM" && (
          <Tooltip content={inPool ? "Random mode may pick this story" : "Random mode will never pick this story"}>
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Switch checked={inPool} onCheckedChange={(included) => hostAction(setRandomPoolMembership(state.event.id, item.id, included), included ? `#${item.number} added to random pool` : `#${item.number} removed from random pool`)} label={`Include story ${item.number} in the random pool`} />
              Pool
            </span>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" onClick={onPreview} disabled={item.status !== "READY" || !live}>
          <Zap className="size-3.5" /> Release
        </Button>
        <Tooltip content="Preview">
          <Button variant="ghost" size="icon-sm" onClick={onPreview} aria-label={`Preview story ${item.number}`}>
            <Eye className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content="Edit">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit story ${item.number}`}>
            <Pencil className="size-3.5" />
          </Button>
        </Tooltip>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </li>
  );
}
