"use client";

import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, CandlestickChart, ExternalLink, Flag, GripVertical, Hourglass, KeyRound, Lock, Megaphone, Newspaper, Pin, Radio, Timer, TrendingUp, Trophy, Zap, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Switch } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { HelpText } from "@/components/ui/guidance";
import { CopyField } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProjectorStage, StageScaler } from "@/components/projector/projector-stage";
import { nextPendingRound } from "@/lib/domain/lifecycle";
import { activeTakeover, resolveProjectorScene, SCENE_LABEL } from "@/lib/domain/projector";
import type { EventState, ProjectorScene, ProjectorSceneSetting, ProjectorSettings } from "@/lib/domain/types";
import { formatClock, formatDuration } from "@/lib/format";
import { clearProjectorTakeover, pinProjectorScene, setLeaderboardVisibility, showLatestNewsOnProjector, showProjectorMessage, updateProjector } from "@/lib/mock/commands";
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

const SCENE_ICON: Record<ProjectorScene, LucideIcon> = {
  STANDBY: Hourglass,
  ROUND_STATUS: Timer,
  LEADERBOARD: Trophy,
  MARKET_BOARD: CandlestickChart,
  TOP_MOVERS: TrendingUp,
  NEWS_WALL: Newspaper,
  CUSTOM_MESSAGE: Megaphone,
  FINAL_RESULTS: Flag,
};

/**
 * C4 Projector Controller (section 18, frame 119:8003). A program/preview switcher: the left monitor is exactly what
 * the room sees; the right one shows the cued scene (or the next scene in rotation). Take (T) cuts the program to the
 * cued scene and holds it, Cut to standby (X), Breaking news (B) and Clear overlay (C). Settings stay secondary.
 */
export function DisplayScreen() {
  const { state, eventId } = useHostEvent();
  const now = useNow();
  const { projector } = state.event;
  const [origin, setOrigin] = useState("");
  const [cued, setCued] = useState<ProjectorScene | null>(null);
  const [breakingOpen, setBreakingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const value = window.location.origin;
    window.requestAnimationFrame(() => setOrigin(value));
  }, []);

  const url = `${origin}/event/${state.event.code}/projector?key=${projector.projectorKey}`;
  const joinUrl = `${origin.replace(/^https?:\/\//, "")}/join`;
  const resolution = resolveProjectorScene(state, now);
  const takeover = activeTakeover(state, now);
  const onAir = resolution.scene;
  const next = cued ?? resolution.nextScene;
  const latest = state.newsReleases.length > 0 ? [...state.newsReleases].sort((a, b) => b.releasedAt - a.releasedAt)[0] : null;
  const pinned = projector.pinnedScene;
  const completed = state.event.status === "COMPLETED";

  const take = () => {
    if (!next || next === onAir) return;
    void hostAction(pinProjectorScene(eventId, next), `On air: ${SCENE_LABEL[next]}`, "Held on screen. Resume auto-rotate when you're ready.");
    setCued(null);
  };
  const standby = () => hostAction(pinProjectorScene(eventId, "STANDBY"), "On air: Standby");
  const clear = () => takeover && hostAction(clearProjectorTakeover(eventId), "Overlay cleared");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      const k = e.key.toLowerCase();
      const actions: Record<string, (() => void) | undefined> = {
        t: take,
        x: () => void standby(),
        b: latest ? () => setBreakingOpen(true) : undefined,
        c: () => void clear(),
      };
      const action = actions[k];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onAirLabel = takeover ? (takeover.kind === "NEWS" ? "Breaking news" : "Message") : SCENE_LABEL[onAir];
  const onAirMeta = takeover
    ? takeover.remainingMs !== null
      ? `overlay · ${formatDuration(takeover.remainingMs)}`
      : "overlay · until cleared"
    : resolution.source === "PINNED"
      ? "held"
      : resolution.sceneRemainingMs !== null
        ? `on air · ${formatDuration(resolution.sceneRemainingMs)}`
        : "on air";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Projector controller</h1>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px_minmax(0,1fr)]">
        <Monitor tone="program" label={takeover ? "Program · overlay on air" : "Program · on air"} title={onAirLabel} meta={onAirMeta}>
          <ProjectorStage state={state} joinUrl={joinUrl} preview />
        </Monitor>

        <div className="flex flex-col gap-2.5 xl:pt-8">
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent px-2.5 text-caption font-semibold text-accent-fg">
              <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-current" /> ON AIR
            </span>
            <span className="text-[14px] font-medium text-fg-primary">{onAirLabel}</span>
          </div>
          <Button variant="primary" size="lg" onClick={take} disabled={!next || next === onAir || completed} shortcut="T">
            <ArrowRight className="size-4" /> Take{next && next !== onAir ? `: ${SCENE_LABEL[next]}` : ""}
          </Button>
          <Button variant="secondary" onClick={() => void standby()} disabled={onAir === "STANDBY" && pinned === "STANDBY"} shortcut="X">
            Cut to standby
          </Button>
          <Button variant="warning-outline" onClick={() => setBreakingOpen(true)} disabled={!latest || state.event.status === "DRAFT" || state.event.status === "READY"} shortcut="B">
            <Zap className="size-4" /> Breaking news…
          </Button>
          <Button variant="ghost" onClick={() => void clear()} disabled={!takeover} shortcut="C">
            Clear overlay
          </Button>
          <p className="text-center text-caption text-fg-muted">
            {pinned ? (
              <>
                Holding {SCENE_LABEL[pinned]} ·{" "}
                <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => hostAction(pinProjectorScene(eventId, null), "Auto-rotate resumed")}>
                  Resume auto-rotate
                </button>
              </>
            ) : resolution.nextScene && resolution.sceneRemainingMs !== null ? (
              `Auto-rotate on · next in ${formatDuration(resolution.sceneRemainingMs)}`
            ) : (
              "Auto-rotate on"
            )}
          </p>
        </div>

        <Monitor tone="preview" label={cued ? "Cued · press Take" : pinned ? "Next · rotation held" : "Next in rotation"} title={next ? SCENE_LABEL[next] : "Nothing next"} meta={cued ? "not on air" : !pinned && resolution.sceneRemainingMs !== null ? `auto · in ${formatDuration(resolution.sceneRemainingMs)}` : ""}>
          {next ? <ProjectorStage state={state} joinUrl={joinUrl} preview override={{ scene: next }} /> : <div className="grid h-full place-items-center text-[40px] text-white/40">No scene</div>}
        </Monitor>
      </div>

      <SceneTiles state={state} eventId={eventId} onAir={takeover ? null : onAir} next={next} cued={cued} onCue={(scene) => setCued(scene === cued || scene === onAir ? null : scene)} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader title="Overlays" subtitle="Sit on top of any scene" divider />
          <div className="flex flex-col gap-4 px-4 py-4">
            <label className="flex items-start gap-3">
              <Switch checked={projector.tickerEnabled} onCheckedChange={(v) => hostAction(updateProjector(eventId, { tickerEnabled: v }), v ? "Price ticker on" : "Price ticker off")} label="Price ticker" />
              <span>
                <span className="block text-[14px] font-medium text-fg-primary">Price ticker</span>
                <span className="block text-caption text-fg-muted">Bottom of every scene · {projector.tickerSpeed.toLowerCase()} speed</span>
              </span>
            </label>
            <div className="flex items-start gap-3">
              <Radio className="mt-0.5 size-4 text-fg-muted" aria-hidden />
              <span>
                <span className="block text-[14px] font-medium text-fg-primary">Breaking news takeover</span>
                <span className="block text-caption text-fg-muted">
                  Every released story takes over the screen for {projector.breakingNewsSeconds} s, with the round clock still visible.{latest ? ` Last: “${latest.headline}” at ${formatClock(latest.releasedAt)}.` : ""}
                </span>
              </span>
            </div>
          </div>
          <div className="border-t border-border">
            <MessageCard state={state} eventId={eventId} bare />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Projector settings"
            divider
            action={
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                Edit
              </Button>
            }
          />
          <dl className="flex flex-col gap-2 px-4 py-4 text-[14px]">
            {[
              ["Scenes in rotation", `${projector.scenes.filter((s) => s.enabled && s.scene !== "FINAL_RESULTS").length}`],
              ["Breaking takeover", `${projector.breakingNewsSeconds} s`],
              ["Ticker speed", projector.tickerSpeed.charAt(0) + projector.tickerSpeed.slice(1).toLowerCase()],
              ["Stage theme", projector.theme === "DARK" ? "Dark" : "Light"],
              ["Leaderboard on screen", state.event.leaderboard.projectorVisibility === "FULL" ? "Full" : state.event.leaderboard.projectorVisibility === "TOP_N" ? `Top ${state.event.leaderboard.projectorTopN}` : "Hidden"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{k}</dt>
                <dd className="font-medium text-fg-primary">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2 border-t border-border px-4 py-4">
            <CopyField value={url} label="projector link" />
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm", className: "self-start" })}>
              Open full screen <ExternalLink className="size-3.5" />
            </a>
          </div>
        </Card>
      </div>

      <ConfirmActionDialog
        open={breakingOpen}
        onOpenChange={setBreakingOpen}
        tier="confirm"
        tone="warning"
        title="Show breaking news on the projector?"
        description={latest ? `“${latest.headline}” takes over the screen for ${projector.breakingNewsSeconds} s. Nothing is released and no price moves; this only replays the latest story.` : "No story has been released yet."}
        confirmLabel="Show on projector"
        onConfirm={() => hostAction(showLatestNewsOnProjector(eventId), "Breaking news on the projector")}
      />
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        {settingsOpen && (
          <DrawerContent title="Projector settings" description="Every change reaches all open projector screens instantly." width="lg">
            <SettingsBody state={state} eventId={eventId} />
          </DrawerContent>
        )}
      </Dialog>
    </div>
  );
}

function Monitor({ tone, label, title, meta, children }: { tone: "program" | "preview"; label: string; title: string; meta: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={cn("overflow-hidden rounded-lg border-2 bg-surface", tone === "program" ? "border-accent" : "border-border")}>
      <header className="flex items-center gap-2.5 px-3 py-2">
        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-xs px-2 text-caption font-semibold", tone === "program" ? "bg-accent text-accent-fg" : "bg-canvas-subtle text-fg-secondary")}>
          {tone === "program" && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
          {label}
        </span>
        <span className="truncate text-[14px] font-medium text-fg-primary">{title}</span>
        <span className="ml-auto shrink-0 font-mono text-caption text-fg-muted">{meta}</span>
      </header>
      <StageScaler className="aspect-video w-full">{children}</StageScaler>
    </section>
  );
}

const LIVE_SCENES: ProjectorScene[] = ["LEADERBOARD", "TOP_MOVERS", "MARKET_BOARD", "ROUND_STATUS", "NEWS_WALL"];
const BETWEEN_SCENES: ProjectorScene[] = ["STANDBY", "CUSTOM_MESSAGE", "FINAL_RESULTS"];

function SceneTiles({ state, eventId, onAir, next, cued, onCue }: { state: EventState; eventId: string; onAir: ProjectorScene | null; next: ProjectorScene | null; cued: ProjectorScene | null; onCue: (scene: ProjectorScene) => void }) {
  const { projector, leaderboard } = state.event;
  const setting = (scene: ProjectorScene) => projector.scenes.find((s) => s.scene === scene);
  const patch = (scene: ProjectorScene, change: Partial<ProjectorSceneSetting>, message: string) =>
    hostAction(updateProjector(eventId, { scenes: projector.scenes.map((s) => (s.scene === scene ? { ...s, ...change } : s)) }), message);
  const completed = state.event.status === "COMPLETED";

  const tile = (scene: ProjectorScene) => {
    const s = setting(scene);
    if (!s) return null;
    const Icon = SCENE_ICON[scene];
    const locked = scene === "FINAL_RESULTS" && !completed;
    const isOnAir = onAir === scene;
    const isNext = !isOnAir && next === scene;
    const hidden = scene === "LEADERBOARD" && leaderboard.projectorVisibility === "HIDDEN";
    return (
      <li key={scene} className={cn("relative flex flex-col rounded-lg border p-3", isOnAir ? "border-accent bg-accent-soft" : cued === scene || isNext ? "border-accent/60 bg-surface" : "border-border bg-surface", locked && "opacity-60")}>
        <button type="button" disabled={locked} onClick={() => onCue(scene)} className="flex flex-1 flex-col items-start text-left focus-visible:outline-none" aria-label={`Cue ${SCENE_LABEL[scene]}`} aria-pressed={cued === scene}>
          <span className="flex w-full items-center justify-between">
            <Icon className={cn("size-5", isOnAir ? "text-accent-text" : "text-fg-secondary")} aria-hidden />
            {isOnAir ? <Badge tone="solid-accent">On air</Badge> : cued === scene ? <Badge tone="info">Cued</Badge> : isNext ? <Badge tone="outline">Next</Badge> : locked ? <Lock className="size-3.5 text-fg-muted" aria-hidden /> : null}
          </span>
          <span className="mt-2 text-[14px] font-medium text-fg-primary">{SCENE_LABEL[scene]}</span>
          <span className="text-caption text-fg-muted">{hidden ? "Leaderboard hidden" : SCENE_HINT[scene].split(" · ")[0]}</span>
        </button>
        <span className="mt-3 flex items-center justify-between gap-2">
          {locked ? (
            <span className="font-mono text-caption text-fg-muted">after event</span>
          ) : scene === "FINAL_RESULTS" ? (
            <span className="font-mono text-caption text-fg-muted">automatic</span>
          ) : (
            <DurationInput setting={s} onSave={(seconds) => patch(scene, { durationSeconds: seconds }, `${SCENE_LABEL[scene]} shows for ${seconds}s`)} />
          )}
          {scene !== "FINAL_RESULTS" && <Switch checked={s.enabled} onCheckedChange={(enabled) => patch(scene, { enabled }, `${SCENE_LABEL[scene]} ${enabled ? "added to" : "removed from"} rotation`)} label={`${SCENE_LABEL[scene]} in rotation`} />}
        </span>
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[5fr_3fr]">
      <div>
        <p className="eyebrow mb-2 text-fg-muted">During a round</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{LIVE_SCENES.map(tile)}</ul>
      </div>
      <div>
        <p className="eyebrow mb-2 text-fg-muted">Between rounds & event</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{BETWEEN_SCENES.map(tile)}</ul>
      </div>
    </div>
  );
}

function SettingsBody({ state, eventId }: { state: EventState; eventId: string }) {
  const { projector } = state.event;
  const [regenOpen, setRegenOpen] = useState(false);
  const save = (input: Parameters<typeof updateProjector>[1], message: string) => hostAction(updateProjector(eventId, input), message);
  return (
    <div className="flex flex-col gap-5">
      <SceneList state={state} eventId={eventId} />
      <LeaderboardVisibility state={state} eventId={eventId} />
      <Field label="Ticker speed">
        <SegmentedControl<ProjectorSettings["tickerSpeed"]>
          options={[
            { value: "SLOW", label: "Slow" },
            { value: "NORMAL", label: "Normal" },
            { value: "FAST", label: "Fast" },
          ]}
          value={projector.tickerSpeed}
          onChange={(v) => save({ tickerSpeed: v }, `Ticker speed: ${v.toLowerCase()}`)}
          label="Ticker speed"
          size="md"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Breaking news on screen for" htmlFor="breaking-seconds">
          <Select
            id="breaking-seconds"
            value={String(projector.breakingNewsSeconds)}
            onValueChange={(v) => save({ breakingNewsSeconds: Number(v) }, `Breaking news shows for ${v} seconds`)}
            options={[8, 10, 12, 15, 20, 30].map((s) => ({ value: String(s), label: `${s} seconds` }))}
          />
        </Field>
        <Field label="Stage theme">
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
      <div>
        <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)}>
          <KeyRound className="size-3.5" /> Regenerate projector link
        </Button>
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
                <span className="w-9 text-center text-[11px] font-semibold tracking-wide text-fg-muted uppercase">Auto</span>
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

function MessageCard({ state, eventId, bare = false }: { state: EventState; eventId: string; bare?: boolean }) {
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
    <Wrap bare={bare}>
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
    </Wrap>
  );
}

function Wrap({ bare, children }: { bare: boolean; children: ReactNode }) {
  return bare ? <div>{children}</div> : <Card>{children}</Card>;
}
