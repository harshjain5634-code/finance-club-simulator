"use client";

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { KeyValueList, PageHeader, SearchInput } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { reconcile, type ReconciliationReport } from "@/lib/domain/ledger";
import type { AuditEvent, AuditType, EventState } from "@/lib/domain/types";
import { formatClock, formatDateTime, titleCase } from "@/lib/format";
import { buildExport, downloadCsv, EXPORTS } from "@/lib/mock/exports";
import { describeActor, teamNameOf } from "@/lib/mock/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useHostEvent } from "./host-context";

/* ───────────────────────── Audit log ───────────────────────── */

export function AuditLogScreen() {
  const { state } = useHostEvent();
  const [type, setType] = useState("ALL");
  const [team, setTeam] = useState("ALL");
  const [round, setRound] = useState("ALL");
  const [actor, setActor] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const name = teamNameOf(state);

  const types = useMemo(() => [...new Set(state.audit.map((a) => a.type))].sort(), [state.audit]);
  const rows = [...state.audit]
    .filter((a) => (type === "ALL" || a.type === type) && (team === "ALL" || a.teamId === team || Object.values(a.refs).includes(team)) && (round === "ALL" || a.roundId === round) && (actor === "ALL" || a.actor.type === actor))
    .filter((a) => {
      const q = query.trim().toLowerCase();
      return !q || `${a.summary} ${a.reason ?? ""} ${a.id} ${Object.values(a.refs).join(" ")}`.toLowerCase().includes(q);
    })
    .reverse();

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Audit log" description="Append-only record of every material action, with reasons and before/after values." meta={<Badge tone="outline">{state.audit.length} events</Badge>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search summary, reason or reference" label="Search audit log" className="w-full sm:w-72" />
          <Select size="sm" className="w-48" aria-label="Type" value={type} onValueChange={setType} options={[{ value: "ALL", label: "All types" }, ...types.map((t) => ({ value: t, label: titleCase(t) }))]} />
          <Select size="sm" className="w-44" aria-label="Team" value={team} onValueChange={setTeam} options={[{ value: "ALL", label: "All teams" }, ...state.teams.map((t) => ({ value: t.id, label: t.name }))]} />
          <Select size="sm" className="w-40" aria-label="Round" value={round} onValueChange={setRound} options={[{ value: "ALL", label: "All rounds" }, ...state.rounds.map((r) => ({ value: r.id, label: `R${r.number} · ${r.name}` }))]} />
          <Select size="sm" className="w-32" aria-label="Actor" value={actor} onValueChange={setActor} options={[{ value: "ALL", label: "Any actor" }, { value: "HOST", label: "Host" }, { value: "TEAM", label: "Team" }, { value: "SYSTEM", label: "System" }]} />
          <span className="ml-auto text-xs text-fg-muted tabular-nums">{rows.length} shown</span>
        </div>
        <DataTable
          rows={rows}
          rowKey={(a) => a.id}
          onRowClick={setSelected}
          rowLabel={(a) => `Audit event ${a.id}`}
          minWidth={1180}
          maxHeight="70vh"
          empty="No audit events match these filters."
          columns={[
            { key: "time", header: "Time", cell: (a) => <span className="tabular-nums">{formatClock(a.at, true)}</span> },
            { key: "type", header: "Type", cell: (a) => <AuditTypeBadge type={a.type} /> },
            { key: "actor", header: "Actor", cell: (a) => <span className="text-fg-secondary">{describeActor(state, a.actor)}</span> },
            { key: "team", header: "Team", cell: (a) => (a.teamId ? name(a.teamId) : <span className="text-fg-muted">—</span>) },
            { key: "round", header: "Round", cell: (a) => { const r = state.rounds.find((x) => x.id === a.roundId); return r ? `R${r.number}` : <span className="text-fg-muted">—</span>; } },
            { key: "summary", header: "Summary", cell: (a) => <span className="block max-w-[28rem] truncate text-fg-primary" title={a.summary}>{a.summary}</span> },
            { key: "reason", header: "Reason", cell: (a) => (a.reason ? <span className="block max-w-56 truncate text-fg-secondary" title={a.reason}>{a.reason}</span> : <span className="text-fg-muted">—</span>) },
          ]}
        />
      </Card>
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <AuditDetail state={state} event={selected} />}
      </Dialog>
    </div>
  );
}

function AuditTypeBadge({ type }: { type: AuditType }) {
  const tone = type.includes("FROZEN") || type.includes("ADJUSTED") || type.includes("RESET") || type.includes("FAILED") || type === "EVENT_ENDED" || type.includes("HALTED") ? "warning" : type.startsWith("TRADE") ? "neutral" : type.includes("RELEASED") || type.includes("STARTED") ? "accent" : "outline";
  return <Badge tone={tone}>{titleCase(type)}</Badge>;
}

function AuditDetail({ state, event }: { state: EventState; event: AuditEvent }) {
  const round = state.rounds.find((r) => r.id === event.roundId);
  return (
    <DrawerContent title={titleCase(event.type)} description={event.summary} width="lg">
      <div className="flex flex-col gap-5">
        <KeyValueList
          columns={2}
          items={[
            { label: "Audit id", value: <span className="font-mono">{event.id}</span> },
            { label: "Time", value: formatDateTime(event.at) },
            { label: "Actor", value: describeActor(state, event.actor) },
            { label: "Team", value: event.teamId ? teamNameOf(state)(event.teamId) : "—" },
            { label: "Round", value: round ? `R${round.number} · ${round.name}` : "—" },
            { label: "Reason", value: event.reason ?? "—" },
          ]}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <JsonPanel title="Before" value={event.before} />
          <JsonPanel title="After" value={event.after} />
        </div>
        <JsonPanel title="Reference ids" value={Object.keys(event.refs).length ? event.refs : null} />
      </div>
    </DrawerContent>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">{title}</h3>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-secondary">{value ? JSON.stringify(value, null, 2) : "—"}</pre>
    </section>
  );
}

/* ───────────────────────── Exports ───────────────────────── */

export function ExportsScreen() {
  const { state } = useHostEvent();
  const [report, setReport] = useState<ReconciliationReport | null>(null);

  const runCheck = () => {
    const result = reconcile(state, Date.now());
    setReport(result);
    if (result.passed) toast.success("Reconciliation passed", "Ledger and projections agree.");
    else toast.warning("Reconciliation failed", "See the failed checks for details.");
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Exports" description="CSV downloads for independent verification. Generated in the browser in Phase 1 (UTF-8, Excel-compatible)." />
      <Card>
        <CardHeader
          title="Reconciliation"
          subtitle={report ? `Checked at ${formatClock(report.checkedAt, true)}` : "Recompute every balance from the journals and compare with stored projections"}
          divider
          action={
            <>
              {report && <Badge tone={report.passed ? "accent" : "warning"} className="h-6 px-2 text-xs">{report.passed ? "✓ PASS" : "FAIL"}</Badge>}
              <Button variant="primary" onClick={runCheck}>
                <RefreshCw className="size-3.5" /> Run check
              </Button>
            </>
          }
        />
        {report ? (
          <ul className="divide-y divide-border">
            {report.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3 px-4 py-2.5">
                {check.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg-primary">{check.label}</p>
                  <p className="text-xs text-fg-muted">{check.detail}</p>
                </div>
                <span className={cn("ml-auto text-xs font-semibold", check.passed ? "text-accent" : "text-warning")}>{check.passed ? "PASS" : "FAIL"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-[13px] text-fg-muted">Run the check before exporting final results.</p>
        )}
      </Card>
      <Card>
        <CardHeader title="Downloads" subtitle={`${state.event.code} · ${state.event.name}`} icon={<FileSpreadsheet className="size-3.5" />} divider />
        <ul className="divide-y divide-border">
          {EXPORTS.map((item) => {
            const rows = buildExport(state, item.kind).rows.length;
            return (
              <li key={item.kind} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg-primary">{item.label}</p>
                  <p className="text-xs text-fg-muted">{item.description}</p>
                </div>
                <span className="text-xs text-fg-secondary tabular-nums">{rows} rows</span>
                <Button variant="secondary" size="sm" onClick={() => downloadCsv(state, item.kind)}>
                  <Download className="size-3.5" /> Download CSV
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">XLSX workbooks are planned for Phase 8. Exports are listed here but not yet written to the audit log (Phase 2).</p>
      </Card>
    </div>
  );
}
