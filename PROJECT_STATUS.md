# Project status

_Last updated: 2026-09-14 · branch `phase1-full-prototype`_

Finance Club Stock Market Simulation Platform. **Phase 1 = frontend prototype + mock domain logic only** (no database, auth, APIs or live market data).

## In progress

Phase 1 implementation. See "Milestones" below for what is committed.

## How to run

```bash
npm install
npm run dev          # http://localhost:3000
npm run test         # Vitest domain tests
npm run lint
npm run typecheck
npm run build
```

Start at `/demo` to open the host, two teams and the projector in separate tabs.

## Architecture summary

```
app/                       Next.js App Router pages (thin: metadata + one screen component)
components/
  ui/                      Primitives: button, badge, card, dialog/drawer, confirm-action-dialog, data-table, field, select, tabs…
  shell/                   AppFrame (sidebar + top bar + mobile drawer), brand, mock runtime mount
  market/                  Shared domain display: status badges, round clock, value chart, tables, widgets
  participant/             Team terminal shell + screens
  host/                    Host console shell + screens (in progress)
  projector/               Projector stage + scenes (in progress)
  entry/                   Landing join form, team login, demo launcher
lib/
  domain/                  Pure TypeScript domain logic (no React): types, money, prices, ledger, trading-gate,
                           p2p, news, leaderboard, portfolio, lifecycle, setup, permissions, event-config (zod), event-state
  mock/                    PHASE 1 MOCK BACKEND: store (localStorage + BroadcastChannel + Web Locks), commands,
                           selectors, hooks, session (sessionStorage), runtime (scheduler + presence)
data/                      Scenario configs (FINSIM26 custom + real-simulated), templates, real company catalogue, history generator
```

### Mock architecture (Phase 1 only)

- **Store:** one JSON document in `localStorage` (`finsim:store`) holds every event aggregate (`EventState`).
- **Transactions:** `transact()` takes a cross-tab Web Lock, re-reads the latest state, runs a domain operation on a copy and persists only if it succeeded. This mirrors a DB transaction and makes double-clicks and parallel tabs safe.
- **Sync:** after a commit, a `BroadcastChannel` message tells every tab to re-read (plus the `storage` event as a fallback).
- **Commands:** `lib/mock/commands.ts` is the only way the UI mutates state (permission check → domain op → commit). Phase 2 replaces command bodies with server actions using the same inputs and `OpResult` outputs.
- **Sessions:** each tab stores its team identity in `sessionStorage`, so several teams can be open side by side.
- **Scheduler:** one leader tab (Web Lock `finsim:scheduler`) runs a 1-second loop that ends expired rounds and expires proposals. It stands in for the Phase 4 simulation worker.
- **Presence:** team tabs ping on a separate BroadcastChannel; the host sees "online" teams (same browser only).

### Domain rules implemented

- Money and prices are integer paise; ₹0.05 tick size.
- Ledger: double-entry journals (per-asset balance), team balances never negative, projections reconciled from postings.
- P2P: ±10% band at proposal and settlement, whole shares, no short selling, no negative cash, idempotency keys, one trade per proposal, FAILED with reason when conditions change, optional host approval above a threshold.
- Prices: single pipeline (circuit → floor/ceiling → tick) that always writes an immutable `PriceEvent` (configured, resolved and applied impact).
- News: FIXED / RANGE / multi-stock impacts resolved once; exact values stored on the release and price events.
- Leaderboard: return % on capital base; tie-break by net worth then name; CAPITAL_CHANGE moves the base, AWARD/PENALTY move return.
- Rounds: briefing vs trading, pause/resume keeps remaining time, carry-over across rounds.

## Dependencies added in Phase 1

- `radix-ui`: accessible headless primitives (dialog, select, tabs, popover, tooltip, switch, checkbox)
- `zod`: `EventConfig` schema shared by templates and the wizard
- `vitest` (dev) + `@types/node` upgraded to ^24 (matches Node 24 runtime; required by Vitest 5)

## Milestones

- [ ] 1. Restructure routes and foundation
- [ ] 2. Participant terminal
- [ ] 3. Host console
- [ ] 4. Projector experience
- [ ] 5. Mock event engine and workflows
- [ ] 6. Tests and final stabilization

## Important design decisions

- Green/red only for gains/losses; amber `warning` token for risky controls and frozen/paused states.
- Participant charts are step charts: prices only change through discrete PriceEvents (no background volatility in Phase 1).
- Demo team PINs are fixed (see `data/scenarios/shared.ts`) so the checklist and launcher can reference them.
- Projector `?key=` is validated when present; a missing key is allowed in the prototype so the plain URL works.

## Known issues / TODO

- Tracked in the final section once Phase 1 completes.
