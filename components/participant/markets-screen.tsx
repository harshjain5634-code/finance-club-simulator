"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Delta } from "@/components/ui/delta";
import { PageHeader, SearchInput } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Sparkline } from "@/components/ui/sparkline";
import { InstrumentStateBadge } from "@/components/market/status";
import { SymbolMark } from "@/components/market/tables";
import { formatPrice } from "@/lib/domain/money";
import { instrumentRows, type InstrumentRow } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { stockHref, useTerminal } from "./terminal-context";
import { useWatchlist } from "./watchlist";

type View = "ALL" | "WATCHLIST" | "HALTED";

export function MarketsScreen() {
  const { state, code, teamId } = useTerminal();
  const router = useRouter();
  const { list, toggle } = useWatchlist(state.event.id, teamId);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("ALL");
  const [view, setView] = useState<View>("ALL");

  const rows = useMemo(() => instrumentRows(state, { enabledOnly: true }), [state]);
  const sectors = [...new Set(rows.map((r) => r.instrument.sector))].sort();
  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.instrument.symbol} ${row.instrument.name} ${row.instrument.sector}`.toLowerCase().includes(q)) return false;
    if (sector !== "ALL" && row.instrument.sector !== sector) return false;
    if (view === "WATCHLIST" && !list.includes(row.instrument.id)) return false;
    if (view === "HALTED" && !row.instrument.halted) return false;
    return true;
  });

  const modeLabel = state.event.universeMode === "REAL_SIMULATED" ? "Real companies · Simulated market" : "Fictional companies · Simulated market";

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Markets"
        description={`Stocks enabled by the host for ${state.event.code}. Prices move only through host news and host actions.`}
        meta={<Badge tone="outline">{modeLabel}</Badge>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name, ticker or sector" label="Filter stocks" className="w-full sm:w-72" />
          <Select
            value={sector}
            onValueChange={setSector}
            aria-label="Sector"
            className="w-44"
            options={[{ value: "ALL", label: "All sectors" }, ...sectors.map((s) => ({ value: s, label: s }))]}
          />
          <SegmentedControl
            options={[
              { value: "ALL", label: "All" },
              { value: "WATCHLIST", label: `Watchlist (${list.length})` },
              { value: "HALTED", label: "Halted" },
            ]}
            value={view}
            onChange={setView}
            label="Market view"
            size="md"
          />
          <span className="ml-auto text-xs text-fg-muted tabular-nums">
            {filtered.length} of {rows.length} stocks
          </span>
        </div>
        <DataTable<InstrumentRow>
          rows={filtered}
          rowKey={(r) => r.instrument.id}
          onRowClick={(r) => router.push(stockHref(code)(r.instrument.symbol))}
          rowLabel={(r) => `Open ${r.instrument.name}`}
          initialSort={{ key: "company", direction: "asc" }}
          minWidth={980}
          empty={view === "WATCHLIST" ? "Star stocks to add them to your watchlist." : "No stocks match these filters."}
          columns={[
            {
              key: "watch",
              header: <span className="sr-only">Watchlist</span>,
              cell: (r) => {
                const watched = list.includes(r.instrument.id);
                return (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(r.instrument.id);
                    }}
                    aria-pressed={watched}
                    aria-label={watched ? `Remove ${r.instrument.symbol} from watchlist` : `Add ${r.instrument.symbol} to watchlist`}
                    className="grid size-7 place-items-center rounded-md hover:bg-surface-raised"
                  >
                    <Star className={cn("size-4", watched ? "fill-warning text-warning" : "text-fg-muted")} strokeWidth={1.75} />
                  </button>
                );
              },
              className: "w-10 pr-0",
            },
            {
              key: "company",
              header: "Company",
              sortValue: (r) => r.instrument.name,
              cell: (r) => (
                <span className="flex items-center gap-2.5">
                  <SymbolMark symbol={r.instrument.symbol} />
                  <span className="max-w-56 truncate font-medium text-fg-primary">{r.instrument.name}</span>
                </span>
              ),
            },
            { key: "symbol", header: "Symbol", sortValue: (r) => r.instrument.symbol, cell: (r) => <span className="font-mono text-xs text-fg-secondary">{r.instrument.symbol}</span> },
            { key: "sector", header: "Sector", sortValue: (r) => r.instrument.sector, cell: (r) => <span className="text-fg-secondary">{r.instrument.sector}</span> },
            { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, cell: (r) => <span className="font-medium text-fg-primary">{formatPrice(r.price)}</span> },
            { key: "round", header: "Round change", align: "right", sortValue: (r) => r.roundChangePct, cell: (r) => <Delta value={r.roundChangePct} variant="pill" /> },
            { key: "event", header: "Event change", align: "right", sortValue: (r) => r.eventChangePct, cell: (r) => <Delta value={r.eventChangePct} /> },
            { key: "spark", header: "Trend", align: "right", cell: (r) => <Sparkline data={r.sparkline} baseline={r.snapshot.eventOpenPrice} className="ml-auto h-7 w-24" /> },
            { key: "status", header: "Status", sortValue: (r) => Number(r.instrument.halted), cell: (r) => <InstrumentStateBadge halted={r.instrument.halted} enabled={r.instrument.enabled} /> },
          ]}
        />
      </Card>
    </div>
  );
}
