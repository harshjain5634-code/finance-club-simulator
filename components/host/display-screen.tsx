"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, KeyRound, Pin, PinOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Switch } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/field";
import { CopyField, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProjectorStage, SCENE_LABEL, StageScaler } from "@/components/projector/projector-stage";
import type { ProjectorLeaderboardVisibility, ProjectorScene, ProjectorSceneSetting } from "@/lib/domain/types";
import { setLeaderboardVisibility, updateProjector } from "@/lib/mock/commands";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";

export function DisplayScreen() {
  const { state, eventId } = useHostEvent();
  const { projector, leaderboard } = state.event;
  const [origin, setOrigin] = useState("");
  const [regenOpen, setRegenOpen] = useState(false);

  useEffect(() => {
    const value = window.location.origin;
    window.requestAnimationFrame(() => setOrigin(value));
  }, []);

  const url = `${origin}/event/${state.event.code}/projector?key=${projector.projectorKey}`;
  const saveScenes = (scenes: ProjectorSceneSetting[]) => hostAction(updateProjector(eventId, { scenes }), "Projector scenes updated");
  const move = (index: number, delta: number) => {
    const scenes = [...projector.scenes];
    const [item] = scenes.splice(index, 1);
    scenes.splice(index + delta, 0, item);
    void saveScenes(scenes);
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Projector"
        description="Configure the audience display. The projector needs no interaction once opened."
        actions={
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "primary" })}>
            Open projector
            <ExternalLink className="size-3.5" />
          </a>
        }
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex flex-col gap-3 xl:col-span-5">
          <Card>
            <CardHeader title="Projector link" subtitle="Anyone with this link can view the display (read-only)" divider />
            <div className="flex flex-col gap-3 px-4 py-4">
              <CopyField value={url} label="projector link" />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setRegenOpen(true)}>
                  <KeyRound className="size-3.5" /> Regenerate link
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Scenes"
              subtitle={projector.pinnedScene ? `Pinned: ${SCENE_LABEL[projector.pinnedScene]}` : "Rotating through enabled scenes"}
              divider
              action={
                projector.pinnedScene ? (
                  <Button variant="secondary" size="sm" onClick={() => hostAction(updateProjector(eventId, { pinnedScene: null }), "Projector returned to rotation")}>
                    <PinOff className="size-3.5" /> Resume rotation
                  </Button>
                ) : undefined
              }
            />
            <ul className="divide-y divide-border">
              {projector.scenes.map((setting, index) => (
                <li key={setting.scene} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", projector.pinnedScene === setting.scene && "bg-accent/6")}>
                  <Switch
                    checked={setting.enabled}
                    onCheckedChange={(enabled) => saveScenes(projector.scenes.map((s) => (s.scene === setting.scene ? { ...s, enabled } : s)))}
                    label={`Enable ${SCENE_LABEL[setting.scene]}`}
                  />
                  <span className="min-w-28 flex-1 text-[13px] font-medium text-fg-primary">
                    {SCENE_LABEL[setting.scene]}
                    {setting.scene === "FINAL_RESULTS" && <span className="block text-[11px] font-normal text-fg-muted">Shown automatically when the event ends</span>}
                    {setting.scene === "STANDBY" && <span className="block text-[11px] font-normal text-fg-muted">Before start and between rounds</span>}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      aria-label={`${SCENE_LABEL[setting.scene]} duration in seconds`}
                      inputMode="numeric"
                      defaultValue={setting.durationSeconds}
                      onBlur={(e) => {
                        const seconds = Math.min(120, Math.max(5, Number(e.target.value) || setting.durationSeconds));
                        if (seconds !== setting.durationSeconds) void saveScenes(projector.scenes.map((s) => (s.scene === setting.scene ? { ...s, durationSeconds: seconds } : s)));
                      }}
                      className="h-7 w-14 text-right"
                    />
                    <span className="text-xs text-fg-muted">s</span>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === projector.scenes.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button
                    variant={projector.pinnedScene === setting.scene ? "primary" : "secondary"}
                    size="xs"
                    onClick={() => hostAction(updateProjector(eventId, { pinnedScene: projector.pinnedScene === setting.scene ? null : (setting.scene as ProjectorScene) }), projector.pinnedScene === setting.scene ? "Projector returned to rotation" : `Projector pinned to ${SCENE_LABEL[setting.scene]}`)}
                  >
                    <Pin className="size-3" />
                    {projector.pinnedScene === setting.scene ? "Pinned" : "Pin"}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Display options" divider />
            <div className="flex flex-col gap-4 px-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Breaking news takeover (seconds)" htmlFor="breaking-seconds">
                  <Select
                    id="breaking-seconds"
                    value={String(projector.breakingNewsSeconds)}
                    onValueChange={(v) => hostAction(updateProjector(eventId, { breakingNewsSeconds: Number(v) }), `Takeover lasts ${v}s`)}
                    options={[8, 10, 12, 15, 20, 30].map((s) => ({ value: String(s), label: `${s} seconds` }))}
                  />
                </Field>
                <Field label="Bottom ticker">
                  <div className="flex h-8 items-center gap-2">
                    <Switch checked={projector.tickerEnabled} onCheckedChange={(v) => hostAction(updateProjector(eventId, { tickerEnabled: v }), v ? "Ticker shown" : "Ticker hidden")} label="Show ticker" />
                    <span className="text-xs text-fg-secondary">{projector.tickerEnabled ? "Shown" : "Hidden"}</span>
                  </div>
                </Field>
              </div>
              <Field label="Leaderboard on the projector">
                <SegmentedControl<ProjectorLeaderboardVisibility>
                  options={[{ value: "FULL", label: "All teams" }, { value: "TOP_N", label: `Top ${leaderboard.projectorTopN}` }, { value: "HIDDEN", label: "Hidden" }]}
                  value={leaderboard.projectorVisibility}
                  onChange={(v) => hostAction(setLeaderboardVisibility(eventId, { projectorVisibility: v }), "Projector leaderboard visibility updated")}
                  label="Projector leaderboard visibility"
                  size="md"
                />
              </Field>
              <Field label="Projector theme">
                <SegmentedControl
                  options={[{ value: "DARK", label: "Dark" }, { value: "LIGHT", label: "Light · preview" }]}
                  value={projector.theme}
                  onChange={(v) => hostAction(updateProjector(eventId, { theme: v }), `Projector theme: ${v.toLowerCase()}`)}
                  label="Projector theme"
                  size="md"
                />
              </Field>
            </div>
          </Card>
        </div>

        <Card className="xl:col-span-7">
          <CardHeader title="Live preview" subtitle="Exactly what the room sees, including breaking-news takeovers" divider action={<Badge tone="outline">16:9 · 1920×1080</Badge>} />
          <div className="p-4">
            <StageScaler className="aspect-video w-full rounded-md border border-border">
              <ProjectorStage state={state} joinUrl={`${origin.replace(/^https?:\/\//, "")}/join`} preview />
            </StageScaler>
          </div>
        </Card>
      </div>

      <ConfirmActionDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        tier="confirm"
        tone="warning"
        title="Regenerate the projector link?"
        description="Screens opened with the old link show an invalid-link message and must be reopened with the new link."
        confirmLabel="Regenerate link"
        onConfirm={() => hostAction(updateProjector(eventId, { regenerateKey: true }), "Projector link regenerated")}
      />
    </div>
  );
}
