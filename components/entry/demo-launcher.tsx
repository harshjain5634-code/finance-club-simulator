"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, Gauge, MonitorPlay, RotateCcw, SquareTerminal, Zap } from "lucide-react";
import { EventStatusBadge } from "@/components/market/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { DataTable } from "@/components/ui/data-table";
import { InlineBanner, KeyValueList, Skeleton } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DEMO_EVENT_CODE, DEMO_EVENT_ID, type ScenarioTiming } from "@/data/scenarios/shared";
import { formatPrice } from "@/lib/domain/money";
import { currentRound } from "@/lib/domain/trading-gate";
import type { OpResult, UniverseMode } from "@/lib/domain/types";
import { acceptProposal, loadDemoScenario, resetAllPrototypeData, resetDemo } from "@/lib/mock/commands";
import { useStore } from "@/lib/mock/hooks";
import { toast } from "@/lib/toast";

type PendingAction = { kind: "reset" } | { kind: "load"; scenario: UniverseMode } | { kind: "wipe" } | null;

function openWindow(url: string) {
  window.open(url, "_blank", "noopener");
}

export function DemoLauncher() {
  const store = useStore();
  const [timing, setTiming] = useState<ScenarioTiming>("STANDARD");
  const [pending, setPending] = useState<PendingAction>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!store) {
    return <Skeleton className="h-96 w-full max-w-5xl" />;
  }
  const demo = store.events[DEMO_EVENT_ID];
  const round = demo ? currentRound(demo) : null;
  const alpha = demo?.teams.find((t) => t.loginCode === "ALPHA");
  const beta = demo?.teams.find((t) => t.loginCode === "BETA");

  const roles = [
    { icon: Gauge, title: "Open host console", body: "Control room for Finance Club Mock Stock 2026.", url: `/host/events/${DEMO_EVENT_ID}` },
    { icon: SquareTerminal, title: "Open Team Alpha", body: `Signs this new tab in as Alpha Capital (PIN ${alpha?.pin ?? "—"}).`, url: `/join/${DEMO_EVENT_CODE}?demo=ALPHA` },
    { icon: SquareTerminal, title: "Open Team Beta", body: `Signs this new tab in as Beta Street (PIN ${beta?.pin ?? "—"}).`, url: `/join/${DEMO_EVENT_CODE}?demo=BETA` },
    { icon: MonitorPlay, title: "Open projector", body: "Full-screen audience display for the room.", url: `/event/${DEMO_EVENT_CODE}/projector?key=${demo?.event.projector.projectorKey ?? ""}` },
  ];

  const runDoubleAccept = async () => {
    if (!demo || !beta) return;
    const target = [...demo.proposals].reverse().find((p) => p.counterpartyTeamId === beta.id && p.status === "PROPOSED");
    if (!target) {
      setTestResult("No open proposal to Beta Street. Propose one from Team Alpha first (e.g. SELL 20 NOVA @ ₹525 to Beta Street).");
      return;
    }
    const results = await Promise.all([acceptProposal(DEMO_EVENT_ID, beta.id, target.id), acceptProposal(DEMO_EVENT_ID, beta.id, target.id)]);
    const fresh = store.events[DEMO_EVENT_ID];
    void fresh;
    const outcomes = results.map((r) => (r.ok ? ("alreadySettled" in (r.value as object) && (r.value as { alreadySettled: boolean }).alreadySettled ? "already settled (idempotent replay)" : (r.value as { kind: string }).kind.toLowerCase()) : `rejected: ${r.message}`));
    setTestResult(`Proposal ${target.id}: accept #1 → ${outcomes[0]}; accept #2 → ${outcomes[1]}. Check the trade monitor: exactly one trade references ${target.id}.`);
  };

  const confirm = async (): Promise<OpResult<unknown>> => {
    if (!pending) return { ok: true, value: undefined };
    const result = pending.kind === "reset" ? await resetDemo() : pending.kind === "wipe" ? await resetAllPrototypeData() : await loadDemoScenario(pending.scenario, timing);
    if (result.ok) {
      toast.success(pending.kind === "load" ? `Loaded ${pending.scenario === "CUSTOM" ? "custom stock" : "real-simulated"} scenario` : "Demo data reset");
      setTestResult(null);
    }
    return result;
  };

  return (
    <div className="w-full max-w-5xl">
      <InlineBanner tone="warning" icon={<FlaskConical className="size-4" />} title="Prototype / Demo Environment.">
        All data lives in this browser (localStorage) and syncs between tabs with BroadcastChannel. Nothing is saved to a server.
      </InlineBanner>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg-primary">Demo launcher</h1>
          <p className="mt-1 text-[13px] text-fg-secondary">Open each role in its own tab, then run the event from the host console.</p>
        </div>
        {demo && (
          <div className="flex items-center gap-2 text-xs text-fg-secondary">
            <EventStatusBadge status={demo.event.status} />
            <Badge tone="outline">{demo.event.universeMode === "CUSTOM" ? "Custom stocks" : "Real-simulated"}</Badge>
            <span>{round ? `R${round.number} · ${round.name} (${round.status.toLowerCase()})` : "No round started"}</span>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map(({ icon: Icon, title, body, url }) => (
          <button
            key={title}
            type="button"
            onClick={() => openWindow(url)}
            className="group flex flex-col items-start rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/50 hover:bg-surface-raised"
          >
            <span className="grid size-9 place-items-center rounded-md border border-border bg-surface-raised text-accent-text">
              <Icon className="size-4" />
            </span>
            <span className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-fg-primary">
              {title}
              <ExternalLink className="size-3.5 text-fg-muted group-hover:text-fg-secondary" />
            </span>
            <span className="mt-1 text-xs leading-relaxed text-fg-muted">{body}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scenario" subtitle="Rebuild the demo event (FINSIM26) from scratch" divider />
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-fg-secondary">Round timers</span>
              <SegmentedControl
                options={[
                  { value: "STANDARD", label: "Standard 3/15/15/15 min" },
                  { value: "QUICK", label: "Quick 1/4/4/4 min" },
                ]}
                value={timing}
                onChange={setTiming}
                label="Round timer length"
                size="md"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPending({ kind: "load", scenario: "CUSTOM" })}>
                Load custom stock scenario
              </Button>
              <Button variant="secondary" onClick={() => setPending({ kind: "load", scenario: "REAL_SIMULATED" })}>
                Load real-simulated scenario
              </Button>
              <Button variant="warning-outline" onClick={() => setPending({ kind: "reset" })}>
                <RotateCcw className="size-3.5" />
                Reset demo event
              </Button>
            </div>
            {demo && (
              <KeyValueList
                columns={3}
                items={[
                  { label: "Event", value: demo.event.name },
                  { label: "Code", value: demo.event.code },
                  { label: "Timers", value: store.demo.timing === "QUICK" ? "Quick" : "Standard" },
                  { label: "Teams", value: demo.teams.length },
                  { label: "Stocks", value: demo.instruments.map((i) => i.symbol).slice(0, 4).join(", ") + "…" },
                  { label: "Trades", value: demo.trades.length },
                ]}
              />
            )}
            <button type="button" onClick={() => setPending({ kind: "wipe" })} className="w-fit text-xs text-fg-muted underline-offset-4 hover:text-fg-secondary hover:underline">
              Reset all prototype data (also removes events created in the wizard)
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Idempotency check" subtitle="Fire two simultaneous accepts for the newest proposal to Beta Street" icon={<Zap className="size-3.5" />} divider />
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-[13px] leading-relaxed text-fg-secondary">
              Both calls race through the cross-tab write lock. The first settles the trade; the second sees the settled proposal and returns the same
              trade, so settlement can never happen twice.
            </p>
            <Button variant="secondary" onClick={runDoubleAccept} className="w-fit">
              Run double-accept test
            </Button>
            {testResult && <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs leading-relaxed text-fg-primary">{testResult}</p>}
          </div>
        </Card>
      </div>

      {demo && (
        <Card className="mt-3">
          <CardHeader title="Team credentials" subtitle="Every team signs in at /join/FINSIM26 with its PIN" divider action={<Link href={`/host/events/${DEMO_EVENT_ID}/teams`} className={buttonClasses({ variant: "ghost", size: "sm" })}>Manage teams</Link>} />
          <DataTable
            rows={demo.teams}
            rowKey={(t) => t.id}
            minWidth={560}
            dense
            columns={[
              { key: "name", header: "Team", cell: (t) => <span className="font-medium text-fg-primary">{t.name}</span> },
              { key: "code", header: "Login code", cell: (t) => <span className="font-mono text-xs">{t.loginCode}</span> },
              { key: "pin", header: "PIN", cell: (t) => <span className="font-mono text-xs">{t.pin}</span> },
              { key: "cash", header: "Starting cash", align: "right", cell: (t) => `₹${formatPrice(demo.allocationPlan.applied[t.id]?.cash ?? t.startingCash)}` },
              {
                key: "open",
                header: "",
                align: "right",
                cell: (t) => (
                  <Button variant="ghost" size="xs" onClick={() => openWindow(`/join/${DEMO_EVENT_CODE}?demo=${t.loginCode}`)}>
                    Open tab
                    <ExternalLink className="size-3" />
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        tier="confirm"
        tone="warning"
        title={pending?.kind === "wipe" ? "Reset all prototype data?" : pending?.kind === "reset" ? "Reset the demo event?" : "Load a new demo scenario?"}
        description={
          pending?.kind === "wipe"
            ? "Every event in this browser, including wizard drafts, is replaced with the original seed data."
            : "FINSIM26 is rebuilt with fresh teams, allocations and news. Trades, adjustments and audit history for the demo event are discarded. Open tabs update automatically."
        }
        confirmLabel={pending?.kind === "wipe" ? "Reset everything" : pending?.kind === "reset" ? "Reset demo event" : "Load scenario"}
        onConfirm={confirm}
      />
    </div>
  );
}
