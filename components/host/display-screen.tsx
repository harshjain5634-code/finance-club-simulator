"use client";

import { useEffect, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, GripVertical, KeyRound, Megaphone, Pin, Play, Radio, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Switch } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { HelpText } from "@/components/ui/guidance";
import { CopyField, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProjectorStage, StageScaler } from "@/components/projector/projector-stage";
import { nextPendingRound } from "@/lib/domain/lifecycle";
import { activeTakeover, resolveProjectorScene, SCENE_LABEL } from "@/lib/domain/projector";
import type { EventState, ProjectorScene, ProjectorSceneSetting, ProjectorSettings } from "@/lib/domain/types";
import { formatDuration } from "@/lib/format";
import { clearProjectorTakeover, pinProjectorScene, setLeaderboardVisibility, showLatestNewsOnProjector, showProjectorMessage, stepProjectorScene, updateProjector } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";

const SCENE_HINT: Record<ProjectorScene, string> = {
  STANDBY: "Join code and event info · only before start and between rounds",
  ROUND_STATUS: "Round timer, schedule and trading state",
  LEADERBOARD: "Standings ranked by return %",
  MARKET_BOARD: "Every stock with price, change and trend",
  TOP_MOVERS: "Biggest gainers and losers this round",
  NEWS_WALL: "Latest story with price reactions and recent headlines",
  CUSTOM_MESSAGE: "Your saved custom message, shown as part of the rotation",
  FINAL_RESULTS: "Shown automatically when the event ends",
};

export function DisplayScreen() {
  const { state, eventId } = useHostEvent();
  const { projector } = state.event;
  const [origin, setOrigin] = useState("");
  const [regenOpen, setRegenOpen] = useState(false);

  useEffect(() => {
    const value = window.location.origin;
    window.requestAnimationFrame(() => setOrigin(value));
  }, []);

  const url = `${origin}/event/${state.event.code}/projector?key=${projector.projectorKey}`;
  const save = (input: Parameters<typeof updateProjector>[1], message: string) => hostAction(updateProjector(eventId, input), message);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Projector"
        description="Control what the room sees. Every change reaches all open projector screens instantly."
        actions={
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "primary" })}>
            Open full screen
            <ExternalLink className="size-3.5" />
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <Card>
            <CardHeader title="Live preview" subtitle="Exactly what the room sees right now" divider action={<Badge tone="outline">16:9</Badge>} />
            <div className="flex flex-col gap-3 p-4">
              <StageScaler className="aspect-video w-full rounded-md border border-border">
                <ProjectorStage state={state} joinUrl={`${origin.replace(/^https?:\/\//, "")}/join`} preview />
              </StageScaler>
              <PreviewControls state={state} eventId={eventId} url={url} />
            </div>
          </Card>
          <SceneList state={state} eventId={eventId} />
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <MessageCard state={state} eventId={eventId} />

          <Card>
            <CardHeader title="Display options" divider />
            <div className="flex flex-col gap-4 px-4 py-4">
              <LeaderboardVisibility state={state} eventId={eventId} />
              <Field label="Price ticker" hint="The scrolling price strip along the bottom of the screen.">
                <div className="flex flex-wrap items-center gap-3">
                  <Switch checked={projector.tickerEnabled} onCheckedChange={(v) => save({ tickerEnabled: v }, v ? "Ticker shown" : "Ticker hidden")} label="Show price ticker" />
                  <SegmentedControl<ProjectorSettings["tickerSpeed"]>
                    options={[
                      { value: "SLOW", label: "Slow", disabled: !projector.tickerEnabled },
                      { value: "NORMAL", label: "Normal", disabled: !projector.tickerEnabled },
                      { value: "FAST", label: "Fast", disabled: !projector.tickerEnabled },
                    ]}
                    value={projector.tickerSpeed}
                    onChange={(v) => save({ tickerSpeed: v }, `Ticker speed: ${v.toLowerCase()}`)}
                    label="Ticker speed"
                    size="md"
                  />
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Breaking news on screen for" htmlFor="breaking-seconds">
                  <Select
                    id="breaking-seconds"
                    value={String(projector.breakingNewsSeconds)}
                    onValueChange={(v) => save({ breakingNewsSeconds: Number(v) }, `Breaking news shows for ${v} seconds`)}
                    options={[8, 10, 12, 15, 20, 30].map((s) => ({ value: String(s), label: `${s} seconds` }))}
                  />
                </Field>
                <Field label="Theme">
                  <SegmentedControl
                    options={[
                      { value: "DARK", label: "Dark" },
                      { value: "LIGHT", label: "Light" },
                    ]}
                    value={projector.theme}
                    onChange={(v) => save({ theme: v }, `Projector theme: ${v.toLowerCase()}`)}
                    label="Projector theme"
                    size="md"
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Projector link" subtitle="Read-only. Open it on the computer connected to the projector." divider />
            <div className="flex flex-col gap-3 px-4 py-4">
              <CopyField value={url} label="projector link" />
              <div>
                <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)}>
                  <KeyRound className="size-3.5" /> Regenerate link
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmActionDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        tier="confirm"
        tone="warning"
        title="Regenerate the projector link?"
        description="Screens opened with the old link show an invalid-link message and must be reopened with the new link."
        confirmLabel="Regenerate link"
        onConfirm={() => save({ regenerateKey: true }, "Projector link regenerated")}
      />
    </div>
  );
}

/* ───────── Preview controls ───────── */

function PreviewControls({ state, eventId, url }: { state: EventState; eventId: string; url: string }) {
  const now = useNow();
  const resolution = resolveProjectorScene(state, now);
  const takeover = activeTakeover(state, now);
  const pinned = state.event.projector.pinnedScene;
  const hasNews = state.newsReleases.length > 0;
  const canStep = resolution.rotation.length > 0;

  let status: string;
  if (takeover?.kind === "NEWS") status = `Breaking news on screen · ${formatDuration(takeover.remainingMs)} left`;
  else if (takeover?.kind === "MESSAGE") status = `Message on screen · ${takeover.remainingMs === null ? "until you clear it" : `${formatDuration(takeover.remainingMs)} left`}`;
  else if (resolution.source === "PINNED") status = `${SCENE_LABEL[resolution.scene]} · pinned`;
  else if (resolution.source === "FORCED")
    status =
      resolution.scene === "FINAL_RESULTS"
        ? "Final results · the event has ended"
        : resolution.scene === "STANDBY"
          ? "Standby · rotation starts when the event goes live"
          : `${SCENE_LABEL[resolution.scene]} · no scenes enabled for rotation`;
  else status = `${SCENE_LABEL[resolution.scene]} · ${formatDuration(resolution.sceneRemainingMs ?? 0)} left${resolution.nextScene ? ` · next: ${SCENE_LABEL[resolution.nextScene]}` : ""}`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase", takeover ? "bg-warning/15 text-warning" : pinned ? "bg-accent/15 text-accent" : "bg-surface-hover text-fg-secondary")}>
          <Radio className="size-3" />
          {takeover ? "Overlay" : pinned ? "Pinned" : resolution.source === "FORCED" ? "Automatic" : "Rotating"}
        </span>
        <span className="font-medium text-fg-primary tabular-nums" aria-live="polite">
          Now showing: {status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={!canStep} onClick={() => hostAction(stepProjectorScene(eventId, -1), (scene) => `Projector: ${SCENE_LABEL[scene]}`)}>
          <ChevronLeft className="size-3.5" /> Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!canStep} onClick={() => hostAction(stepProjectorScene(eventId, 1), (scene) => `Projector: ${SCENE_LABEL[scene]}`)}>
          Next <ChevronRight className="size-3.5" />
        </Button>
        {pinned ? (
          <Button variant="primary" size="sm" onClick={() => hostAction(pinProjectorScene(eventId, null), "Rotation resumed")}>
            <Play className="size-3.5" /> Resume rotation
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => hostAction(pinProjectorScene(eventId, resolution.scene), `Pinned ${SCENE_LABEL[resolution.scene]}`)}>
            <Pin className="size-3.5" /> Pin current
          </Button>
        )}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <Button variant="warning-outline" size="sm" disabled={!hasNews} title={hasNews ? undefined : "No news released yet"} onClick={() => hostAction(showLatestNewsOnProjector(eventId), "Latest news shown as breaking news")}>
          <Megaphone className="size-3.5" /> Show breaking news
        </Button>
        {takeover && (
          <Button variant="ghost" size="sm" onClick={() => hostAction(clearProjectorTakeover(eventId), "Overlay cleared")}>
            <X className="size-3.5" /> Clear overlay
          </Button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ghost", size: "sm", className: "sm:ml-auto" })}>
          Open full screen <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

/* ───────── Scenes ───────── */

function SceneList({ state, eventId }: { state: EventState; eventId: string }) {
  const now = useNow();
  const { projector, leaderboard } = state.event;
  const resolution = resolveProjectorScene(state, now);
  const [dragHandle, setDragHandle] = useState<ProjectorScene | null>(null);
  const [dragging, setDragging] = useState<ProjectorScene | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const saveScenes = (scenes: ProjectorSceneSetting[], message = "Scenes updated") => hostAction(updateProjector(eventId, { scenes }), message);
  const moveTo = (scene: ProjectorScene, target: number) => {
    const scenes = [...projector.scenes];
    const from = scenes.findIndex((s) => s.scene === scene);
    if (from === -1 || from === target) return;
    const [item] = scenes.splice(from, 1);
    scenes.splice(target, 0, item);
    void saveScenes(scenes, "Scene order updated");
  };
  const patch = (scene: ProjectorScene, change: Partial<ProjectorSceneSetting>, message: string) => saveScenes(projector.scenes.map((s) => (s.scene === scene ? { ...s, ...change } : s)), message);
  const endDrag = () => {
    setDragging(null);
    setDragHandle(null);
    setOverIndex(null);
  };

  return (
    <Card>
      <CardHeader title="Scenes" subtitle="Drag to reorder. Enabled scenes rotate in this order for their set duration." divider />
      <ol className="divide-y divide-border">
        {projector.scenes.map((setting, index) => {
          const onScreen = resolution.scene === setting.scene;
          const isPinned = projector.pinnedScene === setting.scene;
          const automatic = setting.scene === "FINAL_RESULTS";
          const hiddenByLeaderboard = setting.scene === "LEADERBOARD" && leaderboard.projectorVisibility === "HIDDEN";
          return (
            <li
              key={setting.scene}
              draggable={dragHandle === setting.scene}
              onDragStart={(e: DragEvent<HTMLLIElement>) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", setting.scene);
                setDragging(setting.scene);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                if (overIndex !== index) setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) moveTo(dragging, index);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={cn(
                "relative flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors",
                onScreen && "bg-accent/6",
                dragging === setting.scene && "opacity-50",
                overIndex === index && dragging && dragging !== setting.scene && "shadow-[inset_0_2px_0_0_var(--color-accent)]",
              )}
            >
              <button
                type="button"
                aria-label={`Drag to reorder ${SCENE_LABEL[setting.scene]}`}
                onPointerDown={() => setDragHandle(setting.scene)}
                onPointerUp={() => setDragHandle(null)}
                className="-ml-1 grid size-7 cursor-grab touch-none place-items-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg-primary active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </button>
              {automatic ? (
                <span className="w-9 text-center text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Auto</span>
              ) : (
                <Switch checked={setting.enabled} onCheckedChange={(enabled) => patch(setting.scene, { enabled }, `${SCENE_LABEL[setting.scene]} ${enabled ? "added to" : "removed from"} rotation`)} label={`Show ${SCENE_LABEL[setting.scene]} in rotation`} />
              )}
              <span className="min-w-40 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg-primary">
                  {SCENE_LABEL[setting.scene]}
                  {onScreen && (
                    <Badge tone="accent" dot>
                      On screen
                    </Badge>
                  )}
                  {!onScreen && resolution.nextScene === setting.scene && resolution.source === "ROTATION" && <Badge tone="outline">Next</Badge>}
                  {isPinned && <Badge tone="solid">Pinned</Badge>}
                </span>
                <span className="block text-[11px] text-fg-muted">{hiddenByLeaderboard ? "Skipped — leaderboard is hidden on the projector" : SCENE_HINT[setting.scene]}</span>
              </span>
              {!automatic && <DurationInput setting={setting} onSave={(seconds) => patch(setting.scene, { durationSeconds: seconds }, `${SCENE_LABEL[setting.scene]} shows for ${seconds}s`)} />}
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${SCENE_LABEL[setting.scene]} up`} disabled={index === 0} onClick={() => moveTo(setting.scene, index - 1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${SCENE_LABEL[setting.scene]} down`} disabled={index === projector.scenes.length - 1} onClick={() => moveTo(setting.scene, index + 1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
              <Button
                variant={isPinned ? "primary" : "secondary"}
                size="xs"
                className="w-[74px]"
                aria-pressed={isPinned}
                onClick={() => hostAction(pinProjectorScene(eventId, isPinned ? null : setting.scene), isPinned ? "Rotation resumed" : `Pinned ${SCENE_LABEL[setting.scene]}`)}
              >
                <Pin className="size-3" />
                {isPinned ? "Unpin" : "Pin"}
              </Button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function DurationInput({ setting, onSave }: { setting: ProjectorSceneSetting; onSave: (seconds: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{SCENE_LABEL[setting.scene]} duration in seconds</span>
      <Input
        key={setting.durationSeconds}
        inputMode="numeric"
        defaultValue={setting.durationSeconds}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const seconds = Math.min(300, Math.max(5, Math.round(Number(e.target.value)) || setting.durationSeconds));
          e.target.value = String(seconds);
          if (seconds !== setting.durationSeconds) onSave(seconds);
        }}
        className="h-7 w-14 text-right tabular-nums"
      />
      <span className="text-xs text-fg-muted">sec</span>
    </label>
  );
}

/* ───────── Leaderboard visibility ───────── */

function LeaderboardVisibility({ state, eventId }: { state: EventState; eventId: string }) {
  const { projectorVisibility, projectorTopN } = state.event.leaderboard;
  const value = projectorVisibility === "FULL" ? "FULL" : projectorVisibility === "HIDDEN" ? "HIDDEN" : `TOP_${projectorTopN}`;
  const options = [
    { value: "FULL", label: "All teams" },
    { value: "TOP_10", label: "Top 10" },
    { value: "TOP_5", label: "Top 5" },
    ...(projectorVisibility === "TOP_N" && projectorTopN !== 10 && projectorTopN !== 5 ? [{ value: `TOP_${projectorTopN}`, label: `Top ${projectorTopN}` }] : []),
    { value: "HIDDEN", label: "Hidden" },
  ];
  return (
    <Field label="Leaderboard on the projector" hint={projectorVisibility === "HIDDEN" ? "The leaderboard scene is skipped while hidden." : undefined}>
      <SegmentedControl
        options={options}
        value={value}
        onChange={(v) => {
          const next = v === "FULL" || v === "HIDDEN" ? { projectorVisibility: v as "FULL" | "HIDDEN" } : { projectorVisibility: "TOP_N" as const, projectorTopN: Number(v.slice(4)) };
          void hostAction(setLeaderboardVisibility(eventId, next), next.projectorVisibility === "TOP_N" ? `Projector shows the top ${next.projectorTopN}` : next.projectorVisibility === "HIDDEN" ? "Leaderboard hidden on the projector" : "Projector shows all teams");
        }}
        label="Projector leaderboard visibility"
        size="md"
        className="flex-wrap"
      />
    </Field>
  );
}

/* ───────── Custom message ───────── */

const MESSAGE_DURATIONS = [
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "1 minute" },
  { value: "120", label: "2 minutes" },
  { value: "300", label: "5 minutes" },
  { value: "UNTIL_CLEARED", label: "Until I clear it" },
];

function MessageCard({ state, eventId }: { state: EventState; eventId: string }) {
  const saved = state.event.projector.customMessage;
  const [title, setTitle] = useState(saved.title);
  const [body, setBody] = useState(saved.body);
  const [duration, setDuration] = useState("60");
  const next = nextPendingRound(state);
  const presets = [
    next ? { title: `Round ${next.number} begins in 2 minutes`, body: `${next.name} · check the latest news and get your trades ready.` } : { title: "Final results coming up", body: "Thank you for trading with us." },
    { title: "Trading is paused", body: "Please stand by — the host will resume trading shortly." },
    { title: "Please return to your seats", body: "The next session is about to begin." },
  ];
  const valid = title.trim().length >= 2;

  return (
    <Card>
      <CardHeader title="Custom message" subtitle="Show an announcement over the current scene" divider icon={<Megaphone className="size-4" />} />
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex flex-wrap gap-1.5" aria-label="Message templates">
          {presets.map((preset) => (
            <button
              key={preset.title}
              type="button"
              onClick={() => {
                setTitle(preset.title);
                setBody(preset.body);
              }}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-secondary transition-colors hover:border-border-strong hover:text-fg-primary"
            >
              {preset.title}
            </button>
          ))}
        </div>
        <Field label="Headline" htmlFor="projector-message-title">
          <Input id="projector-message-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Round 2 begins in 2 minutes" />
        </Field>
        <Field label="Details (optional)" htmlFor="projector-message-body">
          <Textarea id="projector-message-body" value={body} maxLength={160} rows={2} onChange={(e) => setBody(e.target.value)} placeholder="Check the latest news and get your trades ready." />
        </Field>
        <Field label="Keep on screen for" htmlFor="projector-message-duration">
          <Select id="projector-message-duration" value={duration} onValueChange={setDuration} options={MESSAGE_DURATIONS} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!valid}
            onClick={() => hostAction(showProjectorMessage(eventId, { title, body, durationSeconds: duration === "UNTIL_CLEARED" ? null : Number(duration) }), "Message is on the projector")}
          >
            <Megaphone className="size-3.5" /> Show on projector
          </Button>
          <Button variant="ghost" size="sm" disabled={!valid || (title.trim() === saved.title && body.trim() === saved.body)} onClick={() => hostAction(updateProjector(eventId, { customMessage: { title: title.trim(), body: body.trim() } }), "Saved for the Custom message scene")}>
            Save for rotation
          </Button>
        </div>
        <HelpText>“Save for rotation” updates the Custom message scene without interrupting the screen.</HelpText>
      </div>
    </Card>
  );
}
