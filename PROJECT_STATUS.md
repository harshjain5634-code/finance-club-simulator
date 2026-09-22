# Project status

_Last updated: 2026-09-22 · branch `ui-c4-premium-fintech` · Phase 1 prototype + C4 “Premium Fintech” UI implementation (Figma file `uKRafZUOQb1V0sjxabddJW`, page 43:2)_

Finance Club Stock Market Simulation Platform. **Phase 1 = frontend prototype + mock domain logic only.** It has no database, auth, backend APIs, WebSockets or market data.

## How to run

```bash
npm install
npm run dev          # http://localhost:3000
npm run test         # Vitest: domain + workflow tests (77)
npm run lint
npm run typecheck
npm run build
```

Start at **http://localhost:3000/demo** and use the buttons to open the host console, Team Alpha, Team Beta and the projector in separate tabs. All tabs must be in the **same browser profile**, because they share localStorage and BroadcastChannel.

Demo credentials (`/join/FINSIM26`): Alpha Capital `ALPHA`/`4821`, Beta Street `BETA`/`7390`. The full list is on `/demo` and in `data/scenarios/shared.ts`.

### Review URLs (dev server)

| Screen | URL |
|---|---|
| Participant dashboard / trade / news | `/join/FINSIM26?demo=ALPHA` (signs in) → `/event/FINSIM26/dashboard` · `/event/FINSIM26/trade` · `/event/FINSIM26/news` |
| Host control room / news desk / projector control | `/host/events/demo-event` · `/host/events/demo-event/news` · `/host/events/demo-event/display` |
| Host trades / teams / setup review | `/host/events/demo-event/trades` · `/host/events/demo-event/teams` · `/host/events/demo-event/setup/review` |
| Projector (live rotation) | `/event/FINSIM26/projector` |
| Projector single scenes (local review override) | `?scene=leaderboard` · `?scene=market` · `?scene=news` · `?scene=breaking` (also `standby`, `round`, `movers`, `message`, `final`) |

Team sessions live in `sessionStorage`, so sign a tab in with the `?demo=` link before opening team pages. Breaking news and the news pages need at least one released story: start the event and a round, then release a story.

## Routes

| Area | Routes |
|---|---|
| Entry | `/` · `/join` · `/join/[code]` · `/demo` |
| Participant | `/event/[code]/dashboard` · `/markets` · `/markets/[symbol]` · `/portfolio` · `/trade` · `/transactions` · `/news` · `/leaderboard` · `/rules` |
| Projector | `/event/[code]/projector` (optional `?key=`; `?scene=` shows one scene on that screen only) |
| Host | `/host` · `/host/events/new` · `/host/events/[eventId]` (control room) · `/teams` · `/teams/[teamId]` · `/trades` · `/news` · `/prices` · `/leaderboard` · `/setup` (→ general) · `/setup/general` · `/setup/instruments` · `/setup/allocations` · `/setup/rounds` · `/setup/review` · `/display` · `/audit` · `/exports` |

Demo event: id `demo-event`, code `FINSIM26`. A second sample draft event (`freshers-sprint`, code `FRESH26`) shows the DRAFT state.

## Architecture summary

```
app/                  Thin App Router pages (metadata + one screen component); layouts mount the shells
components/
  ui/                 Primitives: button, badge, card, dialog/drawer, confirm-action-dialog (tiers), data-table,
                      field, money-input, select, tabs, controls (switch/checkbox/tooltip), toaster, misc
  shell/              ThemeScope (data-theme/density on the document), brand, mock-runtime mount
  market/             Shared domain UI: status badges, round clock, value chart, tables (holdings, trades,
                      proposals, ledger, adjustments, leaderboard), widgets (market board, movers, news)
  participant/        ParticipantFrame (240px sidebar, topbar status, tablet drawer, phone bottom tabs), live alerts
                      (Breaking card / Important toast / Update silent), dashboard, trade, markets, stock detail,
                      portfolio, news, transactions, leaderboard screens
  host/               Host shell: 64px LIVE/OPS/SETUP rail, Live Control Strip, shortcut bar, ⌘K palette and
                      keyboard (host-commands.tsx is the single source of availability + confirmations);
                      control room, news desk, trade monitor, teams, setup frame + review, projector controller
  projector/          1920×1080 scaled stage, ticker, scenes, breaking-news and message overlays
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
- `news.ts`: FIXED/RANGE/multi-stock impact resolution, release (resolved once and stored, with `source` MANUAL/RANDOM and `scheduledFor`), preview, skip.
- `random-news.ts`: random release mode. It holds one scheduled story at a time, enforces minimum/maximum gaps and a per-round limit, uses only unused stories from the eligible round and pool, and holds the countdown while the event or round is not running. `tickRandomNews` is called by the scheduler; host overrides are release now, skip, pause, resume and stop.
- `projector.ts`: the current scene and any overlay are derived from event state plus the clock (rotation anchor, pinned scene, takeover). All screens therefore agree. Also contains the host operations: next/previous, pin/resume, show latest news, show message, clear overlay.
- `portfolio.ts`: holdings, cost basis and realized P&L, allocations, cash/holding adjustments, team reset, valuation snapshots.
- `leaderboard.ts`: capital base, return %, ranking and tie-break, rank movement, round P&L, visibility views, frozen snapshot.
- `lifecycle.ts`: event/round lifecycle, freeze, halt, manual price changes, readiness.
- `setup.ts`: teams, instruments, allocation plan, rounds, general settings, leaderboard and projector settings, news library.
- C4 additions (conservative, all tested):
  - `p2p.counterProposal`: a counter is a new prefilled proposal linked by `counterOfProposalId`; the original is rejected with "Countered with PRP-x" and both stay in history. Atomic and idempotent.
  - `leaderboard.sharedRanks`: presentation-only “=7” labels for teams with equal return and net worth. Engine ranks are unchanged.
  - `monitoring.ts`: host flags `HIGH_VALUE` (default ₹50,000, optional `rules.highValueThreshold`) and `FAR_FROM_MARKET` (≥5% from last price; finished proposals are judged against their reference price). Monitoring only: no new approval requirement.
  - `news-schedule.ts`: manual scheduling via optional `NewsItem.scheduledFor` (status stays READY). Validates lead time (10 s–6 h), 30 s spacing and random-news conflicts; releases one due story per tick through the normal manual release path with `scheduledFor` recorded; holds while the event is paused or trading is frozen; `NEWS_SCHEDULED` / `NEWS_UNSCHEDULED` audit. Scheduled stories leave the random pool and the manual queue.
  - `random-news.ts`: `TRADING_FROZEN` is a block reason. Freeze holds the countdown immediately; unfreeze resumes it with the time left (minimum gap still enforced). Both transitions are audited.
  - `setup-checks.ts`: read-only cross-step review (e.g. a Ready story moving a stock that isn't tradable in its round). Must-fix items gate the Start event button in the UI.
- `permissions.ts` defines the role matrix. `event-config.ts` is the zod `EventConfig` schema plus the `EventTemplate` type. `event-state.ts` builds an aggregate from a config. `audit.ts` provides `appendAudit`.

### Mock architecture (Phase 1 only, `lib/mock`)

- **Store:** one JSON document in `localStorage` (`finsim:store`) holds every event aggregate.
- **Transactions:** `transact()` takes a cross-tab **Web Lock**, re-reads the latest state, runs the operation on a copy and persists only on success. This mirrors a DB transaction, so simultaneous accepts from two tabs settle once.
- **Sync:** each commit posts a **BroadcastChannel** message and every tab re-reads (the `storage` event is a fallback). Hooks use `useSyncExternalStore`.
- **Commands** (`commands.ts`): the only way the UI mutates state. Each checks permissions, runs a domain operation, and supports idempotency keys. The inputs and `OpResult` outputs are designed to be reused by server actions.
- **Sessions** (`session.ts`): per-tab team identity in `sessionStorage`.
- **Scheduler** (`runtime.ts`): one leader tab, chosen by a Web Lock, runs a 1-second loop that ends expired rounds, expires proposals and releases due random and scheduled news. It stands in for the Phase 4 simulation worker. Team tabs send presence pings for "Teams online".
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

UX refinement (branch `phase1-ux-refinement`, based on `4bc15f5`):

- [x] `feat: add random news scheduling`
- [x] `ux: simplify participant experience`
- [x] `ux: redesign host control room`
- [x] `ux: improve projector scenes and controls`
- [x] `ux: add participant onboarding and final polish`

Browser audit pass (2026-09-21):

- [x] `fix: accessibility, responsive and chart defects found by browser audit`
- [x] `a11y: meet WCAG AA contrast in the light theme, tighten mobile holdings`

C4 implementation (branch `ui-c4-premium-fintech`):

- [x] `ui: implement C4 design foundation` · `ui: build C4 component system`
- [x] `ui: implement C4 participant shell` · `…dashboard` · `…trade experience` · `…markets` · `ui: implement remaining participant C4 screens`
- [x] `ui: implement C4 host shell` · `…host control room`
- [x] `feat: news desk with manual scheduling; random news pauses during freeze`
- [x] `ui: implement C4 host trade monitor` · `…host team management` · `…event setup flow and review`
- [x] `ui: implement C4 projector controller` · `…projector stage`
- [x] `a11y: fix contrast and tablist semantics found by Lighthouse` · `ui: host strip usable at phone width (visual QA)` · `test: shared leaderboard ranks`

## Verification (C4, 2026-09-22)

- `npm run test`: 77 tests pass (new: counter-offers 4, monitoring 4, news scheduling 6, random news during freeze 3, setup checks 3, shared ranks 3)
- `npm run lint`, `npm run typecheck`, `npm run build`: clean, no build warnings
- Lighthouse accessibility (desktop snapshot): dashboard, markets, trade, host control room, news desk, trades: 100
- Browser workflows (Chrome DevTools, 1440×900 unless noted):
  - A: propose → accept → settle; balances and ledger update
  - B: counter-offer (original rejected with a link, counter settles)
  - C: round control: Start Round with confirmation; P pauses (clock held), P resumes; E opens “End Round 3 now? 14:15 is left”; freeze shows “Trading frozen · Round clock continues”
  - D: triple Accept on one proposal settles once (1 trade, 1 settlement audit); concurrent host Approve ×2 settles once; all 15 journals balance per asset
  - Scheduling: a story scheduled for 17:44:05 was held during a freeze and released at unfreeze with the planned time recorded
- Projector checked at 1920×1080 (leaderboard with =N ranks, breaking takeover with the header clock visible); participant screens also at 390×844

## Verification (Phase 1)

- `npm run test`: 54 tests pass (49 domain, including 11 random-news and 9 projector tests; 5 workflow)
- `npm run lint`, `npm run typecheck`, `npm run build`: clean
- **Route audit** (headless Chrome, dev + production, 37 routes × 1440/1280/768/390): no horizontal
  overflow, no console errors or warnings, exactly one `<h1>` per route, no sub-11px content text.
- **Contrast audit** (every text node, 28 routes × dark and light): all pass WCAG AA.
- **Keyboard audit**: skip link first, off-canvas sidebar correctly out of the tab order, no dead
  tab stops, visible focus on every control.
- `scripts/browser-smoke.mjs` (production build, headless Chrome, 4 tabs): 86/86 checks, 0 console errors. The run covers onboarding, a news-desk release, projector Next/Pin/Resume/message, random mode (release now plus an automatic release after the 30-second gap) and scene-fit checks.
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
- **Out-of-scope options:** Simulated exchange, gradual impacts and net-worth ranking appear as disabled "later" options.
- **Random news safety:**
  - The next release is `max(now + random(min…max), last release + min gap)`, measured from any story, manual or random.
  - Only one story is scheduled at a time.
  - The countdown is held while the event or round is not running and resumes afterwards.
  - A manual release inside the gap pushes the schedule back.
  - Every release stores its scheduled time, actual time and resolved impact.
  - Host overrides (release now, skip) are logged.
- **Projector state is shared, not per screen:**
  - The host's next/previous/pin/message write to event state, and every projector and the host preview resolve the same scene from the clock.
  - Overlays (breaking news, messages) remember the interrupted scene and resume it.
  - Editing scene settings keeps the current scene on screen.
- **C4 design system:** DM Sans for UI, DM Mono for numbers. Four token modes via `data-theme` (participant light default, participant dark, host dark, projector stage) and density via `data-density` (comfortable / compact / touch). Participants default to light; the host is always host-dark/compact; the projector uses the stage theme.
- **News labels:** LOW → Update (feed only), NORMAL → Important (toast), HIGH → Breaking (alert card). Every release takes over the projector for the configured seconds.
- **Host commands:** strip buttons, N/F/P/E keys, G+key navigation and the ⌘K palette call one provider, so availability and confirmations can't drift. “Next round” always says the active round ends first; reversible pause/resume skip confirmation; freeze/end/start/release confirm (confirm dialogs focus Cancel).
- **Projector controller:** Take = pin (hold) the cued scene; “Resume auto-rotate” releases it. Takeovers sit between header and ticker so the clock stays visible.
- **Participant navigation:** six primary items (Dashboard, Markets, Trade, Portfolio, News, Leaderboard) plus Transactions and Rules under "More". Badges appear only for unread news and incoming proposals.
- **Host navigation:** 64px rail grouped LIVE (control room, news desk, trades, projector) / OPS (teams, market, leaderboard, audit) / SETUP (event setup, exports). Round, trading and news actions live in the Live Control Strip on every host page; rarer event actions sit in its “…” menu.
- **Onboarding:** a 3-step dialog shown once per team per event per browser (`localStorage`).

## Known issues / TODO

C4-specific:

- **Deferred by decision:** Disqualify (not offered anywhere) and a host tablet layout (the host console works at phone width but is designed for 1024px+).
- **Not invented (C4 marked unverified or unsupported by the engine):** a projector “news lower third” overlay, a lobby state before Start event, per-story projector treatment, gradual price impacts, and autosave in the news editor (explicit Save instead, to avoid audit noise).
- **Setup flow:** News, Teams and Projector steps open their live pages, so the step rail isn't shown there.
- **Dev only:** after HMR the scheduler tab can keep an old tick function; reload all tabs after changing scheduler code.
- **Demo data:** QA ran on the local demo and it was reset afterwards (`/demo` → “Reset demo event”), so it starts READY with approvals off.
- `package.json` / `package-lock.json` have an uncommitted `shadcn` devDependency that predates this work; it was deliberately not committed.

Phase 1:

- **Browser scope:** cross-window sync and presence only work within one browser profile. The scheduler only runs while at least one tab is open.
- **No real security:** PINs are plaintext, the host console has no login, and the projector link isn't enforced without `?key=`.
- **Light theme:** usable and WCAG AA clean, but tuned less deliberately than dark (the production
  theme). A forced-light terminal can briefly show dark before the policy applies.
- **Not click-tested in a browser** (logic is covered by tests): adjustment dialogs, manual price dialogs, approval queue, instrument/rounds/general editors, projector scene drag-reorder and duration edits, random-news skip/pause/pool switches, news editor, audit filter controls, CSV file download, watchlist, theme toggle.
- **UX limitations of this pass:**
  - The breaking-news toast covers the top-right of team screens for up to 15 s (dismissible).
  - Onboarding is remembered per browser, so a team that switches device sees it again.
  - Scene drag-reorder needs a mouse; touch devices use the up/down buttons.
  - The `?scene=` projector override is local to that screen and meant for review only.
  - The host projector page renders a live 1920×1080 preview, which can be heavy on low-end laptops.
  - Random news runs only while at least one app tab is open (the leader tab), like the rest of the Phase 1 scheduler.
- **Rank movement:** teams tie at round start and ties rank alphabetically, so the first price move can show large movements.
- **Wizard-created teams:** generic names (Team 01…) and sequential PINs. Rename and regenerate them in Teams.
- **Storage limits:** the audit log is uncapped in localStorage; very long sessions could approach the ~5 MB quota. Valuations are capped at 720 snapshots.
- **Housekeeping:** no delete-event UI.

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
