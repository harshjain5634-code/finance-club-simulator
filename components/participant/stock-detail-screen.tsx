"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pin } from "lucide-react";
import { buttonClasses, ButtonKbd } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { Delta } from "@/components/ui/delta";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PriceChart, PriceChartLegend } from "@/components/market/price-chart";
import { useRoundClock } from "@/components/market/round-clock";
import { priceBand } from "@/lib/domain/p2p";
import { formatINR, formatPct, formatPrice } from "@/lib/domain/money";
import { teamCash } from "@/lib/domain/portfolio";
import { checkTradingGate, currentRound } from "@/lib/domain/trading-gate";
import { formatClock, formatQuantity } from "@/lib/format";
import { instrumentRows, priceMoves, priceSeries, teamSummary, type ChartRange } from "@/lib/mock/selectors";
import { cn } from "@/lib/utils";
import { NeedsAttention, useAttentionItems } from "./needs-attention";
import { useTerminal } from "./terminal-context";
import { useWatchlist } from "./watchlist";

type Range = "ROUND" | "EVENT" | "PRE_EVENT";

/**
 * C4 stock detail (section 08). Header: identity, price, change since the round opened and the two trade actions
 * (B / S). Left: the annotated price chart and the "what moved it" table (its accessible equivalent). Right: the
 * team's position, any open proposal on this stock, and the limits that apply right now.
 */
export function StockDetailScreen() {
  const { state, code, teamId, team, eventId } = useTerminal();
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const { now, round } = useRoundClock(state);
  const { list, toggle } = useWatchlist(eventId, teamId);
  const [range, setRange] = useState<Range>(round ? "ROUND" : state.event.startedAt ? "EVENT" : "PRE_EVENT");
  const [showTrades, setShowTrades] = useState(true);

  const row = useMemo(() => instrumentRows(state, { enabledOnly: true }).find((r) => r.instrument.symbol === symbol), [state, symbol]);
  const series = useMemo(() => (row ? priceSeries(state, row.instrument.id, range as ChartRange, now) : []), [state, row, range, now]);
  const moves = useMemo(() => (row ? priceMoves(state, row.instrument.id) : []), [state, row]);
  const attention = useAttentionItems(state, teamId, now).filter((i) => row && i.proposal.instrumentId === row.instrument.id && i.kind === "incoming");

  // B / S open the ticket for this stock.
  useEffect(() => {
    if (!row) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) || target?.closest("[role=dialog]")) return;
      const key = event.key.toLowerCase();
      if (key === "b" || key === "s") {
        event.preventDefault();
        router.push(`/event/${code}/trade?symbol=${row.instrument.symbol}&side=${key === "b" ? "BUY" : "SELL"}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [row, router, code]);

  if (!row) {
    return (
      <Card>
        <EmptyState
          title={`${symbol} is not available in this event`}
          description="Only stocks enabled by the host can be viewed and traded."
          action={
            <Link href={`/event/${code}/markets`} className={buttonClasses({ variant: "secondary" })}>
              <ArrowLeft /> Back to markets
            </Link>
          }
        />
      </Card>
    );
  }

  const { instrument } = row;
  const summary = teamSummary(state, teamId)!;
  const position = summary.holdings.find((h) => h.instrumentId === instrument.id);
  const cash = teamCash(state, teamId);
  const band = priceBand(row.price, state.event.rules.priceBandPct, state.event.rules.tickSize);
  const gate = checkTradingGate({ event: state.event, round: currentRound(state), teams: [team], instrument, now });
  const watched = list.includes(instrument.id);
  const basis = range === "ROUND" ? row.snapshot.roundOpenPrice : range === "EVENT" ? row.snapshot.eventOpenPrice : (series[0]?.value ?? row.price);
  const change = row.price - basis;
  const roundTrades = state.trades.filter((t) => t.instrumentId === instrument.id).map((t) => ({ t: t.settledAt, price: t.price, quantity: t.quantity }));
  // One rule per moment: a round that ends as the next one opens gets a single "opens" label.
  const boundaries = state.rounds
    .filter((r) => r.startedAt)
    .sort((a, b) => a.startedAt! - b.startedAt!)
    .flatMap((r) => [
      { t: r.startedAt!, label: r.type === "BRIEFING" ? `Briefing ${formatClock(r.startedAt!)}` : `R${r.number} opens ${formatClock(r.startedAt!)}` },
      ...(r.endedAt ? [{ t: r.endedAt, label: r.type === "BRIEFING" ? "Briefing ended" : `R${r.number} ended` }] : []),
    ])
    .filter((b, index, all) => !all.some((other, j) => j > index && Math.abs(other.t - b.t) < 60_000));
  // The axis keeps a little room ahead of "now" and grows with the round, instead of jumping straight to the full
  // 15 minutes — otherwise the first minutes of every round squeeze all the prices into a sliver on the left.
  const axisEnd =
    range === "ROUND" && round?.status === "RUNNING" && round.endsAt && round.startedAt
      ? Math.min(round.endsAt, Math.max(now + 90_000, now + (now - round.startedAt) * 0.35))
      : undefined;
  const recentMoves = [...moves].reverse().slice(0, 6);
  const maxBuy = Math.floor(cash / row.price);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href={`/event/${code}/markets`} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft /> All stocks
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={instrument.name} text={instrument.symbol.slice(0, 2)} tone="accent" size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-h1 font-semibold tracking-[-0.01em] text-fg-primary">{instrument.name}</h1>
            <p className="text-meta text-fg-muted">
              {instrument.symbol} · {instrument.sector} · {instrument.halted ? <span className="font-medium text-warning">Halted by host</span> : "Trading"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggle(instrument.id)}
          aria-pressed={watched}
          aria-label={watched ? `Remove ${instrument.symbol} from watchlist` : `Add ${instrument.symbol} to watchlist`}
          className={cn("grid size-(--control-h-sm) place-items-center rounded-md border border-border-strong bg-surface hover:bg-surface-hover", watched ? "text-accent-text" : "text-fg-muted")}
        >
          <Pin className={cn("size-4", watched && "fill-current")} />
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-5">
          <div className="text-right">
            <p className="text-value-l font-semibold tracking-[-0.015em] text-fg-primary tabular-nums">₹{formatPrice(row.price)}</p>
            <p className="text-meta">
              <Delta value={change} format="inr" showArrow className="font-medium" /> <span className={cn("font-medium", change > 0 ? "text-positive" : change < 0 ? "text-negative" : "text-fg-muted")}>· {formatPct(row.roundChangePct, { signed: false })}</span>{" "}
              <span className="text-fg-muted">since {round?.type === "TRADING" ? `Round ${round.number} opened` : "the event started"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/event/${code}/trade?symbol=${instrument.symbol}&side=BUY`} className={buttonClasses({ variant: "primary" })} aria-keyshortcuts="B">
              Buy {instrument.symbol} <ButtonKbd variant="primary">B</ButtonKbd>
            </Link>
            <Link href={`/event/${code}/trade?symbol=${instrument.symbol}&side=SELL`} className={buttonClasses({ variant: "secondary" })} aria-keyshortcuts="S">
              Sell {instrument.symbol} <ButtonKbd>S</ButtonKbd>
            </Link>
          </div>
        </div>
      </div>

      {!gate.ok && (
        <p role="status" className="rounded-md bg-warning-soft px-4 py-2.5 text-meta text-fg-primary">
          <span className="font-medium">Trading unavailable:</span> {gate.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_336px]">
        <Card className="flex min-w-0 flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-h3 font-semibold text-fg-primary">Price · {range === "ROUND" && round ? (round.type === "BRIEFING" ? "Briefing" : `Round ${round.number}`) : range === "EVENT" ? "Event" : "30 days before the event"}</h2>
              <p className="text-caption text-fg-muted">{range === "ROUND" && axisEnd ? `${formatClock(round!.startedAt!)} – ${formatClock(round!.endsAt!)} · the axis fills as the round runs` : range === "PRE_EVENT" ? "Daily closes (illustrative history)" : "Prices change only at price events"}</p>
            </div>
            <SegmentedControl
              className="ml-auto"
              size="md"
              label="Chart range"
              value={range}
              onChange={setRange}
              options={[
                { value: "ROUND", label: round?.type === "TRADING" ? `Round ${round.number}` : "Round", disabled: !round },
                { value: "EVENT", label: "Event", disabled: !state.event.startedAt },
                { value: "PRE_EVENT", label: "30 days" },
              ]}
            />
            {range !== "PRE_EVENT" && (
              <label className="flex items-center gap-2 text-[13px] font-medium text-fg-secondary">
                <Switch checked={showTrades} onCheckedChange={setShowTrades} label="Show trades between teams" />
                Trades
              </label>
            )}
          </div>
          <PriceChart
            points={series}
            baseline={basis}
            baselineLabel={range === "ROUND" ? `Round open ${formatPrice(basis)}` : range === "EVENT" ? `Event open ${formatPrice(basis)}` : ""}
            moves={range === "PRE_EVENT" ? [] : moves}
            trades={showTrades && range !== "PRE_EVENT" ? roundTrades : []}
            boundaries={range === "EVENT" ? boundaries : range === "ROUND" ? boundaries.filter((b) => round?.startedAt && b.t >= round.startedAt) : []}
            axisEnd={axisEnd}
            now={now}
            daily={range === "PRE_EVENT"}
            label={`${instrument.symbol} price chart. The table below lists every price change.`}
          />
          {range !== "PRE_EVENT" && <PriceChartLegend symbol={instrument.symbol} showTrades={showTrades} />}

          <div className="overflow-hidden rounded-md border border-border-subtle">
            <table className="w-full border-collapse">
              <caption className="sr-only">What moved {instrument.symbol}</caption>
              <thead>
                <tr className="h-8 bg-canvas-subtle text-caption text-fg-muted">
                  <th scope="col" className="w-24 px-3 text-left font-medium">Time</th>
                  <th scope="col" className="px-3 text-left font-medium">What moved the price</th>
                  <th scope="col" className="w-24 px-3 text-right font-medium">Change</th>
                  <th scope="col" className="w-48 px-3 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {recentMoves.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-meta text-fg-muted">
                      No price changes yet. {instrument.symbol} opened at ₹{formatPrice(row.snapshot.eventOpenPrice || instrument.startingPrice)}.
                    </td>
                  </tr>
                ) : (
                  recentMoves.map((m) => (
                    <tr key={m.id} className="h-10 border-t border-border-subtle">
                      <td className="px-3 font-mono text-[13px] text-fg-muted">{formatClock(m.at, true)}</td>
                      <td className="px-3 text-[13px] text-fg-primary">
                        {m.source === "NEWS" ? `News #${m.newsNumber ?? "?"} · ${m.headline ?? "Story"}` : m.source === "MANUAL" ? "Host price change" : m.source === "OPENING" ? "Opening price" : "Price change"}
                      </td>
                      <td className="px-3 text-right font-mono text-[13px]">{m.source === "OPENING" ? <span className="text-fg-muted">—</span> : <Delta value={m.changePct} showArrow />}</td>
                      <td className="px-3 text-right font-mono text-[13px] whitespace-nowrap text-fg-primary">
                        {m.source === "OPENING" ? formatPrice(m.to) : `${formatPrice(m.from)} → ${formatPrice(m.to)}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h3 font-semibold text-fg-primary">Your position</h2>
              {position && <span className="text-caption text-fg-muted">{formatPct(position.allocationPct, { signed: false, decimals: 1 })} of net worth</span>}
            </div>
            {position ? (
              <>
                <p className="mt-3 text-value-m font-semibold text-fg-primary tabular-nums">{formatINR(position.value, 0)}</p>
                <p className="mt-0.5 text-[13px] font-medium">
                  <Delta value={position.unrealizedPnl} format="inr" decimals={0} /> <Delta value={position.returnPct} showArrow /> <span className="font-normal text-fg-muted">unrealized</span>
                </p>
                <dl className="mt-4 flex flex-col gap-2.5">
                  {[
                    ["Shares held", formatQuantity(position.quantity)],
                    ["Average price", `₹${formatPrice(Math.round(position.averageCost))}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <dt className="text-[13px] text-fg-secondary">{k}</dt>
                      <dd className="font-mono text-[13px] text-fg-primary">{v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="mt-2 text-meta text-fg-secondary">You don&apos;t hold {instrument.symbol}. Propose a buy to another team to open a position.</p>
            )}
          </Card>

          {attention.length > 0 && <NeedsAttention state={state} teamId={teamId} code={code} items={attention} now={now} />}

          <Card className="p-5">
            <h2 className="text-h3 font-semibold text-fg-primary">Your limits on {instrument.symbol}</h2>
            <dl className="mt-3 flex flex-col gap-2.5">
              {[
                ["Sell up to", `${formatQuantity(position?.quantity ?? 0)} shares`],
                ["Buy up to", `${formatQuantity(maxBuy)} shares`],
                ["Price allowed now", `₹${formatPrice(band.min)} – ₹${formatPrice(band.max)}`],
                ["Price steps", `₹${formatPrice(state.event.rules.tickSize)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-[13px] text-fg-secondary">{k}</dt>
                  <dd className="font-mono text-[13px] text-fg-primary">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-caption text-fg-muted">
              Buy limit uses your cash ({formatINR(cash, 0)}) at the last price. Prices must stay within ±{state.event.rules.priceBandPct}% of the last price. No short selling.
            </p>
          </Card>
          {instrument.description && (
            <Card className="p-5">
              <h2 className="text-h3 font-semibold text-fg-primary">About {instrument.name}</h2>
              <p className="mt-2 text-meta text-fg-secondary">{instrument.description}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
