"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Delta } from "@/components/ui/delta";
import { Avatar, PageHeader, SearchInput } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Sparkline } from "@/components/ui/sparkline";
import { InstrumentStateBadge } from "@/components/market/status";
import { useRoundClock } from "@/components/market/round-clock";
import { formatCompactINR, formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { teamShares } from "@/lib/domain/portfolio";
import { formatClock } from "@/lib/format";
import { instrumentRows, instrumentVolume, priceMoves, tradingVolume, type InstrumentRow } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { stockHref, useTerminal } from "./terminal-context";
import { useWatchlist } from "./watchlist";

type View = "ALL" | "WATCHLIST" | "OWNED" | "HALTED";

/** Indian money shorthand: full rupees below a lakh, then "₹14.80L" / "₹1.20Cr". */
const volumeLabel = (paise: number) => (Math.abs(paise) < 1e7 ? formatINR(paise, 0) : formatCompactINR(paise));

/**
 * C4 Markets overview (section 08): a breadth strip (what moved since the round opened, the biggest move, round
 * volume, the watchlist), one filter row, and the stock table with round and event change, volume, 30-day trend,
 * status and Buy / Sell on hover. Phones get cards instead of a wide table.
 */
export function MarketsScreen() {
  const { state, code, teamId, eventId } = useTerminal();
  const router = useRouter();
  const { now, round } = useRoundClock(state);
  const { list, toggle } = useWatchlist(eventId, teamId);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("ALL");
  const [view, setView] = useState<View>("ALL");

  const rows = useMemo(() => instrumentRows(state, { enabledOnly: true }), [state]);
  const roundId = round?.id ?? null;
  const volumes = useMemo(() => Object.fromEntries(rows.map((r) => [r.instrument.id, instrumentVolume(state, r.instrument.id, roundId)])), [state, rows, roundId]);
  const owned = useMemo(() => new Set(rows.filter((r) => teamShares(state, teamId, r.instrument.id) > 0).map((r) => r.instrument.id)), [state, rows, teamId]);
  const sectors = [...new Set(rows.map((r) => r.instrument.sector))].sort();
  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.instrument.symbol} ${row.instrument.name} ${row.instrument.sector}`.toLowerCase().includes(q)) return false;
    if (sector !== "ALL" && row.instrument.sector !== sector) return false;
    if (view === "WATCHLIST" && !list.includes(row.instrument.id)) return false;
    if (view === "OWNED" && !owned.has(row.instrument.id)) return false;
    if (view === "HALTED" && !row.instrument.halted) return false;
    return true;
  });

  const up = rows.filter((r) => r.roundChangePct > 0.0001).length;
  const down = rows.filter((r) => r.roundChangePct < -0.0001).length;
  const biggest = [...rows].sort((a, b) => Math.abs(b.roundChangePct) - Math.abs(a.roundChangePct))[0];
  const biggestMove = biggest && Math.abs(biggest.roundChangePct) > 0.0001 ? priceMoves(state, biggest.instrument.id).filter((m) => m.source !== "OPENING").at(-1) : undefined;
  const volume = tradingVolume(state, roundId);
  const releasesThisRound = state.newsReleases.filter((r) => r.roundId === roundId).length;
  const watchRows = rows.filter((r) => list.includes(r.instrument.id));
  const halted = rows.filter((r) => r.instrument.halted).length;
  const buySell = (symbol: string, side: "BUY" | "SELL") => `/event/${code}/trade?symbol=${symbol}&side=${side}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Markets" description="Prices move only when the host releases news or changes a price." className="md:hidden" />

      <Card className="grid grid-cols-2 divide-border max-lg:gap-y-1 lg:grid-cols-4 lg:divide-x">
        {[
          {
            label: round?.type === "TRADING" ? "Since round open" : "Since the event opened",
            value: `${up} up · ${down} down · ${rows.length - up - down} unchanged`,
            sub: round?.startedAt ? `${round.type === "TRADING" ? `Round ${round.number}` : "Briefing"} opened at ${formatClock(round.startedAt)} · ${releasesThisRound} news ${releasesThisRound === 1 ? "release" : "releases"} so far` : "Trading hasn't started",
          },
          {
            label: "Biggest move",
            value: biggest && Math.abs(biggest.roundChangePct) > 0.0001 ? (
              <span className={biggest.roundChangePct > 0 ? "text-positive" : "text-negative"}>
                {biggest.instrument.symbol} {biggest.roundChangePct > 0 ? "▲" : "▼"} {formatPct(Math.abs(biggest.roundChangePct), { signed: false })}
              </span>
            ) : (
              "No moves yet"
            ),
            sub: biggestMove ? `${biggest.instrument.name} · ${biggestMove.source === "NEWS" ? `after news at ${formatClock(biggestMove.at)}` : `host change at ${formatClock(biggestMove.at)}`}` : "Prices change only at news and host actions",
          },
          { label: "Round volume", value: volumeLabel(volume.value), sub: `${volume.count} ${volume.count === 1 ? "trade" : "trades"} this round` },
          {
            label: "Your watchlist",
            value: `${list.length} ${list.length === 1 ? "stock" : "stocks"}`,
            sub: watchRows.length ? watchRows.slice(0, 2).map((r) => `${r.instrument.symbol} ${formatPct(r.roundChangePct)}`).join(" · ") : "Pin stocks to follow them here",
          },
        ].map((item) => (
          <div key={item.label} className="min-w-0 px-5 py-4">
            <p className="text-caption text-fg-muted">{item.label}</p>
            <p className="mt-1 truncate text-value-s font-semibold text-fg-primary">{item.value}</p>
            <p className="mt-1 truncate text-caption text-fg-muted">{item.sub}</p>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, ticker or sector" label="Filter stocks" className="w-full sm:w-80" />
        <SegmentedControl
          options={[
            { value: "ALL", label: `All ${rows.length}` },
            { value: "WATCHLIST", label: `Watchlist ${list.length}` },
            { value: "OWNED", label: `I own ${owned.size}` },
            { value: "HALTED", label: `Halted ${halted}` },
          ]}
          value={view}
          onChange={setView}
          label="Market view"
          size="md"
        />
        <Select value={sector} onValueChange={setSector} aria-label="Sector" className="w-44" options={[{ value: "ALL", label: "All sectors" }, ...sectors.map((s) => ({ value: s, label: s }))]} />
        <span className="ml-auto hidden font-mono text-caption text-fg-muted sm:block">Updated {formatClock(now, true)}</span>
      </div>

      {/* Desktop / tablet table */}
      <Card className="hidden overflow-hidden md:block">
        <DataTable<InstrumentRow>
          rows={filtered}
          rowKey={(r) => r.instrument.id}
          onRowClick={(r) => router.push(stockHref(code)(r.instrument.symbol))}
          rowLabel={(r) => `Open ${r.instrument.name}`}
          initialSort={{ key: "company", direction: "asc" }}
          minWidth={1000}
          rowClassName={() => "h-(--row-h)"}
          empty={view === "WATCHLIST" ? "Pin stocks to add them to your watchlist." : view === "OWNED" ? "You don't own any shares yet." : "No stocks match these filters."}
          columns={[
            {
              key: "watch",
              header: <span className="sr-only">Watchlist</span>,
              className: "w-12 pr-0",
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
                    className={cn("grid size-8 place-items-center rounded-md hover:bg-surface-raised", watched ? "text-accent-text" : "text-fg-disabled")}
                  >
                    <Pin className={cn("size-4", watched && "fill-current")} strokeWidth={1.75} />
                  </button>
                );
              },
            },
            {
              key: "company",
              header: "Company",
              sortValue: (r) => r.instrument.name,
              cell: (r) => (
                <span className="flex items-center gap-3">
                  <Avatar name={r.instrument.name} text={r.instrument.symbol.slice(0, 2)} tone="accent" size="md" />
                  <span className="min-w-0">
                    <span className="block max-w-60 truncate text-[15px] font-medium text-fg-primary">{r.instrument.name}</span>
                    <span className="block text-caption text-fg-muted">
                      {r.instrument.symbol} · {r.instrument.sector}
                    </span>
                  </span>
                </span>
              ),
            },
            { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, cell: (r) => <span className="font-medium text-fg-primary">{formatPrice(r.price)}</span> },
            { key: "round", header: "Round", align: "right", sortValue: (r) => r.roundChangePct, cell: (r) => <Delta value={r.roundChangePct} variant="pill" showArrow /> },
            { key: "event", header: "Event", align: "right", sortValue: (r) => r.eventChangePct, cell: (r) => <Delta value={r.eventChangePct} showArrow /> },
            { key: "volume", header: "Volume", align: "right", sortValue: (r) => volumes[r.instrument.id]?.value ?? 0, cell: (r) => <span className="text-fg-secondary">{volumes[r.instrument.id]?.value ? volumeLabel(volumes[r.instrument.id].value) : "—"}</span> },
            { key: "spark", header: "Trend · 30 days", align: "center", cell: (r) => <Sparkline data={r.sparkline} baseline={r.snapshot.eventOpenPrice} className="mx-auto h-7 w-24" /> },
            { key: "status", header: "Status", sortValue: (r) => Number(r.instrument.halted), cell: (r) => <InstrumentStateBadge halted={r.instrument.halted} enabled={r.instrument.enabled} /> },
            {
              key: "actions",
              header: <span className="sr-only">Actions</span>,
              align: "right",
              className: "font-sans",
              cell: (r) => (
                <span className="inline-flex gap-1.5 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Link href={buySell(r.instrument.symbol, "BUY")} onClick={(e) => e.stopPropagation()} className={buttonClasses({ variant: "ghost", size: "sm", className: "group-hover:border group-hover:border-border-strong group-hover:bg-surface" })} aria-label={`Buy ${r.instrument.symbol}`}>
                    Buy
                  </Link>
                  <Link href={buySell(r.instrument.symbol, "SELL")} onClick={(e) => e.stopPropagation()} className={buttonClasses({ variant: "ghost", size: "sm", className: "group-hover:border group-hover:border-border-strong group-hover:bg-surface" })} aria-label={`Sell ${r.instrument.symbol}`}>
                    Sell
                  </Link>
                </span>
              ),
            },
          ]}
          footer={
            <tfoot>
              <tr>
                <td colSpan={9} className="border-t border-border px-(--panel-p) py-3 text-caption text-fg-muted">
                  Round = since {round?.type === "TRADING" ? `Round ${round.number}` : "the round"} opened · Event = since the event started · Trend = 30 days of pre-event history · Watchlist pins are private to your team
                </td>
              </tr>
            </tfoot>
          }
        />
      </Card>

      {/* Phone cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {filtered.map((r) => (
          <li key={r.instrument.id}>
            <Link href={stockHref(code)(r.instrument.symbol)} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <Avatar name={r.instrument.name} text={r.instrument.symbol.slice(0, 2)} tone="accent" size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-fg-primary">{r.instrument.name}</span>
                <span className="block text-caption text-fg-muted">
                  {r.instrument.symbol} · {r.instrument.sector}
                  {r.instrument.halted && <span className="font-medium text-warning"> · Halted</span>}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-[15px] font-medium text-fg-primary">{formatPrice(r.price)}</span>
                <Delta value={r.roundChangePct} showArrow className="font-mono text-caption" />
              </span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-meta text-fg-secondary">No stocks match these filters.</li>}
      </ul>
    </div>
  );
}
