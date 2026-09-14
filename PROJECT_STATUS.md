# Project status

_Last updated: 2026-09-14 · branch `phase1-full-prototype` · Phase 1 complete_

Finance Club Stock Market Simulation Platform. **Phase 1 = frontend prototype + mock domain logic only.** It has no database, auth, backend APIs, WebSockets or market data.

## How to run

```bash
npm install
npm run dev          # http://localhost:3000
npm run test         # Vitest: domain + workflow tests (34)
npm run lint
npm run typecheck
npm run build
```

Start at **http://localhost:3000/demo** and use the buttons to open the host console, Team Alpha, Team Beta and the projector in separate tabs. All tabs must be in the **same browser profile**, because they share localStorage and BroadcastChannel.

Demo credentials (`/join/FINSIM26`): Alpha Capital `ALPHA`/`4821`, Beta Street `BETA`/`7390`. The full list is on `/demo` and in `data/scenarios/shared.ts`.

## Routes

| Area | Routes |
|---|---|
| Entry | `/` · `/join` · `/join/[code]` · `/demo` |
| Participant | `/event/[code]/dashboard` · `/markets` · `/markets/[symbol]` · `/portfolio` · `/trade` · `/transactions` · `/news` · `/leaderboard` · `/rules` |
| Projector | `/event/[code]/projector` (optional `?key=`) |
| Host | `/host` · `/host/events/new` · `/host/events/[eventId]` (control room) · `/teams` · `/teams/[teamId]` · `/trades` · `/news` · `/prices` · `/leaderboard` · `/setup/general` · `/setup/instruments` · `/setup/allocations` · `/setup/rounds` · `/display` · `/audit` · `/exports` |

Demo event: id `demo-event`, code `FINSIM26`. A second sample draft event (`freshers-sprint`, code `FRESH26`) shows the DRAFT state.

## Architecture summary

```
app/                  Thin App Router pages (metadata + one screen component); layouts mount the shells
components/
  ui/                 Primitives: button, badge, card, dialog/drawer, confirm-action-dialog (tiers), data-table,
                      field, money-input, select, tabs, controls (switch/checkbox/tooltip), toaster, misc
  shell/              AppFrame (sidebar + sticky top bar + mobile drawer), brand, mock-runtime mount
  market/             Shared domain UI: status badges, round clock, value chart, tables (holdings, trades,
                      proposals, ledger, adjustments, leaderboard), widgets (market board, movers, news)
  participant/        Terminal shell (session guard, breaking news, freeze banner) + screens
  host/               Host shell (event status bar, freeze control) + control room + all console screens
  projector/          1920×1080 scaled stage, rotation, ticker, scenes, breaking-news takeover
  entry/              Join form, team login, demo launcher
lib/
  domain/             Pure TypeScript domain logic (no React) + unit tests
  mock/               PHASE 1 MOCK BACKEND: store, commands, selectors, hooks, session, runtime, exports + workflow tests
  navigation.ts, format.ts, theme.ts, toast.ts, site.ts, utils.ts
data/                 Scenario configs (FINSIM26 custom + real-simulated), templates, company catalogue, history generator
scripts/              browser-smoke.mjs (CDP cross-window smoke test)
```

### Domain layer (`lib/domain`)

- `types.ts`: the event aggregate (`EventState`) and all entity types. Money and prices are integer paise.
- `money.ts`: paise helpers and INR formatting. `ids.ts` gives sequential readable ids (PRP-1001, TRD-7001, JRN-9001…).
- `ledger.ts`: double-entry journals and postings, with a per-asset balance check. Team balances can never go negative. `reconcile()` compares the ledger with the stored balances.
- `prices.ts`: the single price pipeline (circuit → floor/ceiling → ₹0.05 tick). `recordPriceChange` writes both the `Price` snapshot and an immutable `PriceEvent`.
- `trading-gate.ts`: `checkMarketOpen`, `checkTradingGate`, `deriveMarketState`.
- `p2p.ts`:
  - price band, proposal validation, propose/accept/reject/cancel/expire
  - optional host approval, atomic settlement, idempotency
- `news.ts`: FIXED/RANGE/multi-stock impact resolution, release (resolved once and stored), preview, skip.
- `portfolio.ts`: holdings, cost basis and realized P&L, allocations, cash/holding adjustments, team reset, valuation snapshots.
- `leaderboard.ts`: capital base, return %, ranking and tie-break, rank movement, round P&L, visibility views, frozen snapshot.
- `lifecycle.ts`: event/round lifecycle, freeze, halt, manual price changes, readiness.
- `setup.ts`: teams, instruments, allocation plan, rounds, general settings, leaderboard and projector settings, news library.
- `permissions.ts` defines the role matrix. `event-config.ts` is the zod `EventConfig` schema plus the `EventTemplate` type. `event-state.ts` builds an aggregate from a config. `audit.ts` provides `appendAudit`.

### Mock architecture (Phase 1 only, `lib/mock`)

- **Store:** one JSON document in `localStorage` (`finsim:store`) holds every event aggregate.
- **Transactions:** `transact()` takes a cross-tab **Web Lock**, re-reads the latest state, runs the operation on a copy and persists only on success. This mirrors a DB transaction, so simultaneous accepts from two tabs settle once.
- **Sync:** each commit posts a **BroadcastChannel** message and every tab re-reads (the `storage` event is a fallback). Hooks use `useSyncExternalStore`.
- **Commands** (`commands.ts`): the only way the UI mutates state. Each checks permissions, runs a domain operation, and supports idempotency keys. The inputs and `OpResult` outputs are designed to be reused by server actions.
- **Sessions** (`session.ts`): per-tab team identity in `sessionStorage`.
- **Scheduler** (`runtime.ts`): one leader tab, chosen by a Web Lock, runs a 1-second loop that ends expired rounds and expires proposals. It stands in for the Phase 4 simulation worker. Team tabs send presence pings for "Teams online".
- **Exports** (`exports.ts`): CSV built in the browser (UTF-8 with BOM) for trades, proposals, ledger, balances, holdings, price events, news releases, leaderboard and audit.

## Dependencies added in Phase 1

- `radix-ui`: accessible headless primitives (dialog, select, tabs, popover, tooltip, switch, checkbox)
- `zod`: `EventConfig` schema shared by templates and the wizard
- `tailwind-merge`: `cn()` resolves conflicting Tailwind classes, so a passed-in `w-20` overrides a base `w-full`
- `vitest` (dev): domain and workflow tests
- `@types/node` upgraded to ^24, matching the Node 24 runtime (required by Vitest 5)

Existing: `lucide-react`, `recharts`.

## Milestones (commits on `phase1-full-prototype`)

- [x] 1. `phase1: restructure routes and foundation`
- [x] 2. `phase1: participant terminal`
- [x] 3. `phase1: host console`
- [x] 4. `phase1: projector experience`
- [x] 5. `phase1: mock event engine and workflows`
- [x] 6. `phase1: tests and final stabilization`

## Verification

- `npm run test`: 34 tests (29 domain, 5 workflow) pass
- `npm run lint`, `npm run typecheck`, `npm run build`: clean
- `scripts/browser-smoke.mjs` (production build, headless Chrome, 4 tabs): 57/57 checks, 0 console errors
- Per-workflow results: `PHASE1_TEST_CHECKLIST.md`

## Important design decisions

- **Colour and theme:**
  - Green and red only for gains and losses; amber `warning` for risky controls and frozen/paused states; one blue accent.
  - Semantic tokens (`canvas`, `surface`, `border`, `fg-primary/secondary/muted`, `accent`, `positive`, `negative`, `warning`). `[data-theme="light"]` overrides the same tokens (scaffold only).
  - Charts read resolved token values at runtime (`useChartPalette`).
- **Confirmation tiers:** confirm / emergency (freeze) / reason (financial and manual corrections) / typed (end event, reset team, code change while live). Buttons are always named after the action.
- **Charts:** step charts, because prices change only through discrete PriceEvents (no background volatility in Phase 1).
- **Leaderboard:** ranked by return %, ties by net worth then team name. Rank movement is measured from round start. CAPITAL_CHANGE moves the capital base; AWARD, PENALTY and CORRECTION affect return.
- **Team reset:** a RESET journal back to the applied allocation. History is kept and the team's open proposals are cancelled.
- **Late teams:** teams added after allocation automatically receive the identical allocation.
- **Demo data:** fixed PINs so docs and the launcher can reference them. Each scenario gives every team exactly ₹10,00,000 of capital.
- **Projector link:** `?key=` is validated when present; a missing key is allowed in the prototype so the plain URL works.
- **Out-of-scope options:** Simulated exchange, automatic news, gradual impacts and net-worth ranking appear as disabled "later" options.

## Known issues / TODO

- **Browser scope:** cross-window sync and presence only work within one browser profile. The scheduler only runs while at least one tab is open.
- **No real security:** PINs are plaintext, the host console has no login, and the projector link isn't enforced without `?key=`.
- **Light theme:** a scaffold only. A forced-light terminal can briefly show dark before the policy applies.
- **Not click-tested in a browser** (logic is covered by tests): adjustment dialogs, manual price dialogs, approval queue, instrument/rounds/general editors, projector scene reorder, audit filter controls, CSV file download, watchlist, theme toggle.
- **Rank movement:** teams tie at round start and ties rank alphabetically, so the first price move can show large movements.
- **Wizard-created teams:** generic names (Team 01…) and sequential PINs. Rename and regenerate them in Teams.
- **Storage limits:** the audit log is uncapped in localStorage; very long sessions could approach the ~5 MB quota. Valuations are capped at 720 snapshots.
- **Housekeeping:** no delete-event UI; `README.md` is still the create-next-app default.

## What Phase 2 replaces

| Phase 1 mock | Phase 2+ replacement |
|---|---|
| `lib/mock/store.ts` (localStorage + Web Locks) | PostgreSQL (Supabase) with real transactions and row locks |
| `lib/mock/commands.ts` bodies | Server actions / route handlers with the same inputs and `OpResult` outputs |
| `lib/mock/session.ts` | Team Code + PIN server sessions, host authentication |
| BroadcastChannel sync + presence | Supabase Realtime broadcast channels + presence |
| `lib/mock/runtime.ts` scheduler | Dedicated simulation worker with an event lock (Phase 4) |
| `lib/mock/exports.ts` | Server CSV/XLSX export routes with audit logging |
| `data/scenarios`, `data/templates.ts` | Seed data and stored `EventTemplate` rows |
| `lib/domain` | Kept: validation and calculations reused server-side; aggregate operations mapped onto repository/SQL transactions |
