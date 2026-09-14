"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { EmptyState, InlineBanner, KeyValueList } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SymbolMark } from "@/components/market/tables";
import { ValueChart } from "@/components/market/value-chart";
import { NewsReleaseItem } from "@/components/market/widgets";
import { priceBand } from "@/lib/domain/p2p";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { checkTradingGate, currentRound } from "@/lib/domain/trading-gate";
import { useNow } from "@/lib/mock/hooks";
import { instrumentRows, priceSeries, releasesNewestFirst, teamSummary, type ChartRange } from "@/lib/mock/selectors";
import { formatQuantity } from "@/lib/format";
import { useTerminal } from "./terminal-context";

export function StockDetailScreen() {
  const { state, code, teamId, team } = useTerminal();
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const now = useNow();
  const real = state.event.universeMode === "REAL_SIMULATED";
  const [range, setRange] = useState<ChartRange>(state.event.startedAt ? "EVENT" : real ? "PRE_EVENT" : "EVENT");

  const row = useMemo(() => instrumentRows(state, { enabledOnly: true }).find((r) => r.instrument.symbol === symbol), [state, symbol]);
  const series = useMemo(() => (row ? priceSeries(state, row.instrument.id, range, now) : []), [state, row, range, now]);

  if (!row) {
    return (
      <Card>
        <EmptyState
          title={`${symbol} is not available in this event`}
          description="Only stocks enabled by the host can be viewed and traded."
          action={
            <Link href={`/event/${code}/markets`} className={buttonClasses({ variant: "secondary" })}>
              <ArrowLeft className="size-3.5" />
              Back to markets
            </Link>
          }
        />
      </Card>
    );
  }

  const { instrument } = row;
  const summary = teamSummary(state, teamId)!;
  const position = summary.holdings.find((h) => h.instrumentId === instrument.id);
  const related = releasesNewestFirst(state).filter((r) => r.impacts.some((i) => i.instrumentId === instrument.id));
  const band = priceBand(row.price, state.event.rules.priceBandPct, state.event.rules.tickSize);
  const gate = checkTradingGate({ event: state.event, round: currentRound(state), teams: [team], instrument, now });
  const ranges: { value: ChartRange; label: string }[] = [
    { value: "15M", label: "15M" },
    { value: "ROUND", label: "Round" },
    { value: "EVENT", label: "Event" },
    ...(real ? [{ value: "PRE_EVENT" as const, label: "Pre-event" }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <Link href={`/event/${code}/markets`} className="inline-flex w-fit items-center gap-1.5 rounded text-xs text-fg-secondary hover:text-fg-primary">
        <ArrowLeft className="size-3.5" />
        Markets
      </Link>

      <Card className="px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <SymbolMark symbol={instrument.symbol} className="size-11 text-sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg leading-7 font-semibold tracking-tight text-fg-primary">{instrument.name}</h1>
                <Badge tone="outline" className="font-mono">{instrument.symbol}</Badge>
                {instrument.halted && <Badge tone="warning" dot>Halted</Badge>}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                <span>{instrument.sector}</span>
                <span aria-hidden>·</span>
                <span>{real ? `Real company${instrument.exchange ? ` (${instrument.exchange})` : ""} · Simulated market` : "Fictional company · Simulated market"}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <p className="text-[11px] tracking-wide text-fg-muted uppercase">Reference price</p>
              <p className="text-2xl leading-8 font-semibold tracking-tight text-fg-primary tabular-nums">₹{formatPrice(row.price)}</p>
            </div>
            <div className="text-xs leading-relaxed">
              <p className="flex items-center justify-between gap-3"><span className="text-fg-muted">Round</span><Delta value={row.roundChangePct} variant="pill" showArrow /></p>
              <p className="mt-1 flex items-center justify-between gap-3"><span className="text-fg-muted">Event</span><Delta value={row.eventChangePct} variant="pill" showArrow /></p>
            </div>
            <Link href={`/event/${code}/trade?symbol=${encodeURIComponent(instrument.symbol)}`} className={buttonClasses({ variant: "primary", size: "lg" })}>
              <ArrowLeftRight className="size-4" />
              Propose trade
            </Link>
          </div>
        </div>
      </Card>

      {!gate.ok && (
        <InlineBanner tone={gate.code === "INSTRUMENT_HALTED" || gate.code === "TRADING_FROZEN" ? "warning" : "neutral"} title="Trading unavailable.">
          {gate.message}
        </InlineBanner>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex flex-col gap-3 xl:col-span-8">
          <Card>
            <CardHeader
              title="Price chart"
              subtitle={range === "PRE_EVENT" ? "Daily closes before the event (illustrative)" : "Reference price · changes only via news and host actions"}
              action={<SegmentedControl options={ranges} value={range} onChange={setRange} label="Chart range" />}
            />
            <ValueChart points={series} range={range} height="h-72" className="px-1 pb-2" label={`${instrument.symbol} price chart`} compactAxis={false} baseline={range === "PRE_EVENT" ? undefined : range === "ROUND" ? row.snapshot.roundOpenPrice : row.snapshot.eventOpenPrice} />
          </Card>
          <Card>
            <CardHeader title="About" subtitle={instrument.sector} divider />
            <div className="px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-fg-secondary">{instrument.description || "No description provided."}</p>
              <KeyValueList
                className="mt-4"
                columns={3}
                items={[
                  { label: "Starting price", value: `₹${formatPrice(instrument.startingPrice)}` },
                  { label: "Round open", value: `₹${formatPrice(row.snapshot.roundOpenPrice)}` },
                  { label: "Total supply", value: `${formatQuantity(instrument.supply)} shares` },
                  { label: "Floor / ceiling", value: `${instrument.floor ? `₹${formatPrice(instrument.floor)}` : "—"} / ${instrument.ceiling ? `₹${formatPrice(instrument.ceiling)}` : "—"}` },
                  { label: "Circuit limit", value: instrument.circuitPct ? `±${instrument.circuitPct}% per round` : "None" },
                  { label: "P2P price band", value: `₹${formatPrice(band.min)} – ₹${formatPrice(band.max)}` },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Related news" subtitle={`${related.length} released stor${related.length === 1 ? "y" : "ies"} affected ${instrument.symbol}`} divider />
            {related.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-fg-muted">No released news has affected {instrument.symbol} yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {related.map((release) => (
                  <NewsReleaseItem key={release.id} state={state} release={release} now={now} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3 xl:col-span-4">
          <Card>
            <CardHeader title="My position" subtitle={team.name} divider />
            {position ? (
              <div className="px-4 py-3.5">
                <KeyValueList
                  columns={2}
                  items={[
                    { label: "Quantity", value: `${formatQuantity(position.quantity)} shares` },
                    { label: "Average cost", value: `₹${formatPrice(Math.round(position.averageCost))}` },
                    { label: "Current value", value: formatINR(position.value) },
                    { label: "Unrealized P&L", value: <Delta value={position.unrealizedPnl} format="inr" /> },
                    { label: "Return", value: <Delta value={position.returnPct} /> },
                    { label: "Of net worth", value: formatPct(position.allocationPct, { signed: false, decimals: 1 }) },
                  ]}
                />
              </div>
            ) : (
              <p className="px-4 py-6 text-[13px] text-fg-muted">You do not hold {instrument.symbol}. Propose a buy to another team to open a position.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="How P2P trading works" divider />
            <ol className="list-decimal space-y-1.5 py-3.5 pr-4 pl-8 text-[13px] leading-relaxed text-fg-secondary">
              <li>Agree a price with another team in the room.</li>
              <li>Propose the trade here within ₹{formatPrice(band.min)} – ₹{formatPrice(band.max)}.</li>
              <li>The other team accepts; the trade settles instantly and both portfolios update.</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
