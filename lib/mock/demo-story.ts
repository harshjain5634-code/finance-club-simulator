import { DEMO_EVENT_ID } from "@/data/scenarios/shared";
import { currentRound } from "@/lib/domain/trading-gate";
import type { OpResult } from "@/lib/domain/types";
import { fail, ok } from "@/lib/domain/types";
import { acceptProposal, counterProposal, nextRound, proposeTrade, rejectProposal, releaseNews, resetDemo, startEvent, startRound } from "./commands";
import { getStoreSnapshot } from "./store";

/**
 * Plays a short, realistic mid-event story on the demo event so the prototype can be shown without running a full
 * session first. Everything goes through the normal commands, so balances, journals, the leaderboard and the audit
 * log are exactly what real play would produce — nothing is written directly into the store.
 */

/** Deterministic jitter so the demo looks the same every time it is loaded. */
function prng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

type Leg = { seller: string; buyer: string; symbol: string; quantity: number; drift: number };

/**
 * Who trades what. Net exposure differs per team, so after the two news stories the standings spread out on their
 * own: buyers of NOVA/ORBIT gain, teams that sold into the rally give some up, QUANTUM holders lose.
 */
/**
 * Act 1 — teams take different sides before the news lands: NOVA accumulators (quant, bull, falcon, beta),
 * NOVA sellers rotating into PULSE and QUANTUM (value, sigma, maverick, alpha), and a few neutral swaps.
 */
const ACT_ONE: Leg[] = [
  { seller: "team-value", buyer: "team-quant", symbol: "ins-nova", quantity: 160, drift: 0.004 },
  { seller: "team-sigma", buyer: "team-bull", symbol: "ins-nova", quantity: 140, drift: 0.008 },
  { seller: "team-maverick", buyer: "team-falcon", symbol: "ins-nova", quantity: 80, drift: 0.012 },
  { seller: "team-alpha", buyer: "team-beta", symbol: "ins-nova", quantity: 60, drift: 0.01 },
  { seller: "team-gamma", buyer: "team-value", symbol: "ins-pulse", quantity: 30, drift: -0.006 },
  { seller: "team-candle", buyer: "team-sigma", symbol: "ins-pulse", quantity: 28, drift: 0.003 },
  { seller: "team-equity", buyer: "team-maverick", symbol: "ins-quantum", quantity: 16, drift: 0.005 },
  { seller: "team-delta", buyer: "team-alpha", symbol: "ins-quantum", quantity: 12, drift: 0.007 },
  { seller: "team-bull", buyer: "team-gamma", symbol: "ins-nexus", quantity: 70, drift: -0.003 },
  { seller: "team-quant", buyer: "team-candle", symbol: "ins-apex", quantity: 50, drift: 0.006 },
];

/** Act 2 — after the first two stories, the tape keeps moving and a few teams double down on NOVA. */
const ACT_TWO: Leg[] = [
  { seller: "team-value", buyer: "team-quant", symbol: "ins-nova", quantity: 40, drift: 0.01 },
  { seller: "team-sigma", buyer: "team-falcon", symbol: "ins-nova", quantity: 35, drift: 0.014 },
  { seller: "team-delta", buyer: "team-bull", symbol: "ins-vertex", quantity: 40, drift: -0.004 },
  { seller: "team-maverick", buyer: "team-equity", symbol: "ins-helix", quantity: 20, drift: -0.002 },
  { seller: "team-gamma", buyer: "team-beta", symbol: "ins-apex", quantity: 35, drift: 0.004 },
  { seller: "team-candle", buyer: "team-delta", symbol: "ins-orbit", quantity: 12, drift: 0.009 },
];

/** Act 3 — a calmer tail after the NOVA story, so the most recent trades sit at the new price level. */
const ACT_THREE: Leg[] = [
  { seller: "team-quant", buyer: "team-alpha", symbol: "ins-nova", quantity: 25, drift: -0.004 },
  { seller: "team-falcon", buyer: "team-candle", symbol: "ins-nova", quantity: 20, drift: -0.002 },
  { seller: "team-beta", buyer: "team-sigma", symbol: "ins-helix", quantity: 18, drift: 0.005 },
];

const state = () => getStoreSnapshot()?.events[DEMO_EVENT_ID];

/** Nearest valid price to `reference * (1 + drift)`, kept on the ₹0.05 tick and inside the price band. */
function priceFor(reference: number, drift: number, bandPct: number) {
  const limit = reference * (bandPct / 100) * 0.8;
  const target = reference + Math.max(-limit, Math.min(limit, reference * drift));
  return Math.max(5, Math.round(target / 5) * 5);
}

async function settle(leg: Leg, index: number): Promise<boolean> {
  const current = state();
  if (!current) return false;
  const reference = current.prices[leg.symbol]?.price;
  if (!reference) return false;
  const price = priceFor(reference, leg.drift, current.event.rules.priceBandPct);
  const sellerShares = current.balances[`TEAM:${leg.seller}`]?.[`INSTRUMENT:${leg.symbol}`] ?? 0;
  const buyerCash = current.balances[`TEAM:${leg.buyer}`]?.CASH ?? 0;
  const quantity = Math.min(leg.quantity, sellerShares, Math.floor(buyerCash / price));
  if (quantity < 1) return false;

  const proposed = await proposeTrade(DEMO_EVENT_ID, leg.seller, {
    counterpartyTeamId: leg.buyer,
    side: "SELL",
    instrumentId: leg.symbol,
    quantity,
    price,
    idempotencyKey: `demo-story-${index}`,
  });
  if (!proposed.ok) return false;
  const accepted = await acceptProposal(DEMO_EVENT_ID, leg.buyer, proposed.value.id);
  return accepted.ok;
}

export type DemoStoryResult = { trades: number; news: number; open: number };

/**
 * Resets the demo event, starts it, plays the briefing and Round 1, releases two stories and settles a set of P2P
 * trades, then leaves a few proposals open (one countered, one rejected) with Round 1 still running.
 */
export async function loadMidEventDemo(): Promise<OpResult<DemoStoryResult>> {
  const reset = await resetDemo();
  if (!reset.ok) return reset;
  const started = await startEvent(DEMO_EVENT_ID);
  if (!started.ok) return started;
  const briefing = await startRound(DEMO_EVENT_ID);
  if (!briefing.ok) return briefing;
  const round1 = await nextRound(DEMO_EVENT_ID);
  if (!round1.ok) return round1;

  const random = prng(20260923);
  let trades = 0;
  let news = 0;
  const play = async (legs: Leg[], offset: number) => {
    for (const [index, leg] of legs.entries()) {
      if (await settle({ ...leg, drift: leg.drift + (random() - 0.5) * 0.004 }, offset + index)) trades += 1;
    }
  };
  /** Releases one Round 1 story by headline, so the order tells a story rather than following library order. */
  const release = async (match: string) => {
    const round = currentRound(state()!);
    const item = (state()?.news ?? []).find((n) => n.status === "READY" && n.roundId === round?.id && n.headline.includes(match));
    if (!item) return;
    const released = await releaseNews(DEMO_EVENT_ID, item.id, `demo-story-news-${item.id}`);
    if (released.ok) news += 1;
  };

  await play(ACT_ONE, 0);
  await release("Orbit Technologies");
  await release("Pulse Consumer flags");
  await play(ACT_TWO, 100);
  await release("Nova Motors");
  await play(ACT_THREE, 200);

  // Leave the tape alive: one proposal waiting, one countered and one rejected.
  let open = 0;
  const current = state();
  if (current) {
    const nova = current.prices["ins-nova"]?.price ?? 0;
    const waiting = await proposeTrade(DEMO_EVENT_ID, "team-falcon", {
      counterpartyTeamId: "team-alpha",
      side: "SELL",
      instrumentId: "ins-nova",
      quantity: 20,
      price: priceFor(nova, 0.01, current.event.rules.priceBandPct),
      idempotencyKey: "demo-story-open-1",
    });
    if (waiting.ok) open += 1;

    const toCounter = await proposeTrade(DEMO_EVENT_ID, "team-bull", {
      counterpartyTeamId: "team-sigma",
      side: "SELL",
      instrumentId: "ins-helix",
      quantity: 15,
      price: priceFor(current.prices["ins-helix"]?.price ?? 0, 0.02, current.event.rules.priceBandPct),
      idempotencyKey: "demo-story-counter-src",
    });
    if (toCounter.ok) {
      const countered = await counterProposal(DEMO_EVENT_ID, "team-sigma", {
        originalProposalId: toCounter.value.id,
        quantity: 15,
        price: priceFor(current.prices["ins-helix"]?.price ?? 0, -0.01, current.event.rules.priceBandPct),
        idempotencyKey: "demo-story-counter",
      });
      if (countered.ok) open += 1;
    }

    const toReject = await proposeTrade(DEMO_EVENT_ID, "team-gamma", {
      counterpartyTeamId: "team-value",
      side: "SELL",
      instrumentId: "ins-pulse",
      quantity: 8,
      price: priceFor(current.prices["ins-pulse"]?.price ?? 0, 0.03, current.event.rules.priceBandPct),
      idempotencyKey: "demo-story-reject-src",
    });
    if (toReject.ok) await rejectProposal(DEMO_EVENT_ID, "team-value", toReject.value.id, "Too far above the last price");
  }

  const final = state();
  if (!final) return fail("NOT_FOUND", "Demo event missing after seeding.");
  return ok({ trades, news, open });
}
