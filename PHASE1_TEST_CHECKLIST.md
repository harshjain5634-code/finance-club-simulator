# Phase 1 test checklist

_Last verified: 2026-09-14 on branch `phase1-ux-refinement`_

Legend: `[x]` passed · `[ ]` pending

How each workflow was verified:

- **B · Browser:** `scripts/browser-smoke.mjs` against a production build in headless Chrome, with real clicks across separate host, Alpha, Beta and projector tabs sharing one browser profile. Result: **86/86 checks, 0 console errors.**
- **W · Workflow test:** `lib/mock/__tests__/workflows.test.ts` drives the mock command layer (the same functions the UI buttons call) with permission checks and transactions.
- **D · Domain test:** `lib/domain/__tests__/*.test.ts`, pure logic (49 tests, including `random-news.test.ts` and `projector.test.ts`).

| # | Workflow | Status | Verified by | Notes |
|---|---|---|---|---|
| 1 | Create event from template | [x] | B, W | Wizard (Classic Mock Stock) → draft → setup |
| 2 | Add teams | [x] | W | `addTeams` command; the Add teams dialog is not click-tested |
| 3 | Apply allocations | [x] | B, W | Allocations page → Apply (confirm) → READY |
| 4 | Join Alpha / Beta | [x] | B | Demo sign-in links; PIN form renders (manual PIN entry not automated) |
| 5 | Start briefing | [x] | B, W | Status-bar button; the team dashboard's "Now" card explains the briefing via cross-tab sync |
| 6 | Start trading round | [x] | B, W | Status-bar "Next round" → "End R0 & start R1" |
| 7 | Alpha proposes SELL 20 NOVA @ ₹525 to Beta | [x] | B | Simplified trade form → "Send proposal to Beta Street" |
| 8 | Beta receives proposal | [x] | B | Dashboard "Review proposals" card, Trade → "Needs your response" |
| 9 | Beta accepts | [x] | B | "Accept & settle" |
| 10 | Both portfolios update | [x] | B, D | NOVA 180/220; cash ±₹10,500 |
| 11 | Trade monitor updates | [x] | B | TRD row with buyer/seller/value |
| 12 | Ledger updates | [x] | W, D | TRADE journal with 4 balanced postings |
| 13 | Audit updates | [x] | W, D | TRADE_PROPOSED / ACCEPTED / SETTLED |
| 14 | Invalid price outside band rejected | [x] | W, D | ₹550.05 on a ₹500 reference |
| 15 | Insufficient shares → FAILED | [x] | W, D | "holds only 30 NOVA" |
| 16 | Reject / cancel / expiry | [x] | W, D | Expiry via scheduled work |
| 17 | Double accept → one trade | [x] | W, D | Two simultaneous accepts; `/demo` has a manual check |
| 18 | Host releases range news (+5 to +10) | [x] | B, W | News desk → Release → preview dialog; browser runs resolved +8.74% / +8.48%; seeded test resolves exactly +7.34% |
| 19 | News appears across participant screens | [x] | B | Breaking-news toast in Alpha and Beta tabs; dashboard latest-news module |
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
| 38 | End event | [x] | B, W | "Event" menu → End event…; button disabled until code typed + reason |
| 39 | Projector final results | [x] | B | Podium + standings |
| 40 | Audit filtering | [x] | W | Audit contents verified; page renders (B); filter controls not click-tested |
| 41 | CSV export | [x] | W, B | All 9 exports build; exports page + reconciliation PASS (B); file download not triggered headless |
| 42 | Switch demo scenario to REAL_SIMULATED | [x] | B, W | `/demo` → Load real-simulated → RELIANCE detail |

## UX refinement workflows

| # | Workflow | Status | Verified by | Notes |
|---|---|---|---|---|
| 43 | First-entry onboarding | [x] | B | Shown on first sign-in; Skip / Start trading; never shown again after dismissal (reload checked) |
| 44 | Random mode: settings, start, countdown | [x] | B, D | Control room → Random → Settings (30 s gap) → Start; "Next random news in mm:ss" |
| 45 | Random release now (host override) | [x] | B, D | Logged as RELEASED_EARLY; source RANDOM |
| 46 | Automatic random release | [x] | B, D | Released 30.2 s after the previous story (≥ min gap), `releasedAt ≥ scheduledFor`, logged RELEASED |
| 47 | Random safety rules | [x] | D | Min/max gap, released stories never picked, paused round / stopped mode block, eligible round only, max per round, one schedule at a time |
| 48 | Random mode stop | [x] | B, D | Status STOPPED; nothing scheduled |
| 49 | Projector Next / Pin current / Resume rotation | [x] | B, D | Projector tab follows the shared rotation |
| 50 | Projector custom message overlay + clear | [x] | B, D | "Round 2 begins in 2 minutes"; interrupted scene resumes |
| 51 | Breaking-news overlay resumes the interrupted scene | [x] | D | Also when cleared early or replaced by a second story |
| 52 | Projector scenes fit 1920×1080 | [x] | B | round, leaderboard, market board, movers, news, breaking (`?scene=` review override) |

## Not yet click-tested in a browser (logic covered by W/D)

Add-teams dialog, cash/holding adjustment dialogs, manual price dialogs, host approval queue, instrument editor, rounds editor save, general settings save, projector scene drag-reorder / duration edits / leaderboard and ticker options, random-news skip / pause / pool switches, news editor, audit filter controls, CSV file download, participant watchlist star, theme toggle (PARTICIPANT_CHOICE).
