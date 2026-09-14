# Phase 1 test checklist

_Last verified: 2026-09-14 on branch `phase1-full-prototype`_

Legend: `[x]` passed · `[ ]` pending

How each workflow was verified:

- **B · Browser:** `scripts/browser-smoke.mjs` against a production build in headless Chrome, with real clicks across separate host, Alpha, Beta and projector tabs sharing one browser profile. Result: **57/57 checks, 0 console errors.**
- **W · Workflow test:** `lib/mock/__tests__/workflows.test.ts` drives the mock command layer (the same functions the UI buttons call) with permission checks and transactions.
- **D · Domain test:** `lib/domain/__tests__/*.test.ts`, pure logic.

| # | Workflow | Status | Verified by | Notes |
|---|---|---|---|---|
| 1 | Create event from template | [x] | B, W | Wizard (Classic Mock Stock) → draft → setup |
| 2 | Add teams | [x] | W | `addTeams` command; the Add teams dialog is not click-tested |
| 3 | Apply allocations | [x] | B, W | Allocations page → Apply (confirm) → READY |
| 4 | Join Alpha / Beta | [x] | B | Demo sign-in links; PIN form renders (manual PIN entry not automated) |
| 5 | Start briefing | [x] | B, W | Team terminal shows the briefing banner via cross-tab sync |
| 6 | Start trading round | [x] | B, W | "Next round" dialog |
| 7 | Alpha proposes SELL 20 NOVA @ ₹525 to Beta | [x] | B | Trade form UI |
| 8 | Beta receives proposal | [x] | B | Incoming card + toast |
| 9 | Beta accepts | [x] | B | "Accept & settle" |
| 10 | Both portfolios update | [x] | B, D | NOVA 180/220; cash ±₹10,500 |
| 11 | Trade monitor updates | [x] | B | TRD row with buyer/seller/value |
| 12 | Ledger updates | [x] | W, D | TRADE journal with 4 balanced postings |
| 13 | Audit updates | [x] | W, D | TRADE_PROPOSED / ACCEPTED / SETTLED |
| 14 | Invalid price outside band rejected | [x] | W, D | ₹550.05 on a ₹500 reference |
| 15 | Insufficient shares → FAILED | [x] | W, D | "holds only 30 NOVA" |
| 16 | Reject / cancel / expiry | [x] | W, D | Expiry via scheduled work |
| 17 | Double accept → one trade | [x] | W, D | Two simultaneous accepts; `/demo` has a manual check |
| 18 | Host releases range news (+5 to +10) | [x] | B, W | Browser run resolved +8.71%; seeded test resolves exactly +7.34% |
| 19 | News appears across participant screens | [x] | B | Breaking alert in Alpha and Beta tabs |
| 20 | NOVA price changes everywhere | [x] | B | Trade reference, ticker, market board |
| 21 | Projector takeover appears | [x] | B | Breaking-news takeover scene |
| 22 | Leaderboard recalculates | [x] | B, D | Final standings reflect trade + news |
| 23 | Multi-stock news | [x] | W, D | VERTEX/NOVA/APEX |
| 24 | Circuit clamp example | [x] | W, D | VERTEX −12% clamped at −10% circuit |
| 25 | Manual price change | [x] | W | Reason required; MANUAL price event (dialog rendered, not clicked) |
| 26 | Halt stock | [x] | W, D | Proposals blocked while halted |
| 27 | Trading freeze | [x] | B, W | Emergency dialog → team banner |
| 28 | Unfreeze | [x] | B, W | |
| 29 | Cash AWARD | [x] | W, D | Return rises |
| 30 | CAPITAL_CHANGE | [x] | W, D | Capital base moves; return unchanged |
| 31 | Pause round | [x] | W, D | Remaining time held |
| 32 | Resume round | [x] | W, D | |
| 33 | End round | [x] | W | BETWEEN_ROUNDS |
| 34 | Next round | [x] | B, W | Carry-over verified in D |
| 35 | Leaderboard visibility changes | [x] | W, D | TOP_N pins own row; HIDDEN |
| 36 | Leaderboard freeze | [x] | W | Snapshot published to participants/projector |
| 37 | Reset team (typed confirmation) | [x] | W, D | RESET journal; typed-confirmation UI verified on End event (B) |
| 38 | End event | [x] | B, W | Button disabled until code typed + reason |
| 39 | Projector final results | [x] | B | Podium + standings |
| 40 | Audit filtering | [x] | W | Audit contents verified; page renders (B); filter controls not click-tested |
| 41 | CSV export | [x] | W, B | All 9 exports build; exports page + reconciliation PASS (B); file download not triggered headless |
| 42 | Switch demo scenario to REAL_SIMULATED | [x] | B, W | `/demo` → Load real-simulated → RELIANCE detail |

## Not yet click-tested in a browser (logic covered by W/D)

Add-teams dialog, cash/holding adjustment dialogs, manual price dialogs, host approval queue, instrument editor, rounds editor save, general settings save, projector scene reorder/pin, audit filter controls, CSV file download, participant watchlist star, theme toggle (PARTICIPANT_CHOICE).
