"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Library, Lock, Pencil, Plus, RefreshCw, Trash } from "lucide-react";
import { generateHistory } from "@/data/mock-history";
import { catalogueInstrument, REAL_CATALOGUE } from "@/data/scenarios/catalogue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Switch } from "@/components/ui/controls";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DrawerContent } from "@/components/ui/dialog";
import { Field, FormSection, Input, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { InlineBanner, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Sparkline } from "@/components/ui/sparkline";
import { InstrumentStateBadge, RoundStatusBadge } from "@/components/market/status";
import { SymbolMark } from "@/components/market/tables";
import { formatINR, formatPrice, rupees } from "@/lib/domain/money";
import { allocationValue, supplyUsage } from "@/lib/domain/portfolio";
import type { GeneralSettingsInput, InstrumentInput, RoundDraft } from "@/lib/domain/setup";
import type { AllocationDistribution, AllocationMode, AllocationRow, EventRules, EventState, Instrument, ParticipantLeaderboardVisibility, RoundType, ThemePolicy } from "@/lib/domain/types";
import { formatQuantity } from "@/lib/format";
import { applyAllocations, createInstrument, saveAllocationPlan, saveRounds, updateGeneralSettings, updateInstrument } from "@/lib/mock/commands";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";

const editable = (state: EventState) => state.event.status === "DRAFT" || state.event.status === "READY";

/* ───────────────────────── General ───────────────────────── */

export function SetupGeneralScreen() {
  const { state } = useHostEvent();
  return <GeneralForm key={`${state.event.id}-${state.audit.filter((a) => a.type === "SETTINGS_UPDATED").length}`} state={state} />;
}

function GeneralForm({ state }: { state: EventState }) {
  const { event } = state;
  const locked = !editable(state);
  const [form, setForm] = useState<GeneralSettingsInput>({
    name: event.name,
    code: event.code,
    universeMode: event.universeMode,
    capitalRule: event.capitalRule,
    defaultStartingCash: event.defaultStartingCash,
    rules: { ...event.rules },
    themePolicy: event.themePolicy,
    scheduledDate: event.scheduledDate,
  });
  const [confirmCode, setConfirmCode] = useState(false);
  const [pending, setPending] = useState(false);
  const setRules = (patch: Partial<EventRules>) => setForm((f) => ({ ...f, rules: { ...f.rules, ...patch } }));
  const codeChanged = form.code !== event.code;

  const save = async (reason?: string) => {
    setPending(true);
    const result = await hostAction(updateGeneralSettings(event.id, form), "Event settings saved", reason ? `Code changed to ${form.code}` : undefined);
    setPending(false);
    return result;
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="General"
        description="Event identity, formats, P2P trading rules, scoring and theme policy."
        actions={
          <Button variant="primary" disabled={pending} onClick={() => (codeChanged && !editable(state) ? setConfirmCode(true) : save())}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        }
      />
      {locked && <InlineBanner tone="neutral" icon={<Lock className="size-4" />} title="The event has started.">Capital rules and universe mode are locked; trading rules can still be tuned.</InlineBanner>}
      <Card className="px-5">
        <FormSection title="Event identity" description="Teams join with the event code.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event name" htmlFor="gen-name" className="sm:col-span-2">
              <Input id="gen-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Event code" htmlFor="gen-code" hint={locked ? "Changing the code while live requires typed confirmation." : undefined}>
              <Input id="gen-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} className="font-mono tracking-wider" />
            </Field>
            <Field label="Event date" htmlFor="gen-date">
              <Input id="gen-date" type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Formats" description="Trading and news formats for this event.">
          <div className="flex flex-col gap-4">
            <Field label="Trading mode">
              <SegmentedControl options={[{ value: "P2P", label: "Peer-to-peer" }, { value: "SIM", label: "Simulated exchange · Phase 9", disabled: true }]} value="P2P" onChange={() => {}} label="Trading mode" size="md" />
            </Field>
            <Field label="Stock universe" hint={state.instruments.length > 0 ? "Locked because stocks already exist." : undefined}>
              <SegmentedControl
                options={[
                  { value: "CUSTOM", label: "Custom / fictional", disabled: state.instruments.length > 0 },
                  { value: "REAL_SIMULATED", label: "Real companies · simulated", disabled: state.instruments.length > 0 },
                ]}
                value={form.universeMode}
                onChange={(v) => setForm({ ...form, universeMode: v })}
                label="Universe mode"
                size="md"
              />
            </Field>
            <Field label="News mode">
              <SegmentedControl options={[{ value: "MANUAL", label: "Manual release" }, { value: "AUTO", label: "Automatic · Phase 11", disabled: true }]} value="MANUAL" onChange={() => {}} label="News mode" size="md" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Starting capital" description="Applies when allocations are applied.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capital rule">
              <SegmentedControl options={[{ value: "SAME", label: "Same for all", disabled: locked }, { value: "CUSTOM", label: "Custom per team", disabled: locked }]} value={form.capitalRule} onChange={(v) => setForm({ ...form, capitalRule: v })} label="Capital rule" size="md" />
            </Field>
            <Field label="Default starting cash" htmlFor="gen-cash">
              <MoneyInput id="gen-cash" value={form.defaultStartingCash} onValueChange={(v) => setForm({ ...form, defaultStartingCash: v ?? 0 })} disabled={locked} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="P2P trading rules" description="Enforced at proposal time and again at settlement.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price band (± % of reference)" htmlFor="gen-band">
              <Input id="gen-band" inputMode="decimal" value={form.rules.priceBandPct} onChange={(e) => setRules({ priceBandPct: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Proposal expiry (minutes)" htmlFor="gen-expiry">
              <Input id="gen-expiry" inputMode="decimal" value={form.rules.proposalExpirySeconds / 60} onChange={(e) => setRules({ proposalExpirySeconds: Math.round((Number(e.target.value) || 0) * 60) })} />
            </Field>
            <Field label="Max open outgoing proposals per team" htmlFor="gen-max">
              <Input id="gen-max" inputMode="numeric" value={form.rules.maxOpenOutgoingProposals} onChange={(e) => setRules({ maxOpenOutgoingProposals: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="Host approval for large trades">
              <div className="flex h-8 items-center gap-2">
                <Switch checked={form.rules.approvalEnabled} onCheckedChange={(v) => setRules({ approvalEnabled: v })} label="Require host approval" />
                <span className="text-xs text-fg-secondary">{form.rules.approvalEnabled ? "Enabled" : "Disabled"}</span>
              </div>
            </Field>
            {form.rules.approvalEnabled && (
              <Field label="Approval threshold (trade value)" htmlFor="gen-threshold">
                <MoneyInput id="gen-threshold" value={form.rules.approvalThreshold} onValueChange={(v) => setRules({ approvalThreshold: v })} />
              </Field>
            )}
            <p className="text-xs text-fg-muted sm:col-span-2">Also enforced: whole shares, no short selling, no negative cash; P2P prices never move the reference price.</p>
          </div>
        </FormSection>

        <FormSection title="Scoring" description="How the leaderboard ranks teams.">
          <SegmentedControl options={[{ value: "RETURN", label: "Return % on capital base" }, { value: "NET", label: "Net worth · later", disabled: true }]} value="RETURN" onChange={() => {}} label="Ranking method" size="md" />
          <p className="mt-2 text-xs text-fg-muted">Ties: higher net worth, then team name.</p>
        </FormSection>

        <FormSection title="Theme policy" description="Dark is production quality; light is an architecture preview in Phase 1.">
          <SegmentedControl<ThemePolicy>
            options={[
              { value: "FORCE_DARK", label: "Force dark" },
              { value: "FORCE_LIGHT", label: "Force light · preview" },
              { value: "PARTICIPANT_CHOICE", label: "Participant choice · preview" },
            ]}
            value={form.themePolicy}
            onChange={(v) => setForm({ ...form, themePolicy: v })}
            label="Theme policy"
            size="md"
          />
        </FormSection>
      </Card>

      <ConfirmActionDialog
        open={confirmCode}
        onOpenChange={setConfirmCode}
        tier="typed"
        tone="warning"
        title="Change the event code during a live event?"
        description={`Teams that are signed in keep working, but anyone joining must use ${form.code}. Update the projector and printed slips.`}
        typedPhrase={form.code}
        confirmLabel="Change code and save"
        onConfirm={({ reason }) => save(reason)}
      />
    </div>
  );
}

/* ───────────────────────── Instruments ───────────────────────── */

export function SetupInstrumentsScreen() {
  const { state } = useHostEvent();
  const [editing, setEditing] = useState<Instrument | "new" | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const real = state.event.universeMode === "REAL_SIMULATED";
  const usage = supplyUsage(state);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Instruments"
        description={real ? "Real company identities with simulation-controlled prices (REAL_SIMULATED)." : "Fictional companies with simulated prices (CUSTOM)."}
        meta={<Badge tone="outline">{real ? "Real company · Simulated market" : "Custom stocks"}</Badge>}
        actions={
          real ? (
            <Button variant="primary" onClick={() => setCatalogueOpen(true)} disabled={!editable(state)}>
              <Library className="size-3.5" /> Add from catalogue
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setEditing("new")} disabled={!editable(state)}>
              <Plus className="size-3.5" /> Add stock
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          rows={state.instruments}
          rowKey={(i) => i.id}
          minWidth={1160}
          empty="No stocks yet."
          columns={[
            { key: "name", header: "Company", sticky: true, sortValue: (i) => i.name, cell: (i) => <span className="flex items-center gap-2.5"><SymbolMark symbol={i.symbol} /><span className="block leading-tight"><span className="block font-medium text-fg-primary">{i.name}</span><span className="block text-[11px] text-fg-muted">{i.sector}</span></span></span> },
            { key: "ticker", header: "Ticker", sortValue: (i) => i.symbol, cell: (i) => <span className="font-mono text-xs">{i.symbol}</span> },
            { key: "start", header: "Starting", align: "right", sortValue: (i) => i.startingPrice, cell: (i) => `₹${formatPrice(i.startingPrice)}` },
            { key: "price", header: "Current", align: "right", cell: (i) => `₹${formatPrice(state.prices[i.id].price)}` },
            { key: "supply", header: "Supply (allocated)", align: "right", cell: (i) => <span className={cn((usage[i.id] ?? 0) > i.supply && "text-warning")}>{formatQuantity(i.supply)} ({formatQuantity(usage[i.id] ?? 0)})</span> },
            { key: "limits", header: "Floor / ceiling", align: "right", cell: (i) => <span className="text-fg-secondary">{i.floor ? formatPrice(i.floor) : "—"} / {i.ceiling ? formatPrice(i.ceiling) : "—"}</span> },
            { key: "circuit", header: "Circuit", align: "right", cell: (i) => (i.circuitPct ? `±${i.circuitPct}%` : "—") },
            { key: "history", header: "History", cell: (i) => <Sparkline data={i.history.map((h) => h.price)} className="h-6 w-20" /> },
            { key: "status", header: "Status", cell: (i) => <InstrumentStateBadge halted={i.halted} enabled={i.enabled} /> },
            { key: "edit", header: "", align: "right", cell: (i) => <Button variant="ghost" size="sm" onClick={() => setEditing(i)}><Pencil className="size-3.5" />Edit</Button> },
          ]}
        />
      </Card>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null && <InstrumentEditor key={editing === "new" ? "new" : editing.id} state={state} instrument={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <CatalogueDialog state={state} open={catalogueOpen} onOpenChange={setCatalogueOpen} />
    </div>
  );
}

function InstrumentEditor({ state, instrument, onDone }: { state: EventState; instrument: Instrument | null; onDone: () => void }) {
  const lockedCore = !!instrument && (!editable(state) || state.event.allocationsApplied);
  const [form, setForm] = useState<InstrumentInput>(() =>
    instrument
      ? { symbol: instrument.symbol, name: instrument.name, sector: instrument.sector, description: instrument.description, startingPrice: instrument.startingPrice, supply: instrument.supply, floor: instrument.floor, ceiling: instrument.ceiling, circuitPct: instrument.circuitPct, enabled: instrument.enabled, exchange: instrument.exchange, history: instrument.history }
      : { symbol: "", name: "", sector: "", description: "", startingPrice: rupees(250), supply: 5000, floor: rupees(125), ceiling: rupees(500), circuitPct: 10, enabled: true, history: [] },
  );
  const [pending, setPending] = useState(false);
  const update = (patch: Partial<InstrumentInput>) => setForm((f) => ({ ...f, ...patch }));

  const regenerateHistory = () =>
    update({ history: generateHistory({ endPrice: form.startingPrice, endDate: state.event.scheduledDate, seed: Math.floor(Math.random() * 1e9), driftPct: Math.round(Math.random() * 12 - 4), volatilityPct: 1 + Math.random() * 1.2 }) });

  const save = async () => {
    setPending(true);
    const result = instrument
      ? await hostAction(updateInstrument(state.event.id, instrument.id, form), (i) => `${i.symbol} updated`)
      : await hostAction(createInstrument(state.event.id, form), (i) => `${i.symbol} created`);
    setPending(false);
    if (result.ok) onDone();
  };

  return (
    <DrawerContent
      title={instrument ? `Edit ${instrument.symbol}` : "New fictional stock"}
      description={lockedCore ? "Ticker and starting price are locked after allocations are applied." : "Prices move only through news and host actions."}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : instrument ? "Save stock" : "Create stock"}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" htmlFor="ins-name" required>
          <Input id="ins-name" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="Nova Motors" />
        </Field>
        <Field label="Ticker" htmlFor="ins-symbol" required hint="Capital letters/digits, unique in the event">
          <Input id="ins-symbol" value={form.symbol} disabled={lockedCore} onChange={(e) => update({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9&-]/g, "").slice(0, 12) })} className="font-mono" />
        </Field>
        <Field label="Sector" htmlFor="ins-sector">
          <Input id="ins-sector" value={form.sector} onChange={(e) => update({ sector: e.target.value })} placeholder="EV / Automotive" />
        </Field>
        <Field label="Starting price" htmlFor="ins-price" required>
          <MoneyInput id="ins-price" value={form.startingPrice} disabled={lockedCore} onValueChange={(v) => update({ startingPrice: v ?? 0 })} />
        </Field>
        <Field label="Description" htmlFor="ins-desc" className="sm:col-span-2">
          <Textarea id="ins-desc" rows={3} value={form.description} onChange={(e) => update({ description: e.target.value })} />
        </Field>
        <Field label="Available supply (shares)" htmlFor="ins-supply">
          <Input id="ins-supply" inputMode="numeric" value={form.supply} onChange={(e) => update({ supply: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
        </Field>
        <Field label="Circuit limit per round (%)" htmlFor="ins-circuit" hint="Leave empty for no circuit">
          <Input id="ins-circuit" inputMode="decimal" value={form.circuitPct ?? ""} onChange={(e) => update({ circuitPct: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Price floor" htmlFor="ins-floor">
          <MoneyInput id="ins-floor" value={form.floor} onValueChange={(v) => update({ floor: v })} />
        </Field>
        <Field label="Price ceiling" htmlFor="ins-ceiling">
          <MoneyInput id="ins-ceiling" value={form.ceiling} onValueChange={(v) => update({ ceiling: v })} />
        </Field>
        <Field label="Enabled for trading">
          <div className="flex h-8 items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => update({ enabled: v })} label="Enabled" />
            <span className="text-xs text-fg-secondary">{form.enabled ? "Visible to teams" : "Hidden from teams"}</span>
          </div>
        </Field>
        <Field label="Pre-event history" hint="Illustrative daily closes ending at the starting price">
          <div className="flex h-8 items-center gap-3">
            <Sparkline data={(form.history ?? []).map((h) => h.price)} tone="accent" className="h-7 w-28" />
            <Button variant="secondary" size="sm" onClick={regenerateHistory}>
              <RefreshCw className="size-3.5" /> Generate mock history
            </Button>
          </div>
        </Field>
      </div>
    </DrawerContent>
  );
}

function CatalogueDialog({ state, open, onOpenChange }: { state: EventState; open: boolean; onOpenChange: (open: boolean) => void }) {
  const existing = new Set(state.instruments.map((i) => i.symbol));
  const add = async (symbol: string) => {
    const entry = REAL_CATALOGUE.find((c) => c.symbol === symbol)!;
    const config = catalogueInstrument(entry, state.event.scheduledDate);
    await hostAction(createInstrument(state.event.id, { ...config, exchange: config.exchange }), `${symbol} added from catalogue`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Mock company catalogue" description="Static, illustrative data. A market-data API replaces this in Phase 10." size="lg" icon={<Library className="size-4" />}>
        <ul className="divide-y divide-border rounded-md border border-border">
          {REAL_CATALOGUE.map((entry) => (
            <li key={entry.symbol} className="flex items-center gap-3 px-3 py-2.5">
              <SymbolMark symbol={entry.symbol} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg-primary">{entry.name} <span className="font-mono text-xs text-fg-muted">{entry.symbol}</span></p>
                <p className="truncate text-xs text-fg-muted">{entry.sector} · ₹{entry.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              {existing.has(entry.symbol) ? (
                <Badge tone="neutral"><Check className="size-3" /> Added</Badge>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => add(entry.symbol)}>
                  <Plus className="size-3.5" /> Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Allocations ───────────────────────── */

export function SetupAllocationsScreen() {
  const { state } = useHostEvent();
  return <AllocationEditor key={`${state.event.id}-${state.event.allocationsApplied}-${state.teams.length}-${state.instruments.length}`} state={state} />;
}

function AllocationEditor({ state }: { state: EventState }) {
  const plan = state.allocationPlan;
  const applied = state.event.allocationsApplied;
  const [mode, setMode] = useState<AllocationMode>(plan.mode);
  const [distribution, setDistribution] = useState<AllocationDistribution>(plan.distribution);
  const [identical, setIdentical] = useState<AllocationRow>(() => structuredClone(plan.identical));
  const [perTeam, setPerTeam] = useState<Record<string, AllocationRow>>(() => {
    const rows = structuredClone(plan.perTeam);
    for (const team of state.teams) rows[team.id] = rows[team.id] ?? { cash: team.startingCash, shares: { ...plan.identical.shares } };
    return rows;
  });
  const [fill, setFill] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rows = applied
    ? state.teams.map((t) => ({ id: t.id, label: t.name, row: plan.applied[t.id] ?? { cash: 0, shares: {} } }))
    : distribution === "IDENTICAL"
      ? [{ id: "ALL", label: `All ${state.teams.length} teams`, row: identical }]
      : state.teams.map((t) => ({ id: t.id, label: t.name, row: perTeam[t.id] }));

  const effective = (teamId: string): AllocationRow => {
    const row = distribution === "IDENTICAL" ? identical : perTeam[teamId];
    return { cash: row.cash, shares: mode === "CASH_ONLY" ? {} : row.shares };
  };
  const usage: Record<string, number> = {};
  for (const team of state.teams) for (const [id, qty] of Object.entries(effective(team.id).shares)) usage[id] = (usage[id] ?? 0) + qty;

  const setCell = (rowId: string, key: "cash" | string, value: number) => {
    if (rowId === "ALL") setIdentical((r) => (key === "cash" ? { ...r, cash: value } : { ...r, shares: { ...r.shares, [key]: value } }));
    else setPerTeam((rowsMap) => ({ ...rowsMap, [rowId]: key === "cash" ? { ...rowsMap[rowId], cash: value } : { ...rowsMap[rowId], shares: { ...rowsMap[rowId].shares, [key]: value } } }));
  };
  const fillColumn = (key: string) => {
    const raw = fill[key];
    if (raw === undefined || raw === "") return;
    const value = key === "cash" ? rupees(Number(raw.replace(/,/g, "")) || 0) : Number(raw) || 0;
    setPerTeam((rowsMap) => Object.fromEntries(Object.entries(rowsMap).map(([id, r]) => [id, key === "cash" ? { ...r, cash: value } : { ...r, shares: { ...r.shares, [key]: value } }])));
  };
  const copyToAll = (teamId: string) => setPerTeam((rowsMap) => Object.fromEntries(Object.keys(rowsMap).map((id) => [id, structuredClone(rowsMap[teamId])])));
  const overSupply = state.instruments.filter((i) => (usage[i.id] ?? 0) > i.supply);
  const planPayload = { mode, distribution, identical, perTeam };
  const columns = mode === "CASH_AND_STOCKS" || applied ? state.instruments : [];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Allocations"
        description="Starting cash and shares for each team. Applying posts one ALLOCATION journal per team to the ledger."
        actions={
          applied ? (
            <Badge tone="accent" className="h-8 rounded-md px-3 text-xs"><Lock className="size-3" /> Applied and locked</Badge>
          ) : (
            <>
              <Button variant="secondary" onClick={() => hostAction(saveAllocationPlan(state.event.id, planPayload), "Allocation plan saved")}>Save draft</Button>
              <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={overSupply.length > 0 || state.teams.length === 0 || !editable(state)}>
                Apply allocations
              </Button>
            </>
          )
        }
      />
      {applied ? (
        <InlineBanner tone="accent" icon={<Lock className="size-4" />} title="Allocations are applied.">
          Changes after this point are made with auditable cash/holding adjustments on each team&apos;s page.
        </InlineBanner>
      ) : (
        <Card className="flex flex-wrap items-center gap-4 px-4 py-3">
          <Field label="What teams receive">
            <SegmentedControl options={[{ value: "CASH_ONLY", label: "Cash only" }, { value: "CASH_AND_STOCKS", label: "Cash + stocks" }]} value={mode} onChange={setMode} label="Allocation mode" size="md" />
          </Field>
          <Field label="Distribution">
            <SegmentedControl options={[{ value: "IDENTICAL", label: "Identical for all" }, { value: "PER_TEAM", label: "Per team" }]} value={distribution} onChange={setDistribution} label="Distribution" size="md" />
          </Field>
        </Card>
      )}
      {overSupply.length > 0 && <InlineBanner tone="warning" title="Supply exceeded.">{overSupply.map((i) => `${i.symbol} needs ${usage[i.id]} of ${i.supply}`).join(" · ")}</InlineBanner>}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]" style={{ minWidth: 360 + columns.length * 110 }}>
            <thead>
              <tr className="border-b border-border bg-surface-raised text-[11px] tracking-wide text-fg-muted uppercase">
                <th className="sticky left-0 z-10 bg-surface-raised px-4 py-2 text-left font-medium">Team</th>
                <th className="px-3 py-2 text-right font-medium">Cash</th>
                {columns.map((i) => (
                  <th key={i.id} className="px-3 py-2 text-right font-medium">
                    {i.symbol}
                    <span className="block text-[10px] font-normal normal-case">₹{formatPrice(i.startingPrice)}</span>
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Capital</th>
                {!applied && distribution === "PER_TEAM" && <th className="px-2" />}
              </tr>
              {!applied && distribution === "PER_TEAM" && (
                <tr className="border-b border-border bg-surface-raised/50">
                  <td className="sticky left-0 z-10 bg-surface-raised px-4 py-1.5 text-xs text-fg-muted">Fill column</td>
                  {[{ id: "cash" }, ...columns].map((col) => (
                    <td key={col.id} className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <Input aria-label={`Fill ${col.id}`} value={fill[col.id] ?? ""} onChange={(e) => setFill({ ...fill, [col.id]: e.target.value })} className="h-6 w-20 text-right text-xs" />
                        <Button variant="ghost" size="icon-sm" aria-label={`Apply to column ${col.id}`} onClick={() => fillColumn(col.id)}>
                          <ArrowDown className="size-3" />
                        </Button>
                      </div>
                    </td>
                  ))}
                  <td colSpan={2} />
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map(({ id, label, row }) => (
                <tr key={id} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-2 font-medium text-fg-primary">{label}</td>
                  <td className="px-3 py-2 text-right">
                    {applied ? formatINR(row.cash, 0) : <MoneyInput aria-label={`${label} cash`} value={row.cash} onValueChange={(v) => setCell(id, "cash", v ?? 0)} className="ml-auto w-32 [&_input]:h-7 [&_input]:text-right" />}
                  </td>
                  {columns.map((i) => (
                    <td key={i.id} className="px-3 py-2 text-right">
                      {applied ? formatQuantity(row.shares[i.id] ?? 0) : <Input aria-label={`${label} ${i.symbol}`} inputMode="numeric" value={row.shares[i.id] ?? 0} onChange={(e) => setCell(id, i.id, Number(e.target.value.replace(/\D/g, "")) || 0)} className="ml-auto h-7 w-20 text-right" />}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-fg-primary tabular-nums">{formatINR(allocationValue(state, applied ? row : { cash: row.cash, shares: mode === "CASH_ONLY" ? {} : row.shares }), 0)}</td>
                  {!applied && distribution === "PER_TEAM" && (
                    <td className="px-2">
                      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${label} to all teams`} onClick={() => copyToAll(id)}>
                        <Copy className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {columns.length > 0 && (
              <tfoot>
                <tr className="border-t border-border-strong bg-surface-raised text-xs">
                  <td className="sticky left-0 z-10 bg-surface-raised px-4 py-2 text-fg-secondary">Supply used</td>
                  <td />
                  {columns.map((i) => {
                    const used = applied ? state.teams.reduce((s, t) => s + (plan.applied[t.id]?.shares[i.id] ?? 0), 0) : (usage[i.id] ?? 0);
                    return (
                      <td key={i.id} className={cn("px-3 py-2 text-right tabular-nums", used > i.supply ? "text-warning" : "text-fg-secondary")}>
                        {formatQuantity(used)} / {formatQuantity(i.supply)}
                      </td>
                    );
                  })}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tier="confirm"
        title="Apply starting allocations?"
        description={`${state.teams.length} ALLOCATION journals are posted and the plan is locked. The event becomes Ready to start.`}
        confirmLabel="Apply allocations"
        onConfirm={({ idempotencyKey }) => hostAction(applyAllocations(state.event.id, planPayload, idempotencyKey), (v) => `Allocations applied to ${v.journals} teams`)}
      >
        <p className="text-[13px] text-fg-secondary">
          Each team receives {mode === "CASH_ONLY" ? "cash only" : "cash and shares"}, {distribution === "IDENTICAL" ? `identical: ${formatINR(allocationValue(state, effective(state.teams[0]?.id ?? "")), 0)} capital each` : "as set per team"}.
        </p>
      </ConfirmActionDialog>
    </div>
  );
}

/* ───────────────────────── Rounds ───────────────────────── */

type RoundRow = RoundDraft & { key: string; status: string; number: number };

export function SetupRoundsScreen() {
  const { state } = useHostEvent();
  return <RoundsEditor key={`${state.event.id}-${state.audit.filter((a) => a.type === "ROUNDS_UPDATED" || a.type === "ROUND_STARTED").length}`} state={state} />;
}

function RoundsEditor({ state }: { state: EventState }) {
  const [rows, setRows] = useState<RoundRow[]>(() =>
    state.rounds.map((r) => ({ key: r.id, id: r.id, name: r.name, type: r.type, durationSeconds: r.durationSeconds, tradableInstrumentIds: r.tradableInstrumentIds, leaderboardVisibilityOverride: r.leaderboardVisibilityOverride, status: r.status, number: r.number })),
  );
  const [pending, setPending] = useState(false);
  const update = (key: string, patch: Partial<RoundRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const save = async () => {
    setPending(true);
    await hostAction(saveRounds(state.event.id, rows.map(({ id, name, type, durationSeconds, tradableInstrumentIds, leaderboardVisibilityOverride }) => ({ id, name, type, durationSeconds, tradableInstrumentIds, leaderboardVisibilityOverride }))), (r) => `Round schedule saved (${r.length} rounds)`);
    setPending(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Rounds"
        description="Ordered schedule. Started rounds are locked; upcoming rounds can be edited, reordered or removed."
        actions={
          <>
            <Button variant="secondary" onClick={() => setRows((list) => [...list, { key: `new-${list.length}-${Date.now()}`, id: null, name: `Round ${list.length}`, type: "TRADING", durationSeconds: 900, tradableInstrumentIds: "ALL", leaderboardVisibilityOverride: null, status: "PENDING", number: list.length }])}>
              <Plus className="size-3.5" /> Add round
            </Button>
            <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save schedule"}</Button>
          </>
        }
      />
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const locked = row.status !== "PENDING";
          const news = state.news.filter((n) => n.roundId === row.id);
          const firstEditable = rows.findIndex((r) => r.status === "PENDING");
          return (
            <Card key={row.key} className={cn("px-4 py-3.5", locked && "bg-surface/60")}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-raised text-sm font-semibold text-fg-secondary tabular-nums">{index}</span>
                <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr_1fr]">
                  <Field label="Name" htmlFor={`round-name-${row.key}`}>
                    <Input id={`round-name-${row.key}`} value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} />
                  </Field>
                  <Field label="Type">
                    <Select value={row.type} disabled={locked} onValueChange={(v) => update(row.key, { type: v as RoundType })} options={[{ value: "BRIEFING", label: "Briefing (no trading)" }, { value: "TRADING", label: "Trading" }]} />
                  </Field>
                  <Field label="Minutes" htmlFor={`round-min-${row.key}`}>
                    <Input id={`round-min-${row.key}`} inputMode="decimal" disabled={locked} value={row.durationSeconds / 60} onChange={(e) => update(row.key, { durationSeconds: Math.round((Number(e.target.value) || 0) * 60) })} />
                  </Field>
                  <Field label="Tradable stocks">
                    <TradablePicker state={state} value={row.tradableInstrumentIds} disabled={locked} onChange={(v) => update(row.key, { tradableInstrumentIds: v })} />
                  </Field>
                  <Field label="Leaderboard override">
                    <Select
                      value={row.leaderboardVisibilityOverride ?? "NONE"}
                      onValueChange={(v) => update(row.key, { leaderboardVisibilityOverride: v === "NONE" ? null : (v as ParticipantLeaderboardVisibility) })}
                      options={[{ value: "NONE", label: "Event default" }, { value: "FULL", label: "Full" }, { value: "TOP_N", label: "Top N" }, { value: "OWN_RANK", label: "Own rank" }, { value: "HIDDEN", label: "Hidden" }]}
                    />
                  </Field>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-center">
                  <RoundStatusBadge status={row.status as "PENDING"} />
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={locked || index <= firstEditable || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={locked || index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove round" disabled={locked || rows.length <= 1} onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}><Trash className="size-3.5" /></Button>
                </div>
              </div>
              <p className="mt-2 pl-11 text-xs text-fg-muted">
                Assigned news: {news.length ? news.map((n) => `#${n.number}`).join(", ") : "none"} <span className="text-fg-muted">(assign stories from the News desk)</span>
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TradablePicker({ state, value, disabled, onChange }: { state: EventState; value: string[] | "ALL"; disabled: boolean; onChange: (value: string[] | "ALL") => void }) {
  const [open, setOpen] = useState(false);
  const selected = value === "ALL" ? state.instruments.map((i) => i.id) : value;
  return (
    <>
      <Button variant="secondary" className="w-full justify-between" disabled={disabled} onClick={() => setOpen(true)}>
        <span className="truncate">{value === "ALL" ? "All stocks" : `${value.length} of ${state.instruments.length} stocks`}</span>
        <Pencil className="size-3 text-fg-muted" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Tradable stocks" description="Stocks not selected stay visible but cannot be traded in this round." size="sm" footer={<Button variant="primary" onClick={() => setOpen(false)}>Done</Button>}>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-[13px] font-medium">
              <Checkbox checked={value === "ALL"} onCheckedChange={(checked) => onChange(checked ? "ALL" : [])} label="All stocks" />
              All stocks
            </label>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
              {state.instruments.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={selected.includes(i.id)}
                    onCheckedChange={(checked) => {
                      const next = checked ? [...new Set([...selected, i.id])] : selected.filter((id) => id !== i.id);
                      onChange(next.length === state.instruments.length ? "ALL" : next);
                    }}
                    label={i.symbol}
                  />
                  {i.symbol}
                </label>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
