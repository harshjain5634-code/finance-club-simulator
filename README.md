# Finance Club — Stock Market Simulation Platform

Run a live stock-market simulation event for a finance club: teams trade with virtual
capital from their own terminals, a host drives the market from a control room, and a
projector screen broadcasts the action to the room.

> **Phase 1 prototype.** Everything runs in the browser against a mock backend
> (`localStorage` + `BroadcastChannel`). There is no database, authentication, real money
> or live market data. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the full picture.

## Run it locally

```bash
npm install
npm run dev
```

Then open **<http://localhost:3000/demo>** — the demo launcher opens the host console,
two team terminals and the projector in separate tabs.

> All tabs must be in the **same browser profile**: they share `localStorage` and a
> `BroadcastChannel` to stay in sync.

Demo event code `FINSIM26`. Teams sign in at `/join/FINSIM26` — Alpha Capital
`ALPHA`/`4821`, Beta Street `BETA`/`7390`. The full list is on `/demo`.

## The three surfaces

| Surface | Route | What it is |
|---|---|---|
| **Team terminal** | `/event/FINSIM26/dashboard` | Portfolio, live P&L, rank, markets, order ticket, news and leaderboard |
| **Host control room** | `/host/events/demo-event` | Round and trading controls, news desk, price moves, teams, audit and CSV exports |
| **Projector** | `/event/FINSIM26/projector` | Full-screen audience display with rotating scenes and breaking-news takeovers |

Add `?scene=leaderboard` (or `market`, `movers`, `news`, `breaking`, `round`, `standby`,
`final`) to the projector URL to review a single scene on that screen only.

## How an event runs

1. **Set up** the event in Host → Setup: teams, instruments, allocations and rounds.
2. **Start the event**, then run a briefing round followed by trading rounds.
3. **Release news** from the news desk — manually, or let random mode schedule stories.
   Each story resolves its price impact once and stores the exact result.
4. **Teams trade peer-to-peer**: one team proposes, the other accepts, and the trade
   settles atomically through a double-entry ledger.
5. **Rank** by return on capital base. Freeze the leaderboard for the reveal, then end
   the event and export CSVs.

## Scripts

```bash
npm run dev         # dev server on :3000
npm run build       # production build
npm run start       # serve the production build
npm run test        # Vitest — domain and workflow tests
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

### Cross-window smoke test

Drives four real browser windows through a whole event over the DevTools Protocol:

```bash
npm run build && npx next start -p 3100
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/finsim-smoke about:blank
node scripts/browser-smoke.mjs smoke-output
```

## Architecture

```
app/          Thin App Router pages; layouts mount the shells
components/
  ui/         Primitives: button, badge, card, dialog, data-table, field, tabs, toaster…
  shell/      ThemeScope (theme + density on the document), brand
  market/     Shared domain UI: status badges, round clock, charts, tables, widgets
  participant/ Team terminal frame (sidebar, topbar status, phone tab bar) and screens
  host/       Host rail + Live Control Strip + ⌘K palette, control room, news desk, trades,
              teams, setup review, projector controller
  projector/  1920×1080 scaled stage, scenes and overlays
lib/
  domain/     Pure TypeScript domain logic, no React (money, ledger, prices, news…)
  mock/       Phase 1 mock backend: store, commands, selectors, hooks, scheduler
data/         Scenario configs, templates and pre-event price history
```

Money is stored as integer paise throughout and formatted as INR with Indian digit
grouping. Prices move only through discrete, audited price events — never background
volatility — so charts are step charts.

`lib/domain` is deliberately free of React and storage concerns so it can be reused
server-side later; `lib/mock/commands.ts` takes the inputs and returns the result shape
that server actions will use.

## Design system

The C4 “Premium Fintech” system (Figma `uKRafZUOQb1V0sjxabddJW`). DM Sans for text,
DM Mono for numbers. Semantic tokens only (`canvas`, `surface`, `border`,
`fg-primary/secondary/muted`, `accent`, `positive`, `negative`, `warning`) defined in
`app/globals.css`, with four modes selected by `data-theme`: participant light (default),
participant dark, host dark, and the projector stage. Density (`comfortable`, `compact`,
`touch`) is set with `data-density`.

Green and red are reserved for gains and losses and are always paired with a `+`/`−`
sign, never colour alone. Every route has been checked for WCAG AA contrast in both
themes, at 1440 / 1280 / 768 / 390 px.
