"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileText, LayoutTemplate, Plus } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { EventStatusBadge } from "@/components/market/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { InlineBanner, KeyValueList, PageHeader, Skeleton, Stepper } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BLANK_TEMPLATE_ID, blankConfig, EVENT_TEMPLATES } from "@/data/templates";
import type { EventConfig } from "@/lib/domain/event-config";
import { formatINR, rupees } from "@/lib/domain/money";
import { currentRound } from "@/lib/domain/trading-gate";
import type { CapitalRule, UniverseMode } from "@/lib/domain/types";
import { formatLongDate, formatMinutes } from "@/lib/format";
import { createEventFromConfig } from "@/lib/mock/commands";
import { useStore } from "@/lib/mock/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function HostHomeFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand href="/host" subtitle="Host console" />
          <nav className="flex items-center gap-1">
            <Link href="/demo" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Demo launcher
            </Link>
            <Link href="/" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Home
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export function HostEventsScreen() {
  const store = useStore();
  const router = useRouter();
  return (
    <HostHomeFrame>
      <PageHeader
        title="Events"
        description="Create, configure and run stock-market simulation events."
        actions={
          <Link href="/host/events/new" className={buttonClasses({ variant: "primary" })}>
            <Plus className="size-3.5" />
            Create event
          </Link>
        }
      />
      <Card className="mt-4">
        {!store ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <DataTable
            rows={store.eventOrder.map((id) => store.events[id]).filter(Boolean)}
            rowKey={(e) => e.event.id}
            onRowClick={(e) => router.push(`/host/events/${e.event.id}`)}
            rowLabel={(e) => `Open ${e.event.name}`}
            minWidth={820}
            columns={[
              {
                key: "name",
                header: "Event",
                sortValue: (e) => e.event.name,
                cell: (e) => (
                  <span className="block leading-tight">
                    <span className="block font-medium text-fg-primary">{e.event.name}</span>
                    <span className="block text-[11px] text-fg-muted">{e.event.universeMode === "CUSTOM" ? "Custom stocks" : "Real companies · simulated"} · P2P</span>
                  </span>
                ),
              },
              { key: "code", header: "Code", sortValue: (e) => e.event.code, cell: (e) => <span className="font-mono text-xs">{e.event.code}</span> },
              { key: "status", header: "Status", sortValue: (e) => e.event.status, cell: (e) => <EventStatusBadge status={e.event.status} /> },
              { key: "teams", header: "Teams", align: "right", sortValue: (e) => e.teams.length, cell: (e) => e.teams.length },
              {
                key: "rounds",
                header: "Rounds",
                cell: (e) => {
                  const round = currentRound(e);
                  return <span className="text-fg-secondary">{round ? `R${round.number} of ${e.rounds.length - 1}` : `${e.rounds.length} rounds`}</span>;
                },
              },
              { key: "date", header: "Date", sortValue: (e) => e.event.scheduledDate, cell: (e) => <span className="text-fg-secondary">{formatLongDate(e.event.scheduledDate)}</span> },
              {
                key: "open",
                header: "",
                align: "right",
                cell: (e) => (
                  <Link href={`/host/events/${e.event.id}`} onClick={(event) => event.stopPropagation()} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Open
                    <ArrowRight className="size-3.5" />
                  </Link>
                ),
              },
            ]}
          />
        )}
      </Card>
      <p className="mt-3 text-xs text-fg-muted">Prototype: events are stored in this browser. Phase 2 adds host accounts and a database.</p>
    </HostHomeFrame>
  );
}

/* ───────────────────────── Wizard ───────────────────────── */

const STEPS = ["Start", "Basics", "Format", "Capital", "Review"];

type WizardState = {
  templateId: string;
  name: string;
  code: string;
  universeMode: UniverseMode;
  capitalRule: CapitalRule;
  startingCash: number | null;
  teamCount: string;
  scheduledDate: string;
};

function templateConfig(id: string): EventConfig {
  return id === BLANK_TEMPLATE_ID ? blankConfig() : structuredClone(EVENT_TEMPLATES.find((t) => t.id === id)!.config);
}

function suggestCode(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("");
  return `${letters}${new Date().getFullYear() % 100}`.slice(0, 10).padEnd(4, "X");
}

export function CreateEventWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<WizardState>({
    templateId: EVENT_TEMPLATES[0].id,
    name: "Finance Club Mock Stock 2027",
    code: "MOCK27",
    universeMode: "CUSTOM",
    capitalRule: "SAME",
    startingCash: rupees(1000000),
    teamCount: "12",
    scheduledDate: "2027-02-12",
  });
  const update = (patch: Partial<WizardState>) => setForm((current) => ({ ...current, ...patch }));

  const template = EVENT_TEMPLATES.find((t) => t.id === form.templateId);
  const teamCount = Number(form.teamCount);
  const stepValid = [
    true,
    form.name.trim().length >= 3 && /^[A-Z0-9]{4,10}$/.test(form.code),
    true,
    form.startingCash !== null && form.startingCash > 0 && Number.isInteger(teamCount) && teamCount >= 2 && teamCount <= 60,
    true,
  ];

  const buildConfig = (): EventConfig => {
    const base = templateConfig(form.templateId);
    const cashChange = template && form.startingCash !== null ? form.startingCash - (base.allocation.identical.cash + stockValue(base)) : 0;
    const allocationCash = template ? Math.max(0, base.allocation.identical.cash + cashChange) : (form.startingCash ?? 0);
    return {
      ...base,
      name: form.name.trim(),
      code: form.code,
      scheduledDate: form.scheduledDate,
      universeMode: template ? base.universeMode : form.universeMode,
      capitalRule: form.capitalRule,
      defaultStartingCash: allocationCash,
      teams: Array.from({ length: teamCount }, (_, i) => ({ name: `Team ${String(i + 1).padStart(2, "0")}`, loginCode: `TEAM${String(i + 1).padStart(2, "0")}`, pin: String(1000 + ((i * 7919 + 3301) % 9000)), startingCash: allocationCash })),
      allocation: { ...base.allocation, identical: { ...base.allocation.identical, cash: allocationCash } },
    };
  };

  const create = async () => {
    setPending(true);
    setError(null);
    const result = await createEventFromConfig(buildConfig(), form.templateId === BLANK_TEMPLATE_ID ? null : form.templateId);
    setPending(false);
    if (result.ok) {
      toast.success("Draft event created", `${form.name} (${form.code}) is ready for setup.`);
      router.push(`/host/events/${result.value.eventId}/setup/general`);
    } else {
      setError(result.message);
    }
  };

  return (
    <HostHomeFrame>
      <Link href="/host" className="inline-flex items-center gap-1.5 rounded text-xs text-fg-secondary hover:text-fg-primary">
        <ArrowLeft className="size-3.5" />
        All events
      </Link>
      <PageHeader className="mt-3" title="Create event" description="Start from a template or a blank event. Everything can be changed later in Setup." />
      <div className="mt-4 overflow-x-auto pb-1">
        <Stepper steps={STEPS} current={step} />
      </div>

      <Card className="mt-4">
        <div className="px-5 py-5">
          {step === 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {[{ id: BLANK_TEMPLATE_ID, name: "Blank event", description: "No stocks, one round, cash-only allocation. Build everything yourself.", highlights: ["Start from scratch"] }, ...EVENT_TEMPLATES].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => update({ templateId: option.id })}
                  aria-pressed={form.templateId === option.id}
                  className={cn(
                    "flex flex-col items-start rounded-lg border p-4 text-left transition-colors",
                    form.templateId === option.id ? "border-accent bg-accent/8" : "border-border bg-surface-raised hover:border-border-strong",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-fg-secondary">
                      {option.id === BLANK_TEMPLATE_ID ? <FileText className="size-4" /> : <LayoutTemplate className="size-4" />}
                    </span>
                    {form.templateId === option.id && <Check className="size-4 text-accent-text" />}
                  </span>
                  <span className="mt-3 text-[14px] font-semibold text-fg-primary">{option.name}</span>
                  <span className="mt-1 text-xs leading-relaxed text-fg-secondary">{option.description}</span>
                  <span className="mt-3 flex flex-wrap gap-1">
                    {option.highlights.map((h) => (
                      <Badge key={h} tone="outline">{h}</Badge>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <Field label="Event name" htmlFor="wiz-name" required className="sm:col-span-2">
                <Input id="wiz-name" value={form.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Event code" htmlFor="wiz-code" required hint="Teams type this to join. 4–10 capital letters or digits." aside={<button type="button" className="text-[11px] text-accent-text hover:underline" onClick={() => update({ code: suggestCode(form.name) })}>Suggest</button>}>
                <Input id="wiz-code" value={form.code} onChange={(e) => update({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} className="font-mono tracking-wider" />
              </Field>
              <Field label="Event date" htmlFor="wiz-date">
                <Input id="wiz-date" type="date" value={form.scheduledDate} onChange={(e) => update({ scheduledDate: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="flex max-w-3xl flex-col gap-5">
              <FormatRow label="Trading" description="How trades are created.">
                <SegmentedControl options={[{ value: "P2P", label: "Peer-to-peer" }, { value: "SIM", label: "Simulated exchange · coming later", disabled: true }]} value="P2P" onChange={() => {}} label="Trading mode" size="md" />
              </FormatRow>
              <FormatRow label="Stock universe" description={template ? `Set by the ${template.name} template.` : "Which instruments teams can trade."}>
                <SegmentedControl
                  options={[
                    { value: "CUSTOM", label: "Custom / fictional", disabled: !!template && template.config.universeMode !== "CUSTOM" },
                    { value: "REAL_SIMULATED", label: "Real companies · simulated", disabled: !!template && template.config.universeMode !== "REAL_SIMULATED" },
                  ]}
                  value={template ? template.config.universeMode : form.universeMode}
                  onChange={(value) => update({ universeMode: value })}
                  label="Universe mode"
                  size="md"
                />
              </FormatRow>
              <FormatRow label="News" description="How news is released.">
                <p className="text-[13px] text-fg-secondary">Stories start in manual mode. During the event you can switch to random release (safe gaps, one story at a time) from the news desk.</p>
              </FormatRow>
            </div>
          )}

          {step === 3 && (
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <Field label="Starting capital rule" className="sm:col-span-2">
                <SegmentedControl options={[{ value: "SAME", label: "Same amount for every team" }, { value: "CUSTOM", label: "Custom per team" }]} value={form.capitalRule} onChange={(v) => update({ capitalRule: v })} label="Capital rule" size="md" />
              </Field>
              <Field label={template ? "Total starting capital per team" : "Starting cash per team"} htmlFor="wiz-cash" required hint={template ? "The template's stock allocation is kept; cash is adjusted so each team starts with this total." : form.capitalRule === "CUSTOM" ? "Default for new teams; edit individual teams later." : undefined}>
                <MoneyInput id="wiz-cash" value={form.startingCash} onValueChange={(v) => update({ startingCash: v })} />
              </Field>
              <Field label="Number of teams" htmlFor="wiz-teams" required hint="2–60. Teams are created as Team 01, Team 02…; rename them in Teams.">
                <Input id="wiz-teams" inputMode="numeric" value={form.teamCount} onChange={(e) => update({ teamCount: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <KeyValueList
                columns={3}
                items={(() => {
                  const config = buildConfig();
                  return [
                    { label: "Template", value: template?.name ?? "Blank" },
                    { label: "Name", value: config.name },
                    { label: "Code", value: <span className="font-mono">{config.code}</span> },
                    { label: "Trading", value: "Peer-to-peer" },
                    { label: "Universe", value: config.universeMode === "CUSTOM" ? "Custom / fictional" : "Real companies · simulated" },
                    { label: "News", value: "Manual" },
                    { label: "Teams", value: config.teams.length },
                    { label: "Capital per team", value: formatINR(config.allocation.identical.cash + stockValue(config)) },
                    { label: "Stocks", value: config.instruments.length ? config.instruments.map((i) => i.symbol).join(", ") : "None yet" },
                    { label: "Rounds", value: config.rounds.map((r) => `${r.name} (${formatMinutes(r.durationSeconds)})`).join(" · ") },
                    { label: "News items", value: config.news.length },
                    { label: "Price band", value: `±${config.rules.priceBandPct}%` },
                  ];
                })()}
              />
              {error && <InlineBanner tone="warning" title="Could not create the event.">{error}</InlineBanner>}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step]}>
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button variant="primary" onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create draft event"}
            </Button>
          )}
        </footer>
      </Card>
    </HostHomeFrame>
  );
}

function stockValue(config: EventConfig) {
  return Object.entries(config.allocation.identical.shares).reduce((sum, [symbol, qty]) => sum + qty * (config.instruments.find((i) => i.symbol === symbol)?.startingPrice ?? 0), 0);
}

function FormatRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 last:border-b-0">
      <div>
        <p className="text-[13px] font-medium text-fg-primary">{label}</p>
        <p className="text-xs text-fg-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
