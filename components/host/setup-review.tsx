"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setupIssues, stepStatus, type SetupStepId } from "@/lib/domain/setup-checks";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hostBase, useHostEvent } from "./host-context";
import { useHostCommands } from "./host-commands";
import { SETUP_STEPS } from "./setup-frame";

/** C4 "Review and go live" (frame 110:7530): every check in one list, must-fix first, and the go-live sequence. */
export function SetupReviewScreen() {
  const { state, eventId } = useHostEvent();
  const { available, run } = useHostCommands();
  const base = hostBase(eventId);
  const issues = setupIssues(state);
  const mustFix = issues.filter((i) => i.level === "MUST_FIX");
  const notes = issues.filter((i) => i.level === "NOTE");
  const stepFor = (id: SetupStepId) => SETUP_STEPS.find((s) => s.id === id)!;
  const setup = state.event.status === "DRAFT" || state.event.status === "READY";
  const first = [...state.rounds].sort((a, b) => a.number - b.number)[0];
  const trading = state.rounds.filter((r) => r.type === "TRADING");

  const download = () => {
    // Setup snapshot for backup. Team PINs are deliberately left out.
    const snapshot = {
      exportedAt: new Date().toISOString(),
      event: { name: state.event.name, code: state.event.code, scheduledDate: state.event.scheduledDate, rules: state.event.rules, capitalRule: state.event.capitalRule, defaultStartingCash: state.event.defaultStartingCash, leaderboard: { ...state.event.leaderboard, frozenRows: null } },
      instruments: state.instruments.map((i) => ({ ...i, history: undefined })),
      rounds: state.rounds,
      news: state.news,
      teams: state.teams.map((t) => ({ id: t.id, name: t.name, loginCode: t.loginCode, startingCash: t.startingCash, status: t.status })),
      allocations: state.allocationPlan,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.event.code.toLowerCase()}-setup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <h1 className="text-h1 font-semibold text-fg-primary">Review and start</h1>
        <p className="mt-1 text-meta text-fg-secondary">Fix anything marked “Must fix”. Notes are fine to leave, but read them first.</p>
        <Card className="mt-4 overflow-hidden">
          <ul className="divide-y divide-border">
            {mustFix.map((issue, i) => (
              <IssueRow key={`m${i}`} tone="warning" title={`Must fix · ${stepFor(issue.step).label}`} body={issue.message} href={`${base}${stepFor(issue.step).path}`} action={`Fix in ${stepFor(issue.step).label}`} />
            ))}
            {SETUP_STEPS.filter((s) => s.id !== "review" && stepStatus(issues, s.id as SetupStepId) !== "MUST_FIX").map((s) => (
              <IssueRow key={s.id} tone="ok" title={s.label} body={s.summary(state)} href={`${base}${s.path}`} action="Open" />
            ))}
            {notes.map((issue, i) => (
              <IssueRow key={`n${i}`} tone="note" title={`Note · ${stepFor(issue.step).label}`} body={issue.message} href={`${base}${stepFor(issue.step).path}`} action="Open" />
            ))}
          </ul>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="p-5">
          <h2 className="text-h2 font-semibold text-fg-primary">{setup ? "Go live" : "Event is live"}</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {[
              ["Start the event", `Opening prices lock and teams can sign in with ${state.event.code}. No trading yet.`],
              first ? [`Start ${first.type === "BRIEFING" ? "the briefing" : `Round ${first.number}`}`, first.type === "BRIEFING" ? `${formatMinutes(first.durationSeconds)} to read the market; trading stays closed.` : "Trading opens."] : null,
              trading.length ? ["Run the rounds", `${trading.length} trading round${trading.length === 1 ? "" : "s"} · you start each one from the Control Room.`] : null,
            ]
              .filter(Boolean)
              .map((row, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-canvas-subtle text-caption font-semibold text-fg-secondary">{i + 1}</span>
                  <span>
                    <span className="block text-[14px] font-medium text-fg-primary">{row![0]}</span>
                    <span className="block text-caption text-fg-muted">{row![1]}</span>
                  </span>
                </li>
              ))}
          </ol>
          {setup ? (
            <>
              <Button variant="primary" className="mt-4 w-full" onClick={() => run("startEvent")} disabled={!available("startEvent")}>
                <Play className="size-4" /> Start event
              </Button>
              {!available("startEvent") && <p className="mt-2 text-caption text-warning">Fix {mustFix.length || "the remaining"} item{mustFix.length === 1 ? "" : "s"} first. The button stays visible so you can see why it&apos;s off.</p>}
            </>
          ) : (
            <Link href={base} className="mt-4 block text-center text-[14px] font-medium text-accent-text hover:underline">
              Go to the Control Room
            </Link>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="text-h3 font-semibold text-fg-primary">Before you start</h3>
          <p className="mt-1 text-caption text-fg-muted">Download the setup as JSON as a backup. Team PINs are left out; print them from Teams.</p>
          <Button variant="ghost" className="mt-2 -ml-3" onClick={download}>
            <Download className="size-4" /> Download setup
          </Button>
        </Card>
      </aside>
    </div>
  );
}

function IssueRow({ tone, title, body, href, action }: { tone: "warning" | "ok" | "note"; title: string; body: string; href: string; action: string }) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <li className={cn("flex items-start gap-3 px-5 py-3.5", tone === "warning" && "bg-warning-soft")}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone === "warning" ? "text-warning" : tone === "ok" ? "text-positive" : "text-fg-muted")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14px] font-medium", tone === "warning" ? "text-warning" : "text-fg-primary")}>{title}</span>
        <span className="block text-meta text-fg-secondary">{body}</span>
      </span>
      <Link href={href} className="shrink-0 text-[13px] font-medium text-accent-text hover:underline">
        {action} →
      </Link>
    </li>
  );
}
