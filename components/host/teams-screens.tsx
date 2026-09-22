"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Coins, Flag, KeyRound, Layers, Plus, Printer, RotateCcw, Search, UserCheck, UserX, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
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
import { computeLeaderboard, sharedRanks } from "@/lib/domain/leaderboard";
import { monitorProposal } from "@/lib/domain/monitoring";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { teamCash, teamShares } from "@/lib/domain/portfolio";
import type { AdjustmentType, EventState, Team } from "@/lib/domain/types";
import { addTeams, adjustTeamCash, adjustTeamHolding, regenerateTeamPin, resetTeam, setTeamStatus, updateTeam } from "@/lib/mock/commands";
import { formatClock, formatQuantity } from "@/lib/format";
import { useNow } from "@/lib/mock/hooks";
import { useOnlineTeams } from "@/lib/mock/runtime";
import { ledgerForTeam, symbolOf, teamSummary, tradesForTeam } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { hostAction, hostBase, useHostEvent } from "./host-context";

type TeamRow = { team: Team; cash: number; netWorth: number; returnPct: number; rank: number | null; rankLabel: string; capitalBase: number; open: number };

/**
 * C4 Host Teams (section 16, frame 107:7127): the roster with presence, rank, money and open proposals, and a side
 * panel for the selected team. Every change to money or holdings needs a reason, a confirmation, and lands in the
 * ledger and audit log. Disqualify is intentionally not offered (deferred; not supported by the current engine).
 */
export function TeamsScreen() {
  const { state, eventId } = useHostEvent();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnlineTeams(eventId);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [capitalTarget, setCapitalTarget] = useState<Team | null>(null);

  const rows: TeamRow[] = useMemo(() => {
    const board = computeLeaderboard(state);
    const ranks = sharedRanks(board);
    return state.teams.map((team) => {
      const summary = teamSummary(state, team.id)!;
      const open = state.proposals.filter((p) => (p.proposerTeamId === team.id || p.counterpartyTeamId === team.id) && (p.status === "PROPOSED" || p.status === "PENDING_APPROVAL")).length;
      const row = board.find((r) => r.teamId === team.id);
      return { team, cash: summary.cash, netWorth: summary.netWorth, returnPct: summary.returnPct, capitalBase: summary.capitalBase, rank: row?.rank ?? null, rankLabel: ranks[team.id]?.label ?? (row ? `#${row.rank}` : "—"), open };
    });
  }, [state]);
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => !q || `${r.team.name} ${r.team.loginCode}`.toLowerCase().includes(q)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.team.order - b.team.order);
  const selectedId = params.get("team");
  const selected = rows.find((r) => r.team.id === selectedId) ?? null;
  const select = (id: string | null) => router.replace(id ? `${pathname}?team=${id}` : pathname, { scroll: false });
  const disabled = state.teams.filter((t) => t.status !== "ACTIVE").length;

  return (
    <div className={cn("grid grid-cols-1 gap-4 xl:h-[calc(100dvh-112px-32px-32px)]", selected && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <h1 className="text-h2 font-semibold text-fg-primary">Teams</h1>
          <span className="text-caption text-fg-muted">
            {state.teams.length} teams · {online.size} online · {disabled} disabled
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <label className="relative w-52">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a team"
                aria-label="Find a team"
                className="h-(--control-h) w-full rounded-md border border-border bg-surface pr-3 pl-9 text-[14px] text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent"
              />
            </label>
            <Button variant="ghost" size="sm" onClick={() => setPrintOpen(true)}>
              <Printer className="size-4" /> Credentials
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} disabled={state.event.status === "COMPLETED"}>
              <Plus className="size-4" /> Add team
            </Button>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <caption className="sr-only">Teams</caption>
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="h-9 border-b border-border text-caption text-fg-muted">
                <th scope="col" className="pl-5 text-left font-medium">Team</th>
                <th scope="col" className="px-3 text-left font-medium">Status</th>
                <th scope="col" className="px-3 text-right font-medium">Rank</th>
                <th scope="col" className="px-3 text-right font-medium">Net worth</th>
                <th scope="col" className="px-3 text-right font-medium">Return</th>
                <th scope="col" className="px-3 text-right font-medium">Cash</th>
                <th scope="col" className="px-3 text-right font-medium">Open</th>
                <th scope="col" className="pr-5 pl-3 text-right font-medium">Starting capital</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-meta text-fg-secondary">
                    {state.teams.length === 0 ? "No teams yet. Add teams to hand out login codes." : "No team matches."}
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr
                  key={r.team.id}
                  tabIndex={0}
                  onClick={() => select(r.team.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select(r.team.id))}
                  aria-current={selected?.team.id === r.team.id ? "true" : undefined}
                  className={cn(
                    "h-(--row-h) cursor-pointer border-b border-border-subtle hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
                    selected?.team.id === r.team.id && "bg-accent-soft/50 shadow-[inset_2px_0_0_var(--color-accent)]",
                  )}
                >
                  <td className="pl-5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={r.team.name} size="sm" tone="accent" />
                      <span className="text-[14px] font-medium text-fg-primary">{r.team.name}</span>
                    </span>
                  </td>
                  <td className="px-3">
                    <PresenceBadge team={r.team} online={online.has(r.team.id)} />
                  </td>
                  <td className="px-3 text-right font-mono text-[13px] text-fg-primary">{r.rankLabel}</td>
                  <td className="px-3 text-right font-mono text-[13px] text-fg-primary">{formatINR(r.netWorth, 0)}</td>
                  <td className="px-3 text-right">
                    <Delta value={r.returnPct} showArrow className="font-mono text-[13px]" />
                  </td>
                  <td className="px-3 text-right font-mono text-[13px] text-fg-secondary">{formatINR(r.cash, 0)}</td>
                  <td className={cn("px-3 text-right font-mono text-[13px]", r.open ? "text-fg-primary" : "text-fg-muted")}>{r.open}</td>
                  <td className="pr-5 pl-3 text-right font-mono text-[13px] text-fg-secondary">
                    {formatINR(state.event.allocationsApplied ? r.capitalBase : r.team.startingCash, 0)}
                    {state.event.capitalRule === "CUSTOM" && !state.event.allocationsApplied && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="ml-1 font-sans"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCapitalTarget(r.team);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="shrink-0 border-t border-border px-5 py-2 text-caption text-fg-muted">&ldquo;Online&rdquo; means a team terminal is open (prototype presence in this browser).</p>
      </Card>

      {selected && <TeamPanel key={selected.team.id} state={state} row={selected} online={online.has(selected.team.id)} onClose={() => select(null)} />}

      <AddTeamsDialog state={state} open={addOpen} onOpenChange={setAddOpen} />
      <CredentialsDialog state={state} open={printOpen} onOpenChange={setPrintOpen} />
      <CapitalDialog state={state} team={capitalTarget} onClose={() => setCapitalTarget(null)} />
    </div>
  );
}

function PresenceBadge({ team, online }: { team: Team; online: boolean }) {
  if (team.status !== "ACTIVE") return <Badge tone="warning">Trading disabled</Badge>;
  return online ? (
    <Badge tone="positive" dot>
      Online
    </Badge>
  ) : (
    <Badge tone="outline">Offline</Badge>
  );
}

type PanelDialog = "pin" | "cash" | "holding" | "status" | "reset" | null;

function TeamPanel({ state, row, online, onClose }: { state: EventState; row: TeamRow; online: boolean; onClose: () => void }) {
  const eventId = state.event.id;
  const [dialog, setDialog] = useState<PanelDialog>(null);
  const [showPin, setShowPin] = useState(false);
  const { team } = row;
  const active = team.status === "ACTIVE";
  const approvals = state.proposals.filter((p) => p.status === "PENDING_APPROVAL" && (p.proposerTeamId === team.id || p.counterpartyTeamId === team.id));
  const flagged = state.proposals.filter((p) => (p.status === "PROPOSED" || p.status === "PENDING_APPROVAL") && (p.proposerTeamId === team.id || p.counterpartyTeamId === team.id) && monitorProposal(state, p).flags.length > 0);
  const activity = [...state.audit].filter((a) => a.teamId === team.id || (a.actor.type === "TEAM" && a.actor.teamId === team.id)).slice(-6).reverse();
  const summary = teamSummary(state, team.id)!;

  const actions: { id: Exclude<PanelDialog, null>; icon: ReactNode; title: string; hint: string; tone?: "warning"; disabled?: boolean }[] = [
    { id: "pin", icon: <KeyRound className="size-4" />, title: "Reset PIN…", hint: "Creates a new 4-digit PIN. Share it with the team privately." },
    { id: "cash", icon: <Coins className="size-4" />, title: "Adjust cash…", hint: "Correction, award, penalty or capital change. Needs a reason; the team sees it." },
    { id: "holding", icon: <Layers className="size-4" />, title: "Adjust holdings…", hint: "Add or remove shares. Needs a reason; recorded in the ledger." },
    {
      id: "status",
      icon: active ? <UserX className="size-4" /> : <UserCheck className="size-4" />,
      title: active ? "Disable trading…" : "Enable trading…",
      hint: active ? "The team can't sign in or trade. Its portfolio stays in the standings. You can undo this." : "The team can sign in and trade again.",
      tone: active ? "warning" : undefined,
    },
    { id: "reset", icon: <RotateCcw className="size-4" />, title: "Reset to opening portfolio…", hint: "Returns cash and shares to the starting allocation. Type the team name to confirm.", tone: "warning", disabled: !state.event.allocationsApplied },
  ];

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Avatar name={team.name} tone="accent" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2 font-semibold text-fg-primary">{team.name}</h2>
          <p className="text-caption text-fg-muted">
            {row.rankLabel === "—" ? "Not ranked" : `Rank ${row.rankLabel}`} · {active ? (online ? "online now" : "offline") : "trading disabled"} · <span className="font-mono">{team.loginCode}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close team panel" className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg-primary">
          <X className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
          {[
            ["Net worth", <span key="n">{formatINR(row.netWorth, 0)}</span>],
            ["Return", <Delta key="r" value={row.returnPct} showArrow className="font-mono" />],
            ["Cash", <span key="c">{formatINR(row.cash, 0)}</span>],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-surface-raised px-3 py-2.5">
              <dt className="text-caption text-fg-muted">{k}</dt>
              <dd className="mt-0.5 font-mono text-[14px] font-medium text-fg-primary">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex items-center gap-2 rounded-md bg-canvas-subtle px-3 py-2">
          <KeyRound className="size-4 text-fg-muted" aria-hidden />
          <span className="text-caption text-fg-secondary">PIN</span>
          <span className="font-mono text-[14px] text-fg-primary">{showPin ? team.pin : "••••"}</span>
          <button type="button" onClick={() => setShowPin((v) => !v)} className="ml-auto text-caption font-medium text-accent-text hover:underline">
            {showPin ? "Hide" : "Reveal"}
          </button>
        </div>

        {(approvals.length > 0 || flagged.length > 0) && (
          <div className="mt-3 flex flex-col gap-2">
            {[...new Set([...approvals, ...flagged])].map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-md border border-warning/40 bg-warning-soft px-3 py-2.5">
                <Flag className="size-4 shrink-0 text-warning" aria-hidden />
                <p className="min-w-0 flex-1 text-caption text-fg-primary">
                  <span className="font-mono">{p.id}</span> {p.status === "PENDING_APPROVAL" ? "waits for your approval" : "is flagged"}: {formatQuantity(p.quantity)} {symbolOf(state)(p.instrumentId)} at ₹{formatPrice(p.price)}
                </p>
                <Link href={`${hostBase(eventId)}/trades?id=${p.id}`} className="text-caption font-medium text-accent-text hover:underline">
                  Review
                </Link>
              </div>
            ))}
          </div>
        )}

        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
          {actions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={a.disabled}
                onClick={() => setDialog(a.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none disabled:opacity-50"
              >
                <span className={cn("mt-0.5", a.tone === "warning" ? "text-warning" : "text-fg-secondary")}>{a.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14px] font-medium", a.tone === "warning" ? "text-warning" : "text-fg-primary")}>{a.title}</span>
                  <span className="block text-caption text-fg-muted">{a.hint}</span>
                </span>
                <ChevronRight className="mt-0.5 size-4 text-fg-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <section className="mt-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-fg-muted">Recent activity</p>
            <Link href={`${hostBase(eventId)}/teams/${team.id}`} className="text-caption font-medium text-accent-text hover:underline">
              Holdings, ledger & trades
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="mt-2 text-meta text-fg-secondary">Nothing yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {activity.map((a) => (
                <li key={a.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-[13px]">
                  <span className="font-mono text-caption text-fg-muted">{formatClock(a.at, true)}</span>
                  <span className="text-fg-primary">{a.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CashAdjustmentDialog state={state} team={team} open={dialog === "cash"} onClose={() => setDialog(null)} />
      <HoldingAdjustmentDialog state={state} team={team} open={dialog === "holding"} onClose={() => setDialog(null)} />
      <ConfirmActionDialog
        open={dialog === "pin"}
        onOpenChange={(open) => !open && setDialog(null)}
        tier="confirm"
        title={`Reset the PIN for ${team.name}?`}
        description="The old PIN stops working for new sign-ins; devices already signed in stay signed in. Share the new PIN with the team privately."
        confirmLabel="Create new PIN"
        onConfirm={async () => {
          const result = await hostAction(regenerateTeamPin(eventId, team.id), (t) => `New PIN for ${t.name} created`, "Reveal it in the team panel.");
          if (result.ok) setShowPin(true);
          return result;
        }}
      />
      <ConfirmActionDialog
        open={dialog === "status"}
        onOpenChange={(open) => !open && setDialog(null)}
        tier="confirm"
        tone={active ? "warning" : "accent"}
        title={active ? `Disable trading for ${team.name}?` : `Enable ${team.name}?`}
        description={active ? "The team can no longer sign in, propose or accept trades. Its portfolio stays in the standings. You can enable it again at any time." : "The team can sign in and trade again."}
        confirmLabel={active ? "Disable trading" : "Enable team"}
        onConfirm={() => hostAction(setTeamStatus(eventId, team.id, !active), (t) => `${t.name} ${t.status === "ACTIVE" ? "enabled" : "disabled"}`)}
      />
      <ConfirmActionDialog
        open={dialog === "reset"}
        onOpenChange={(open) => !open && setDialog(null)}
        tier="typed"
        tone="warning"
        title={`Reset ${team.name} to its opening portfolio?`}
        description="Cash and holdings return to the starting allocation through a RESET journal, and the team's open proposals are cancelled. History is kept."
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
            { label: "Open proposals cancelled", value: row.open },
          ]}
        />
      </ConfirmActionDialog>
    </Card>
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
