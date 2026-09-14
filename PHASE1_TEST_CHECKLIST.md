# Phase 1 test checklist

Legend: `[x]` passed · `[ ]` pending / not yet verified · `[~]` covered by automated domain tests only (UI not click-tested in a browser)

Setup for manual runs: `npm run dev`, open `/demo`, use **Open host console**, **Open Team Alpha**, **Open Team Beta**, **Open projector** (each opens its own tab).

| # | Workflow | Status | How it is verified |
|---|---|---|---|
| 1 | Create event from template | [ ] | Host → All events → Create event → Classic Mock Stock → Create draft |
| 2 | Add teams | [ ] | Draft event → Teams → Add / Bulk add |
| 3 | Apply allocations | [ ] | Setup → Allocations → Apply allocations (confirm) |
| 4 | Join Alpha / Beta | [ ] | `/join/FINSIM26` with PIN or demo launcher tabs |
| 5 | Start briefing | [ ] | Control room → Start event → Start round (Round 0) |
| 6 | Start trading round | [ ] | Control room → Next round |
| 7 | Alpha proposes SELL 20 NOVA @ ₹525 to Beta | [ ] | Team Alpha → Trade |
| 8 | Beta receives proposal | [ ] | Team Beta toast + Trade → Incoming |
| 9 | Beta accepts | [ ] | Accept & settle |
| 10 | Both portfolios update | [~] | Domain test "settles Alpha selling 20 NOVA…" |
| 11 | Trade monitor updates | [ ] | Host → Trade monitor |
| 12 | Ledger updates | [~] | Domain test (4 balanced postings) + Transactions → Ledger |
| 13 | Audit updates | [~] | Domain test (TRADE_PROPOSED/ACCEPTED/SETTLED) + Audit log |
| 14 | Invalid price outside band rejected | [~] | Domain test "enforces the ±10% band" |
| 15 | Insufficient shares → FAILED | [~] | Domain test "rejects negative holdings" |
| 16 | Reject / cancel / expiry | [~] | Domain test "supports reject, cancel and expiry" |
| 17 | Double accept → one trade | [~] | Domain test + `/demo` idempotency check |
| 18 | Host releases range news (+5 to +10 → e.g. +7.34) | [~] | Domain test "resolves a range impact once" |
| 19 | News appears across participant screens | [ ] | Breaking-news alert in both team tabs |
| 20 | NOVA price changes everywhere | [ ] | Markets / dashboard in all tabs |
| 21 | Projector takeover appears | [ ] | Projector tab |
| 22 | Leaderboard recalculates | [~] | Domain test "ranks by percentage return" |
| 23 | Multi-stock news | [~] | Domain test "moves several stocks…" |
| 24 | Circuit clamp example | [~] | Domain test (VERTEX −12% clamped to −10%) |
| 25 | Manual price change | [ ] | Host → Prices → Set price / Move by % |
| 26 | Halt stock | [~] | Domain test (INSTRUMENT_HALTED) + Prices → Halt |
| 27 | Trading freeze | [~] | Domain test (TRADING_FROZEN) + Freeze trading |
| 28 | Unfreeze | [ ] | Unfreeze trading |
| 29 | Cash AWARD | [~] | Domain test "AWARD raises return" |
| 30 | CAPITAL_CHANGE | [~] | Domain test "CAPITAL_CHANGE does not" |
| 31 | Pause round | [~] | Domain test "pausing holds the remaining time" |
| 32 | Resume round | [~] | Same test |
| 33 | End round | [ ] | Control room → End round |
| 34 | Next round | [~] | Domain test "carries cash, holdings and prices across rounds" |
| 35 | Leaderboard visibility changes | [~] | Domain test (TOP_N pinning / HIDDEN) + Leaderboard control |
| 36 | Leaderboard freeze | [ ] | Leaderboard control → Freeze |
| 37 | Reset team (typed confirmation) | [~] | Domain test "reset team restores the starting allocation" |
| 38 | End event | [ ] | Control room → End event (typed code) |
| 39 | Projector final results | [ ] | Projector tab after end |
| 40 | Audit filtering | [ ] | Audit log filters |
| 41 | CSV export | [ ] | Exports → Download CSV |
| 42 | Switch demo scenario to REAL_SIMULATED | [ ] | `/demo` → Load real-simulated scenario |
