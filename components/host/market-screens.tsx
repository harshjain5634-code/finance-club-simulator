"use client";

import { useState } from "react";
import { Lock, LockOpen, Plus, Snowflake, Trash, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Delta } from "@/components/ui/delta";
import { DrawerContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { InlineBanner, PageHeader } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/controls";
import { InstrumentStateBadge, PriceSourceBadge } from "@/components/market/status";
import { LeaderboardTable } from "@/components/market/tables";
import { BeforeAfter, ImpactLabel } from "@/components/market/widgets";
import { computeLeaderboard } from "@/lib/domain/leaderboard";
import { changePct, formatPct, formatPrice, round2 } from "@/lib/domain/money";
import { configuredImpactOf, describeConfigured, validateNewsItem } from "@/lib/domain/news";
import { applyPercent, applyPriceRules, CLAMP_LABEL, limitsFor } from "@/lib/domain/prices";
import type { NewsDraft } from "@/lib/domain/setup";
import type { EventState, Instrument, NewsImpact, NewsItem, ParticipantLeaderboardVisibility, ProjectorLeaderboardVisibility } from "@/lib/domain/types";
import { formatClock } from "@/lib/format";
import {
  freezeLeaderboard,
  haltInstrument,
  moveInstrumentPricePercent,
  resumeInstrument,
  saveNews,
  setInstrumentPrice,
  setLeaderboardVisibility,
  unfreezeLeaderboard,
} from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { describeActor, instrumentOf, instrumentRows } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, useHostEvent } from "./host-context";

/* ───────────────────────── News editor ───────────────────────── */

type ImpactDraft = Omit<NewsImpact, "id"> & { key: string };

export function NewsEditor({ state, item, onDone }: { state: EventState; item: NewsItem | null; onDone: () => void }) {
  const [headline, setHeadline] = useState(item?.headline ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [roundId, setRoundId] = useState(item?.roundId ?? "ANY");
  const [priority, setPriority] = useState<NewsItem["priority"]>(item?.priority ?? "NORMAL");
  const [ready, setReady] = useState(item ? item.status === "READY" : true);
  const [impacts, setImpacts] = useState<ImpactDraft[]>(() => (item?.impacts ?? []).map((i) => ({ ...i, key: i.id })));
  const [pending, setPending] = useState(false);

  const updateImpact = (key: string, patch: Partial<ImpactDraft>) => setImpacts((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const draftImpacts: NewsImpact[] = impacts.map(({ key, ...rest }) => ({ ...rest, id: key }));
  const error = validateNewsItem({ headline, impacts: draftImpacts });

  const save = async () => {
    setPending(true);
    const draft: NewsDraft = {
      headline,
      body,
      roundId: roundId === "ANY" ? null : roundId,
      priority,
      status: ready ? "READY" : "DRAFT",
      impacts: impacts.map(({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing }) => ({ instrumentId, direction, mode, fixedPct, minPct, maxPct, timing })),
    };
    const result = await hostAction(saveNews(state.event.id, item?.id ?? null, draft), (saved) => `Story #${saved.number} saved`);
    setPending(false);
    if (result.ok) onDone();
  };

  const parsePct = (value: string) => (value === "" ? null : Number(value));

  return (
    <DrawerContent
      title={item ? `Edit story #${item.number}` : "New story"}
      description="Participants only ever see the headline, body and the resulting price move."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={pending || !!error}>{pending ? "Saving…" : "Save story"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Headline" htmlFor="news-headline" required>
          <Input id="news-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Nova Motors secures major government EV contract" />
        </Field>
        <Field label="Body" htmlFor="news-body" hint="Optional detail shown in the news feed.">
          <Textarea id="news-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Round" htmlFor="news-round">
            <Select id="news-round" value={roundId} onValueChange={setRoundId} options={[{ value: "ANY", label: "Any round" }, ...state.rounds.map((r) => ({ value: r.id, label: `R${r.number} · ${r.name}` }))]} />
          </Field>
          <Field label="Priority" htmlFor="news-priority">
            <Select id="news-priority" value={priority} onValueChange={(v) => setPriority(v as NewsItem["priority"])} options={[{ value: "HIGH", label: "High" }, { value: "NORMAL", label: "Normal" }, { value: "LOW", label: "Low" }]} />
          </Field>
          <Field label="Ready for release">
            <div className="flex h-8 items-center gap-2">
              <Switch checked={ready} onCheckedChange={setReady} label="Ready for release" />
              <span className="text-xs text-fg-secondary">{ready ? "Ready" : "Draft"}</span>
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-fg-primary">Price impacts</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setImpacts((list) => [
                  ...list,
                  { key: `draft-${list.length}-${headline.length}-${list.map((i) => i.key).join("").length}`, instrumentId: state.instruments.find((i) => !list.some((l) => l.instrumentId === i.id))?.id ?? state.instruments[0].id, direction: "UP", mode: "FIXED", fixedPct: 5, minPct: null, maxPct: null, timing: "IMMEDIATE" },
                ])
              }
              disabled={impacts.length >= state.instruments.length}
            >
              <Plus className="size-3.5" /> Add stock
            </Button>
          </div>
          {impacts.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong px-4 py-5 text-center text-xs text-fg-muted">No impacts: this story is informational only.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {impacts.map((impact) => (
                <li key={impact.key} className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-raised p-3 sm:grid-cols-[1.3fr_auto_auto_1fr_auto]">
                  <Select size="sm" aria-label="Stock" value={impact.instrumentId} onValueChange={(v) => updateImpact(impact.key, { instrumentId: v })} options={state.instruments.map((i) => ({ value: i.id, label: i.symbol, disabled: impacts.some((o) => o.key !== impact.key && o.instrumentId === i.id) }))} />
                  <SegmentedControl options={[{ value: "UP", label: "Up" }, { value: "DOWN", label: "Down" }]} value={impact.direction} onChange={(v) => updateImpact(impact.key, { direction: v })} label="Direction" />
                  <SegmentedControl options={[{ value: "FIXED", label: "Fixed" }, { value: "RANGE", label: "Range" }]} value={impact.mode} onChange={(v) => updateImpact(impact.key, v === "RANGE" ? { mode: v, minPct: impact.minPct ?? 5, maxPct: impact.maxPct ?? 10 } : { mode: v, fixedPct: impact.fixedPct ?? 5 })} label="Mode" />
                  {impact.mode === "FIXED" ? (
                    <div className="flex items-center gap-1.5">
                      <Input aria-label="Fixed percent" inputMode="decimal" value={impact.fixedPct ?? ""} onChange={(e) => updateImpact(impact.key, { fixedPct: parsePct(e.target.value) })} className="h-7 w-20" />
                      <span className="text-xs text-fg-muted">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Input aria-label="Minimum percent" inputMode="decimal" value={impact.minPct ?? ""} onChange={(e) => updateImpact(impact.key, { minPct: parsePct(e.target.value) })} className="h-7 w-16" />
                      <span className="text-xs text-fg-muted">to</span>
                      <Input aria-label="Maximum percent" inputMode="decimal" value={impact.maxPct ?? ""} onChange={(e) => updateImpact(impact.key, { maxPct: parsePct(e.target.value) })} className="h-7 w-16" />
                      <span className="text-xs text-fg-muted">%</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1">
                    <Select size="sm" aria-label="Timing" className="w-32" value={impact.timing} onValueChange={(v) => updateImpact(impact.key, { timing: v as ImpactDraft["timing"] })} options={[{ value: "IMMEDIATE", label: "Immediate" }, { value: "GRADUAL", label: "Gradual (later)", disabled: true }]} />
                    <Button variant="ghost" size="icon-sm" aria-label="Remove impact" onClick={() => setImpacts((list) => list.filter((i) => i.key !== impact.key))}>
                      <Trash className="size-3.5" />
                    </Button>
                  </div>
                  <p className="col-span-2 text-[11px] text-fg-muted sm:col-span-5">
                    {instrumentOf(state, impact.instrumentId)?.symbol} {describeConfigured(configuredImpactOf({ ...impact, id: impact.key }))} from ₹{formatPrice(state.prices[impact.instrumentId]?.price ?? 0)} now
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && headline.length > 0 && <p className="text-xs text-warning">{error}</p>}
      </div>
    </DrawerContent>
  );
}

/* ───────────────────────── Prices ───────────────────────── */

export function PricesScreen() {
  const { state, eventId } = useHostEvent();
  const now = useNow();
  const [manual, setManual] = useState<{ instrument: Instrument; mode: "SET" | "PERCENT" } | null>(null);
  const [haltTarget, setHaltTarget] = useState<Instrument | null>(null);
  const [historyFilter, setHistoryFilter] = useState("ALL");
  const rows = instrumentRows(state);
  const history = [...state.priceEvents].filter((e) => historyFilter === "ALL" || e.instrumentId === historyFilter).reverse();

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Prices" description="Every price change passes through the circuit limit, floor/ceiling and ₹0.05 tick rounding, and is stored as an immutable price event." />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(r) => r.instrument.id}
          minWidth={1180}
          columns={[
            { key: "symbol", header: "Symbol", sticky: true, sortValue: (r) => r.instrument.symbol, cell: (r) => <span className="block leading-tight"><span className="block font-semibold text-fg-primary">{r.instrument.symbol}</span><span className="block text-[11px] text-fg-muted">{r.instrument.name}</span></span> },
            { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, cell: (r) => <span className="font-semibold text-fg-primary">₹{formatPrice(r.price)}</span> },
            { key: "round", header: "Round change", align: "right", sortValue: (r) => r.roundChangePct, cell: (r) => <Delta value={r.roundChangePct} variant="pill" /> },
            { key: "event", header: "Event change", align: "right", sortValue: (r) => r.eventChangePct, cell: (r) => <Delta value={r.eventChangePct} /> },
            { key: "floor", header: "Floor", align: "right", cell: (r) => (r.instrument.floor ? `₹${formatPrice(r.instrument.floor)}` : "—") },
            { key: "ceiling", header: "Ceiling", align: "right", cell: (r) => (r.instrument.ceiling ? `₹${formatPrice(r.instrument.ceiling)}` : "—") },
            {
              key: "circuit",
              header: "Circuit (round)",
              align: "right",
              cell: (r) => {
                if (r.instrument.circuitPct === null) return "None";
                const used = Math.abs(changePct(r.snapshot.roundOpenPrice, r.price));
                return (
                  <span className={cn("tabular-nums", used >= r.instrument.circuitPct - 0.01 ? "text-warning" : "text-fg-secondary")}>
                    ±{r.instrument.circuitPct}% · {used.toFixed(1)}% used
                  </span>
                );
              },
            },
            { key: "status", header: "Status", cell: (r) => <InstrumentStateBadge halted={r.instrument.halted} enabled={r.instrument.enabled} /> },
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (r) => (
                <span className="inline-flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setManual({ instrument: r.instrument, mode: "SET" })}>Set price</Button>
                  <Button variant="ghost" size="sm" onClick={() => setManual({ instrument: r.instrument, mode: "PERCENT" })}>Move by %</Button>
                  <Button variant={r.instrument.halted ? "warning" : "warning-outline"} size="sm" onClick={() => setHaltTarget(r.instrument)}>
                    {r.instrument.halted ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
                    {r.instrument.halted ? "Resume" : "Halt"}
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Price event history" subtitle="Immutable record of every price change" icon={<TrendingUp className="size-3.5" />} divider action={<Select size="sm" className="w-40" aria-label="Filter price history" value={historyFilter} onValueChange={setHistoryFilter} options={[{ value: "ALL", label: "All stocks" }, ...state.instruments.map((i) => ({ value: i.id, label: i.symbol }))]} />} />
        <DataTable
          rows={history}
          rowKey={(e) => e.id}
          minWidth={1240}
          maxHeight="32rem"
          empty="No price changes yet. News releases and manual moves appear here."
          columns={[
            { key: "time", header: "Time", cell: (e) => <span className="tabular-nums">{formatClock(e.at, true)}</span> },
            { key: "id", header: "Event", cell: (e) => <span className="font-mono text-xs text-fg-secondary">{e.id}</span> },
            { key: "stock", header: "Stock", cell: (e) => <span className="font-medium text-fg-primary">{instrumentOf(state, e.instrumentId)?.symbol}</span> },
            { key: "source", header: "Source", cell: (e) => <PriceSourceBadge source={e.source} /> },
            { key: "move", header: "Previous → new", cell: (e) => <BeforeAfter before={e.previousPrice} after={e.newPrice} /> },
            { key: "configured", header: "Configured", cell: (e) => (e.configuredImpact ? <ImpactLabel configured={e.configuredImpact} /> : "—") },
            { key: "resolved", header: "Resolved", align: "right", cell: (e) => (e.resolvedImpactPct !== null ? <span className="font-mono text-xs">{formatPct(e.resolvedImpactPct)}</span> : "—") },
            { key: "applied", header: "Applied", align: "right", cell: (e) => <Delta value={e.appliedPct} /> },
            { key: "clamp", header: "Limits", cell: (e) => (e.clamped ? <Badge tone="warning">{e.clampReasons.map((r) => CLAMP_LABEL[r]).join(", ")}</Badge> : <span className="text-fg-muted">—</span>) },
            { key: "actor", header: "Actor / reason", cell: (e) => <span className="block max-w-64 truncate text-xs text-fg-secondary" title={e.reason ?? undefined}>{describeActor(state, e.actor)}{e.reason ? ` · ${e.reason}` : ""}</span> },
          ]}
        />
        <p className="border-t border-border px-4 py-2 text-[11px] text-fg-muted">Updated {formatClock(now, true)}</p>
      </Card>

      {manual && <ManualPriceDialog key={`${manual.instrument.id}-${manual.mode}`} state={state} instrument={manual.instrument} mode={manual.mode} onClose={() => setManual(null)} />}
      <ConfirmActionDialog
        open={haltTarget !== null}
        onOpenChange={(open) => !open && setHaltTarget(null)}
        tier="confirm"
        tone="warning"
        title={haltTarget?.halted ? `Resume trading in ${haltTarget?.symbol}?` : `Halt ${haltTarget?.symbol}?`}
        description={haltTarget?.halted ? "Teams can propose and settle trades in this stock again." : "No proposal in this stock can be created or settled until you resume it. Prices can still be moved by news."}
        confirmLabel={haltTarget?.halted ? `Resume ${haltTarget?.symbol}` : `Halt ${haltTarget?.symbol}`}
        onConfirm={() => (haltTarget!.halted ? hostAction(resumeInstrument(eventId, haltTarget!.id), `${haltTarget!.symbol} resumed`) : hostAction(haltInstrument(eventId, haltTarget!.id), `${haltTarget!.symbol} halted`))}
      />
    </div>
  );
}

export function ManualPriceDialog({ state, instrument, mode, onClose }: { state: EventState; instrument: Instrument; mode: "SET" | "PERCENT"; onClose: () => void }) {
  const current = state.prices[instrument.id].price;
  const [target, setTarget] = useState<number | null>(current);
  const [pctText, setPctText] = useState("");
  const [open, setOpen] = useState(true);
  const pct = pctText === "" || pctText === "-" ? null : Number(pctText);
  const proposed = mode === "SET" ? target : pct !== null && Number.isFinite(pct) ? applyPercent(current, pct) : null;
  const result = proposed !== null && proposed > 0 ? applyPriceRules(proposed, limitsFor(state, instrument.id)) : null;

  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) onClose();
      }}
      tier="reason"
      tone="warning"
      title={mode === "SET" ? `Set ${instrument.symbol} price` : `Move ${instrument.symbol} by a percentage`}
      description="A MANUAL price event is recorded with your reason. Portfolios and the leaderboard revalue immediately."
      confirmLabel={result ? `Apply ₹${formatPrice(result.price)}` : "Apply price"}
      canConfirm={!!result && result.price !== current}
      onConfirm={({ reason, idempotencyKey }) =>
        mode === "SET"
          ? hostAction(setInstrumentPrice(state.event.id, instrument.id, target!, reason, idempotencyKey), (v) => v.summary)
          : hostAction(moveInstrumentPricePercent(state.event.id, instrument.id, round2(pct!), reason, idempotencyKey), (v) => v.summary)
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "SET" ? (
          <Field label="New price" htmlFor="manual-price">
            <MoneyInput id="manual-price" value={target} onValueChange={setTarget} />
          </Field>
        ) : (
          <Field label="Move by (%)" htmlFor="manual-pct" hint="Use a negative number to move down, e.g. -3.5">
            <Input id="manual-pct" inputMode="decimal" value={pctText} onChange={(e) => /^-?\d*\.?\d{0,2}$/.test(e.target.value) && setPctText(e.target.value)} />
          </Field>
        )}
        <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-fg-secondary">
          <p>Floor {instrument.floor ? `₹${formatPrice(instrument.floor)}` : "—"} · Ceiling {instrument.ceiling ? `₹${formatPrice(instrument.ceiling)}` : "—"}</p>
          <p className="mt-0.5">Circuit ±{instrument.circuitPct ?? "—"}% from round open ₹{formatPrice(state.prices[instrument.id].roundOpenPrice)}</p>
        </div>
      </div>
      {result && (
        <div className="rounded-md border border-border bg-surface-raised px-3.5 py-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Before → after</span>
            <BeforeAfter before={current} after={result.price} />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-fg-muted">Applied change</span>
            <Delta value={changePct(current, result.price)} />
          </div>
          {result.clamped && <p className="mt-2 text-xs text-warning">Limited by {result.clampReasons.map((r) => CLAMP_LABEL[r].toLowerCase()).join(" and ")}: requested ₹{formatPrice(Math.round(proposed!))}.</p>}
        </div>
      )}
    </ConfirmActionDialog>
  );
}

/* ───────────────────────── Leaderboard control ───────────────────────── */

export function LeaderboardControlScreen() {
  const { state, eventId } = useHostEvent();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const settings = state.event.leaderboard;
  const rows = computeLeaderboard(state);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Leaderboard"
        description="Live standings for the host. Control what participants and the projector see."
        actions={
          <Button variant={settings.frozen ? "warning" : "warning-outline"} onClick={() => setFreezeOpen(true)}>
            <Snowflake className="size-3.5" />
            {settings.frozen ? "Unfreeze leaderboard" : "Freeze leaderboard"}
          </Button>
        }
      />
      {settings.frozen && settings.frozenAt && (
        <InlineBanner tone="warning" icon={<Snowflake className="size-4" />} title={`Frozen at ${formatClock(settings.frozenAt, true)}.`}>
          Participants and the projector see the snapshot; the table below stays live for you.
        </InlineBanner>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Participant visibility" subtitle="What each team terminal shows" divider />
          <div className="flex flex-col gap-3 px-4 py-4">
            <SegmentedControl<ParticipantLeaderboardVisibility>
              options={[
                { value: "FULL", label: "Full" },
                { value: "TOP_N", label: `Top ${settings.participantTopN}` },
                { value: "OWN_RANK", label: "Own rank only" },
                { value: "HIDDEN", label: "Hidden" },
              ]}
              value={settings.participantVisibility}
              onChange={(value) => hostAction(setLeaderboardVisibility(eventId, { participantVisibility: value }), "Participant leaderboard visibility updated")}
              label="Participant leaderboard visibility"
              size="md"
            />
            <p className="text-xs text-fg-muted">In Top {settings.participantTopN}, a team outside the top is still shown its own row, pinned below the table. Round overrides (Setup → Rounds) take precedence.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Projector visibility" subtitle="Independent from participants" divider />
          <div className="flex flex-col gap-3 px-4 py-4">
            <SegmentedControl<ProjectorLeaderboardVisibility>
              options={[
                { value: "FULL", label: "All teams" },
                { value: "TOP_N", label: `Top ${settings.projectorTopN}` },
                { value: "HIDDEN", label: "Hidden" },
              ]}
              value={settings.projectorVisibility}
              onChange={(value) => hostAction(setLeaderboardVisibility(eventId, { projectorVisibility: value }), "Projector leaderboard visibility updated")}
              label="Projector leaderboard visibility"
              size="md"
            />
            <p className="text-xs text-fg-muted">When hidden, the projector skips the leaderboard scene in rotation.</p>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Live standings" subtitle="Return % on capital base · ties: net worth, then name" divider />
        <LeaderboardTable rows={rows} />
      </Card>
      <ConfirmActionDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        tier="confirm"
        tone="warning"
        title={settings.frozen ? "Unfreeze the leaderboard?" : "Freeze the leaderboard?"}
        description={settings.frozen ? "Participants and the projector return to live standings." : "Participants and the projector keep seeing the current standings until you unfreeze. Trading continues normally."}
        confirmLabel={settings.frozen ? "Unfreeze leaderboard" : "Freeze leaderboard"}
        onConfirm={() => (settings.frozen ? hostAction(unfreezeLeaderboard(eventId), "Leaderboard unfrozen") : hostAction(freezeLeaderboard(eventId), "Leaderboard frozen"))}
      />
    </div>
  );
}
