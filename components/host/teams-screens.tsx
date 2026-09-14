"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Coins, Eye, EyeOff, KeyRound, Layers, Plus, Printer, RotateCcw, UserCheck, UserPlus, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Delta } from "@/components/ui/delta";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Avatar, EmptyState, KeyValueList, PageHeader, StatTile } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamStatusBadge } from "@/components/market/status";
import { AdjustmentsTable, HoldingsTable, LedgerTable, TradesTable } from "@/components/market/tables";
import { computeLeaderboard } from "@/lib/domain/leaderboard";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { teamCash, teamShares } from "@/lib/domain/portfolio";
import type { AdjustmentType, EventState, Team } from "@/lib/domain/types";
import { addTeams, adjustTeamCash, adjustTeamHolding, regenerateTeamPin, resetTeam, setTeamStatus, updateTeam } from "@/lib/mock/commands";
import { useNow } from "@/lib/mock/hooks";
import { useOnlineTeams } from "@/lib/mock/runtime";
import { ledgerForTeam, teamSummary, tradesForTeam } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, hostBase, useHostEvent } from "./host-context";

type TeamRow = { team: Team; cash: number; netWorth: number; returnPct: number; rank: number | null; capitalBase: number };

export function TeamsScreen() {
  const { state, eventId } = useHostEvent();
  const router = useRouter();
  const online = useOnlineTeams(eventId);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Team | null>(null);
  const [pinTarget, setPinTarget] = useState<Team | null>(null);
  const [capitalTarget, setCapitalTarget] = useState<Team | null>(null);

  const rows: TeamRow[] = useMemo(() => {
    const board = computeLeaderboard(state);
    return state.teams.map((team) => {
      const summary = teamSummary(state, team.id)!;
      return { team, cash: summary.cash, netWorth: summary.netWorth, returnPct: summary.returnPct, capitalBase: summary.capitalBase, rank: board.find((r) => r.teamId === team.id)?.rank ?? null };
    });
  }, [state]);

  const toggleReveal = (teamId: string) =>
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Teams"
        description={`${state.teams.length} teams · capital rule: ${state.event.capitalRule === "SAME" ? `same for all (${formatINR(state.event.defaultStartingCash, 0)} cash)` : "custom per team"}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPrintOpen(true)}>
              <Printer className="size-3.5" />
              Print credentials
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)} disabled={state.event.status === "COMPLETED"}>
              <UserPlus className="size-3.5" />
              Add teams
            </Button>
          </>
        }
      />
      <Card>
        <DataTable<TeamRow>
          rows={rows}
          rowKey={(r) => r.team.id}
          onRowClick={(r) => router.push(`${hostBase(eventId)}/teams/${r.team.id}`)}
          rowLabel={(r) => `Open ${r.team.name}`}
          initialSort={{ key: "team", direction: "asc" }}
          minWidth={1180}
          columns={[
            {
              key: "team",
              header: "Team",
              sticky: true,
              sortValue: (r) => r.team.order,
              cell: (r) => (
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.team.name} size="sm" />
                  <span className="font-medium text-fg-primary">{r.team.name}</span>
                </span>
              ),
            },
            { key: "code", header: "Login code", sortValue: (r) => r.team.loginCode, cell: (r) => <span className="font-mono text-xs">{r.team.loginCode}</span> },
            {
              key: "pin",
              header: "PIN",
              cell: (r) => (
                <span className="flex items-center gap-1">
                  <span className="w-10 font-mono text-xs tabular-nums">{revealed.has(r.team.id) ? r.team.pin : "••••"}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={revealed.has(r.team.id) ? `Hide PIN for ${r.team.name}` : `Reveal PIN for ${r.team.name}`} onClick={(e) => { e.stopPropagation(); toggleReveal(r.team.id); }}>
                    {revealed.has(r.team.id) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Regenerate PIN for ${r.team.name}`} onClick={(e) => { e.stopPropagation(); setPinTarget(r.team); }}>
                    <KeyRound className="size-3.5" />
                  </Button>
                </span>
              ),
            },
            {
              key: "capital",
              header: "Starting capital",
              align: "right",
              sortValue: (r) => r.capitalBase,
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  {formatINR(state.event.allocationsApplied ? r.capitalBase : r.team.startingCash, 0)}
                  {state.event.capitalRule === "CUSTOM" && !state.event.allocationsApplied && (
                    <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setCapitalTarget(r.team); }}>
                      Edit
                    </Button>
                  )}
                </span>
              ),
            },
            { key: "cash", header: "Cash", align: "right", sortValue: (r) => r.cash, cell: (r) => formatINR(r.cash) },
            { key: "worth", header: "Net worth", align: "right", sortValue: (r) => r.netWorth, cell: (r) => <span className="font-medium text-fg-primary">{formatINR(r.netWorth)}</span> },
            { key: "return", header: "Return", align: "right", sortValue: (r) => r.returnPct, cell: (r) => <Delta value={r.returnPct} variant="pill" /> },
            { key: "rank", header: "Rank", align: "right", sortValue: (r) => r.rank ?? 999, cell: (r) => (r.rank ? `#${r.rank}` : "—") },
            { key: "status", header: "Status", sortValue: (r) => r.team.status, cell: (r) => <TeamStatusBadge status={r.team.status} /> },
            {
              key: "online",
              header: "Online",
              sortValue: (r) => Number(online.has(r.team.id)),
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5 text-xs text-fg-secondary">
                  <span className={cn("size-2 rounded-full", online.has(r.team.id) ? "bg-accent" : "bg-border-strong")} aria-hidden />
                  {online.has(r.team.id) ? "Online" : "Offline"}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (r) => (
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setStatusTarget(r.team); }}>
                  {r.team.status === "ACTIVE" ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                  {r.team.status === "ACTIVE" ? "Disable" : "Enable"}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <p className="text-xs text-fg-muted">&ldquo;Online&rdquo; reflects team terminals open in this browser (prototype presence over BroadcastChannel).</p>

      <AddTeamsDialog state={state} open={addOpen} onOpenChange={setAddOpen} />
      <CredentialsDialog state={state} open={printOpen} onOpenChange={setPrintOpen} />
      <ConfirmActionDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        tier="confirm"
        tone={statusTarget?.status === "ACTIVE" ? "warning" : "accent"}
        title={statusTarget?.status === "ACTIVE" ? `Disable ${statusTarget?.name}?` : `Enable ${statusTarget?.name}?`}
        description={statusTarget?.status === "ACTIVE" ? "The team can no longer sign in, propose or accept trades. Its portfolio stays on the leaderboard." : "The team can sign in and trade again."}
        confirmLabel={statusTarget?.status === "ACTIVE" ? "Disable team" : "Enable team"}
        onConfirm={() => hostAction(setTeamStatus(eventId, statusTarget!.id, statusTarget!.status !== "ACTIVE"), (t) => `${t.name} ${t.status === "ACTIVE" ? "enabled" : "disabled"}`)}
      />
      <ConfirmActionDialog
        open={pinTarget !== null}
        onOpenChange={(open) => !open && setPinTarget(null)}
        tier="confirm"
        title={`Regenerate PIN for ${pinTarget?.name}?`}
        description="The old PIN stops working for new sign-ins. Hand the new PIN to the team."
        confirmLabel="Regenerate PIN"
        onConfirm={() => hostAction(regenerateTeamPin(eventId, pinTarget!.id), (t) => `New PIN for ${t.name}: ${t.pin}`)}
      />
      <CapitalDialog state={state} team={capitalTarget} onClose={() => setCapitalTarget(null)} />
    </div>
  );
}

function AddTeamsDialog({ state, open, onOpenChange }: { state: EventState; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState("");
  const [cash, setCash] = useState<number | null>(state.event.defaultStartingCash);
  const [pending, setPending] = useState(false);
  const names = mode === "single" ? [name] : bulk.split(/\n|,/).map((n) => n.trim()).filter(Boolean);

  const submit = async () => {
    setPending(true);
    const result = await hostAction(addTeams(state.event.id, names, state.event.capitalRule === "CUSTOM" ? (cash ?? undefined) : undefined), (teams) => `${teams.length} team${teams.length === 1 ? "" : "s"} added`, state.event.allocationsApplied ? "Late teams received the starting allocation automatically." : undefined);
    setPending(false);
    if (result.ok) {
      setName("");
      setBulk("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add teams"
        description="Login codes and PINs are generated automatically."
        icon={<Plus className="size-4" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={pending || names.every((n) => n.length < 2)}>
              {pending ? "Adding…" : mode === "single" ? "Add team" : `Add ${names.length} teams`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SegmentedControl options={[{ value: "single", label: "Single team" }, { value: "bulk", label: "Bulk add" }]} value={mode} onChange={setMode} label="Add mode" size="md" />
          {mode === "single" ? (
            <Field label="Team name" htmlFor="add-team-name">
              <Input id="add-team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nifty Ninjas" autoFocus />
            </Field>
          ) : (
            <Field label="Team names" htmlFor="add-team-bulk" hint="One per line, or separated by commas.">
              <Textarea id="add-team-bulk" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Nifty Ninjas\nThe Arbitrageurs\nDividend Dynasty"} />
            </Field>
          )}
          {state.event.capitalRule === "CUSTOM" && (
            <Field label="Starting cash for these teams" htmlFor="add-team-cash">
              <MoneyInput id="add-team-cash" value={cash} onValueChange={setCash} />
            </Field>
          )}
          {state.event.allocationsApplied && <p className="text-xs text-fg-muted">Allocations are already applied, so new teams receive the identical starting allocation as a ledger entry.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CapitalDialog({ state, team, onClose }: { state: EventState; team: Team | null; onClose: () => void }) {
  const [cash, setCash] = useState<number | null>(null);
  return (
    <ConfirmActionDialog
      open={team !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setCash(null);
        }
      }}
      tier="confirm"
      title={`Starting cash for ${team?.name}`}
      description="Custom capital is set before allocations are applied."
      confirmLabel="Save starting cash"
      canConfirm={cash !== null && cash >= 0}
      onConfirm={() => hostAction(updateTeam(state.event.id, { teamId: team!.id, startingCash: cash! }), (t) => `${t.name} starts with ${formatINR(t.startingCash, 0)} cash`)}
    >
      <Field label="Starting cash" htmlFor="capital-cash">
        <MoneyInput id="capital-cash" value={cash ?? team?.startingCash ?? null} onValueChange={setCash} />
      </Field>
    </ConfirmActionDialog>
  );
}

function CredentialsDialog({ state, open, onOpenChange }: { state: EventState; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Team credentials"
        description={`Print and cut out one slip per team. Join at /join/${state.event.code}.`}
        size="xl"
        icon={<Printer className="size-4" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="size-3.5" />
              Print
            </Button>
          </>
        }
      >
        <div className="print-area grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.teams.map((team) => (
            <div key={team.id} className="rounded-md border border-dashed border-border-strong p-3">
              <p className="text-[11px] tracking-wide text-fg-muted uppercase">{state.event.name}</p>
              <p className="mt-1 text-[15px] font-semibold text-fg-primary">{team.name}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-fg-muted">Event code</dt><dd className="font-mono font-semibold text-fg-primary">{state.event.code}</dd></div>
                <div><dt className="text-fg-muted">Team</dt><dd className="font-mono font-semibold text-fg-primary">{team.loginCode}</dd></div>
                <div><dt className="text-fg-muted">PIN</dt><dd className="font-mono font-semibold text-fg-primary">{team.pin}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Team detail ───────────────────────── */

export function TeamDetailScreen() {
  const { state, eventId } = useHostEvent();
  const params = useParams<{ teamId: string }>();
  const now = useNow();
  const teamId = decodeURIComponent(params.teamId);
  const summary = useMemo(() => teamSummary(state, teamId), [state, teamId]);
  const ledger = useMemo(() => ledgerForTeam(state, teamId), [state, teamId]);
  const [dialog, setDialog] = useState<"cash" | "holding" | "reset" | "status" | null>(null);

  if (!summary) {
    return (
      <Card>
        <EmptyState title="Team not found" action={<Link href={`${hostBase(eventId)}/teams`} className={buttonClasses({ variant: "secondary" })}>Back to teams</Link>} />
      </Card>
    );
  }
  const { team } = summary;
  const adjustments = state.adjustments.filter((a) => a.teamId === teamId);

  return (
    <div className="flex flex-col gap-3">
      <Link href={`${hostBase(eventId)}/teams`} className="inline-flex w-fit items-center gap-1.5 rounded text-xs text-fg-secondary hover:text-fg-primary">
        <ArrowLeft className="size-3.5" />
        Teams
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={team.name} size="lg" tone="accent" />
            {team.name}
          </span>
        }
        meta={
          <>
            <TeamStatusBadge status={team.status} />
            <Badge tone="outline" className="font-mono">{team.loginCode}</Badge>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog("cash")}>
              <Coins className="size-3.5" /> Adjust cash
            </Button>
            <Button variant="secondary" onClick={() => setDialog("holding")}>
              <Layers className="size-3.5" /> Adjust holding
            </Button>
            <Button variant="secondary" onClick={() => setDialog("status")}>
              {team.status === "ACTIVE" ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
              {team.status === "ACTIVE" ? "Disable" : "Enable"}
            </Button>
            <Button variant="warning-outline" onClick={() => setDialog("reset")} disabled={!state.event.allocationsApplied}>
              <RotateCcw className="size-3.5" /> Reset team
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Net worth" value={formatINR(summary.netWorth)} sub={`Cash ${formatINR(summary.cash)}`} />
        <StatTile label="Return" value={formatPct(summary.returnPct)} valueClassName={summary.returnPct > 0 ? "text-positive" : summary.returnPct < 0 ? "text-negative" : undefined} sub={`Base ${formatINR(summary.capitalBase, 0)}`} />
        <StatTile label="Rank" value={summary.rank ? `#${summary.rank}` : "—"} sub={`of ${state.teams.length} (live)`} />
        <StatTile label="Realized / unrealized" value={<Delta value={summary.realizedPnl + summary.unrealizedPnl} format="inr" />} sub={`${formatINR(summary.realizedPnl)} realized`} />
      </div>
      <Card>
        <Tabs defaultValue="holdings">
          <TabsList>
            <TabsTrigger value="holdings" count={summary.holdings.length}>Holdings</TabsTrigger>
            <TabsTrigger value="ledger" count={ledger.length}>Ledger</TabsTrigger>
            <TabsTrigger value="trades" count={tradesForTeam(state, teamId).length}>Trades</TabsTrigger>
            <TabsTrigger value="adjustments" count={adjustments.length}>Adjustments</TabsTrigger>
          </TabsList>
          <TabsContent value="holdings"><HoldingsTable state={state} holdings={summary.holdings} /></TabsContent>
          <TabsContent value="ledger"><LedgerTable state={state} rows={ledger} now={now} /></TabsContent>
          <TabsContent value="trades"><TradesTable state={state} trades={tradesForTeam(state, teamId)} perspectiveTeamId={teamId} now={now} /></TabsContent>
          <TabsContent value="adjustments"><AdjustmentsTable state={state} teamId={teamId} /></TabsContent>
        </Tabs>
      </Card>

      <CashAdjustmentDialog state={state} team={team} open={dialog === "cash"} onClose={() => setDialog(null)} />
      <HoldingAdjustmentDialog state={state} team={team} open={dialog === "holding"} onClose={() => setDialog(null)} />
      <ConfirmActionDialog
        open={dialog === "status"}
        onOpenChange={(open) => !open && setDialog(null)}
        tier="confirm"
        tone={team.status === "ACTIVE" ? "warning" : "accent"}
        title={team.status === "ACTIVE" ? `Disable ${team.name}?` : `Enable ${team.name}?`}
        description={team.status === "ACTIVE" ? "The team cannot sign in, propose or accept trades until re-enabled." : "The team can trade again."}
        confirmLabel={team.status === "ACTIVE" ? "Disable team" : "Enable team"}
        onConfirm={() => hostAction(setTeamStatus(eventId, team.id, team.status !== "ACTIVE"), (t) => `${t.name} ${t.status === "ACTIVE" ? "enabled" : "disabled"}`)}
      />
      <ConfirmActionDialog
        open={dialog === "reset"}
        onOpenChange={(open) => !open && setDialog(null)}
        tier="typed"
        tone="warning"
        title={`Reset ${team.name}?`}
        description="Cash and holdings return to the starting allocation through a RESET journal, realized P&L and capital base are restored, and the team's open proposals are cancelled. History is kept."
        confirmLabel="Reset team"
        typedPhrase={team.name}
        onConfirm={({ reason, idempotencyKey }) => hostAction(resetTeam(eventId, team.id, reason, idempotencyKey), `${team.name} reset to starting allocation`)}
      >
        <KeyValueList
          columns={2}
          items={[
            { label: "Current cash", value: formatINR(summary.cash) },
            { label: "Cash after reset", value: formatINR(state.allocationPlan.applied[team.id]?.cash ?? 0) },
            { label: "Current net worth", value: formatINR(summary.netWorth) },
            { label: "Open proposals cancelled", value: state.proposals.filter((p) => (p.proposerTeamId === team.id || p.counterpartyTeamId === team.id) && (p.status === "PROPOSED" || p.status === "PENDING_APPROVAL")).length },
          ]}
        />
      </ConfirmActionDialog>
    </div>
  );
}

const ADJUSTMENT_OPTIONS: { value: AdjustmentType; label: string; hint: string }[] = [
  { value: "CAPITAL_CHANGE", label: "Capital change", hint: "Moves the capital base too, so return is unchanged" },
  { value: "AWARD", label: "Award", hint: "Adds value and increases return" },
  { value: "PENALTY", label: "Penalty", hint: "Removes value and decreases return" },
  { value: "CORRECTION", label: "Correction", hint: "Fixes an error; affects return" },
];

function CashAdjustmentDialog({ state, team, open, onClose }: { state: EventState; team: Team; open: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<"ADD" | "DEDUCT">("ADD");
  const [amount, setAmount] = useState<number | null>(null);
  const [type, setType] = useState<AdjustmentType>("AWARD");
  const before = teamCash(state, team.id);
  const signed = amount ? (direction === "ADD" ? amount : -amount) : 0;
  const signProblem = (type === "AWARD" && direction === "DEDUCT") || (type === "PENALTY" && direction === "ADD");
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
          setAmount(null);
        }
      }}
      tier="reason"
      tone="warning"
      title={`Adjust cash for ${team.name}`}
      description="Creates an ADJUSTMENT journal against the system adjustments account and an audit record."
      confirmLabel={`${direction === "ADD" ? "Add" : "Deduct"} ${amount ? formatINR(amount) : "cash"}`}
      canConfirm={!!amount && amount > 0 && !signProblem && before + signed >= 0}
      onConfirm={({ reason, idempotencyKey }) =>
        hostAction(adjustTeamCash(state.event.id, { teamId: team.id, amount: signed, adjustmentType: type, reason }, idempotencyKey), `Cash adjusted for ${team.name}`, (a) => `${formatINR(a.before)} → ${formatINR(a.after)}`)
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Direction">
          <SegmentedControl options={[{ value: "ADD", label: "Add cash" }, { value: "DEDUCT", label: "Deduct cash" }]} value={direction} onChange={setDirection} label="Direction" size="md" />
        </Field>
        <Field label="Amount" htmlFor="adj-cash-amount">
          <MoneyInput id="adj-cash-amount" value={amount} onValueChange={setAmount} />
        </Field>
        <Field label="Adjustment type" htmlFor="adj-cash-type" className="sm:col-span-2" error={signProblem ? (type === "AWARD" ? "An award must add cash." : "A penalty must deduct cash.") : undefined} hint={ADJUSTMENT_OPTIONS.find((o) => o.value === type)?.hint}>
          <Select id="adj-cash-type" value={type} onValueChange={(v) => setType(v as AdjustmentType)} options={ADJUSTMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </Field>
      </div>
      <BeforeAfterPanel before={formatINR(before)} after={formatINR(before + signed)} invalid={before + signed < 0} note={type === "CAPITAL_CHANGE" ? `Capital base ${formatINR(state.capitalBase[team.id] ?? 0, 0)} → ${formatINR((state.capitalBase[team.id] ?? 0) + signed, 0)}` : "Capital base unchanged"} />
    </ConfirmActionDialog>
  );
}

function HoldingAdjustmentDialog({ state, team, open, onClose }: { state: EventState; team: Team; open: boolean; onClose: () => void }) {
  const [instrumentId, setInstrumentId] = useState(state.instruments[0]?.id ?? "");
  const [direction, setDirection] = useState<"ADD" | "REMOVE">("ADD");
  const [quantityText, setQuantityText] = useState("");
  const [type, setType] = useState<AdjustmentType>("CORRECTION");
  const quantity = Number(quantityText) || 0;
  const signed = direction === "ADD" ? quantity : -quantity;
  const before = instrumentId ? teamShares(state, team.id, instrumentId) : 0;
  const price = state.prices[instrumentId]?.price ?? 0;
  const signProblem = (type === "AWARD" && direction === "REMOVE") || (type === "PENALTY" && direction === "ADD");
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
          setQuantityText("");
        }
      }}
      tier="reason"
      tone="warning"
      title={`Adjust holding for ${team.name}`}
      description="Shares move between the team and the system adjustments account through a balanced journal."
      confirmLabel={`${direction === "ADD" ? "Add" : "Remove"} ${quantity || ""} shares`}
      canConfirm={quantity > 0 && !signProblem && before + signed >= 0}
      onConfirm={({ reason, idempotencyKey }) =>
        hostAction(adjustTeamHolding(state.event.id, { teamId: team.id, instrumentId, quantity: signed, adjustmentType: type, reason }, idempotencyKey), `Holding adjusted for ${team.name}`, (a) => `${a.before} → ${a.after} shares`)
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stock" htmlFor="adj-hold-stock">
          <Select id="adj-hold-stock" value={instrumentId} onValueChange={setInstrumentId} options={state.instruments.map((i) => ({ value: i.id, label: `${i.symbol} · ${i.name}` }))} />
        </Field>
        <Field label="Direction">
          <SegmentedControl options={[{ value: "ADD", label: "Add shares" }, { value: "REMOVE", label: "Remove shares" }]} value={direction} onChange={setDirection} label="Direction" size="md" />
        </Field>
        <Field label="Quantity" htmlFor="adj-hold-qty">
          <Input id="adj-hold-qty" inputMode="numeric" value={quantityText} onChange={(e) => setQuantityText(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Adjustment type" htmlFor="adj-hold-type" error={signProblem ? "Direction does not match this type." : undefined} hint={ADJUSTMENT_OPTIONS.find((o) => o.value === type)?.hint}>
          <Select id="adj-hold-type" value={type} onValueChange={(v) => setType(v as AdjustmentType)} options={ADJUSTMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </Field>
      </div>
      <BeforeAfterPanel before={`${before} shares`} after={`${before + signed} shares`} invalid={before + signed < 0} note={`Value at reference price ₹${formatPrice(price)}: ${formatINR(Math.abs(signed) * price)}`} />
    </ConfirmActionDialog>
  );
}

function BeforeAfterPanel({ before, after, invalid, note }: { before: string; after: string; invalid: boolean; note?: string }) {
  return (
    <div className="mt-1 rounded-md border border-border bg-surface-raised px-3.5 py-3">
      <div className="flex items-center justify-between gap-4 text-[13px]">
        <div>
          <p className="text-[11px] tracking-wide text-fg-muted uppercase">Before</p>
          <p className="font-medium text-fg-primary tabular-nums">{before}</p>
        </div>
        <span className="text-fg-muted">→</span>
        <div className="text-right">
          <p className="text-[11px] tracking-wide text-fg-muted uppercase">After</p>
          <p className={cn("font-semibold tabular-nums", invalid ? "text-warning" : "text-fg-primary")}>{after}</p>
        </div>
      </div>
      {note && <p className="mt-2 border-t border-border pt-2 text-xs text-fg-muted">{note}</p>}
      {invalid && <p className="mt-1 text-xs text-warning">Balances can never go negative.</p>}
    </div>
  );
}
