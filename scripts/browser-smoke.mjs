// Cross-window regression run over the Chrome DevTools Protocol (no extra dependencies).
// It drives the C4 UI the way a host and two teams would, in four tabs that share localStorage.
//
// Usage (one production server + one headless Chrome; stop both afterwards):
//   npm run build && npx next start -p 3100
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/finsim-smoke about:blank
//   node scripts/browser-smoke.mjs smoke-output
import { mkdirSync, writeFileSync } from "node:fs";
import { openTab, sleep } from "./cdp.mjs";

const OUT = process.argv[2] ?? "smoke-output";
mkdirSync(OUT, { recursive: true });

const results = { checks: [], errors: {}, screenshots: [] };
const check = (name, ok, detail = "") => {
  results.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const SCENE_LABEL = { STANDBY: "Standby", ROUND_STATUS: "Round status", LEADERBOARD: "Leaderboard", MARKET_BOARD: "Market board", TOP_MOVERS: "Top movers", NEWS_WALL: "News", CUSTOM_MESSAGE: "Custom message", FINAL_RESULTS: "Final results" };

const shot = async (tab, label) => results.screenshots.push(await tab.shot(OUT, label));

const noAppError = async (tab, label) => {
  const text = await tab.text();
  const ok = !/Application error|client-side exception|Unhandled Runtime Error/i.test(text) && text.trim().length > 40;
  check(`renders ${label}`, ok, ok ? "" : text.slice(0, 160));
};

/** Clicks a button in the topmost dialog and waits for that dialog to close. */
const confirmDialog = async (tab, label) => {
  await tab.waitFor(`document.querySelector('[role="dialog"],[role="alertdialog"]')`);
  await sleep(200);
  const clicked = await tab.eval(`__clickExact(${JSON.stringify(label)}, "dialog")`);
  await tab.waitFor(`!document.querySelector('[role="dialog"],[role="alertdialog"]')`, 6000);
  return clicked;
};

try {
  /* ── Entry routes ─────────────────────────────────────────────────────── */
  const host = await openTab("host", "/", 1440, 900, results);
  await noAppError(host, "/");
  for (const path of ["/join", "/join/FINSIM26", "/demo", "/host", "/host/events/new"]) {
    await host.go(path);
    await noAppError(host, path);
  }

  /* ── Clean demo, then take it live from the Live Control Strip ────────── */
  await host.go("/demo");
  await host.eval(`__click("Reset demo event")`);
  await confirmDialog(host, "Reset demo event");
  check("demo reset to READY", await host.waitFor(`__demo().event.status === "READY" && __demo().trades.length === 0`, 8000));

  await host.go("/host/events/demo-event");
  check("control room shows the setup checklist", await host.waitFor(`document.body.innerText.includes("Before you go live")`));
  await shot(host, "01-host-setup");

  await host.eval(`__click("Start event")`);
  await confirmDialog(host, "Start event");
  check("event started", await host.waitFor(`__demo().event.status === "LIVE"`));

  await host.eval(`__click("Start briefing")`);
  await confirmDialog(host, "Start briefing");
  check("briefing running", await host.waitFor(`__demo().rounds[0].status === "RUNNING"`));

  // The briefing has to finish before Round 1 can start; the strip always says which round it is ending.
  await host.eval(`__click("End round…")`);
  await confirmDialog(host, "End Round 0");
  check("briefing ended", await host.waitFor(`__demo().rounds[0].status === "ENDED"`, 8000));
  await host.eval(`__click("Start Round 1")`);
  await confirmDialog(host, "Start Round 1");
  check("round 1 running", await host.waitFor(`__demo().rounds[1].status === "RUNNING"`, 8000));
  await shot(host, "02-host-control-room-live");

  /* ── Teams sign in (separate tabs, shared store) ──────────────────────── */
  const alpha = await openTab("alpha", "/join/FINSIM26?demo=ALPHA", 1440, 900, results);
  check("alpha reaches the dashboard", await alpha.waitFor(`location.pathname.endsWith("/dashboard") && document.body.innerText.includes("Net worth")`, 15000));
  await alpha.waitFor(`document.querySelector('[role="dialog"]')`, 4000);
  await alpha.eval(`__clickExact("Start trading", "dialog")`);
  check("onboarding dismissed and remembered", await alpha.waitFor(`!document.querySelector('[role="dialog"]') && localStorage.getItem("finsim:onboarded:demo-event:team-alpha") === "done"`));

  const beta = await openTab("beta", "/join/FINSIM26?demo=BETA", 1440, 900, results);
  check("beta reaches the dashboard", await beta.waitFor(`location.pathname.endsWith("/dashboard")`, 15000));
  await beta.waitFor(`document.querySelector('[role="dialog"]')`, 4000);
  await beta.eval(`__clickExact("Start trading", "dialog")`);

  const projector = await openTab("projector", "/event/FINSIM26/projector", 1920, 1080, results);
  check("projector renders the stage", await projector.waitFor(`__stageLabel().startsWith("Projector:")`));

  /* ── Propose → counter → settle ───────────────────────────────────────── */
  await alpha.go("/event/FINSIM26/trade");
  await alpha.waitFor(`document.querySelector("#trade-price")`);
  await alpha.eval(`__setInput("#trade-price", "525")`);
  await alpha.eval(`__setInput("#trade-qty", "20")`);
  await sleep(400);
  await alpha.eval(`__click("Send proposal to")`);
  check("proposal stored as PROPOSED", await alpha.waitFor(`__demo().proposals.some(p => p.status === "PROPOSED" && p.quantity === 20 && p.counterpartyTeamId === "team-beta")`));

  await beta.go("/event/FINSIM26/trade");
  check("beta sees the incoming proposal", await beta.waitFor(`document.body.innerText.includes("Accept & settle")`));
  await shot(beta, "03-beta-incoming");
  await beta.eval(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Counter") && !b.disabled)?.click()`);
  await beta.waitFor(`location.search.includes("counter=")`);
  await beta.eval(`__setInput("#trade-price", "520")`);
  await sleep(400);
  await beta.eval(`__click("Send counter-offer to")`);
  const counter = await beta.waitFor(`__demo().proposals.some(p => p.counterOfProposalId && p.status === "PROPOSED")`, 8000);
  check("counter-offer creates a linked proposal", counter);
  check(
    "original is rejected with a link to the counter",
    await beta.waitFor(`(() => { const s = __demo(); const c = s.proposals.find(p => p.counterOfProposalId); const o = s.proposals.find(p => p.id === c?.counterOfProposalId); return o?.status === "REJECTED" && (o?.rejectionReason ?? "").includes(c.id); })()`),
  );

  await alpha.go("/event/FINSIM26/trade");
  check("alpha sees the counter-offer", await alpha.waitFor(`document.body.innerText.includes("Accept & settle")`));
  await alpha.eval(`__click("Accept & settle")`);
  check("counter settles once", await alpha.waitFor(`__demo().trades.length === 1`, 8000));
  const ledger = await alpha.eval(`(() => { const s = __demo(); const t = s.trades[0]; const j = s.journals.find(j => j.id === t.journalId); const sums = {}; for (const p of j.postings) sums[p.asset] = (sums[p.asset] ?? 0) + p.amount; return { postings: j.postings.length, balanced: Object.values(sums).every(v => v === 0), price: t.price, qty: t.quantity }; })()`);
  check("settlement writes one balanced journal", ledger.balanced && ledger.postings === 4, JSON.stringify(ledger));

  /* ── Double settlement can never happen ───────────────────────────────── */
  await alpha.go("/event/FINSIM26/trade");
  await alpha.waitFor(`document.querySelector("#trade-price")`);
  await alpha.eval(`__setInput("#trade-price", "530")`);
  await alpha.eval(`__setInput("#trade-qty", "10")`);
  await sleep(400);
  await alpha.eval(`__click("Send proposal to")`);
  await alpha.waitFor(`__demo().proposals.some(p => p.status === "PROPOSED" && p.quantity === 10)`);
  await host.go("/demo");
  await host.eval(`__click("Run double-accept test")`);
  await host.waitFor(`document.body.innerText.includes("already settled") || document.body.innerText.includes("settled")`, 8000);
  const afterRace = await host.eval(`(() => { const s = __demo(); return { trades: s.trades.length, settledAudits: s.audit.filter(a => a.type === "TRADE_SETTLED").length }; })()`);
  check("two simultaneous accepts settle exactly once", afterRace.trades === 2 && afterRace.settledAudits === 2, JSON.stringify(afterRace));

  /* ── News release reaches teams and the projector ─────────────────────── */
  await host.go("/host/events/demo-event/news");
  await host.waitFor(`document.body.innerText.includes("Nova Motors secures")`);
  await host.eval(`(() => { const row = [...document.querySelectorAll("li button")].find(b => b.innerText.includes("Nova Motors secures")); if (row) row.click(); return !!row; })()`);
  check("news desk opens the selected story", await host.waitFor(`document.querySelector("#story-headline")?.value.includes("Nova Motors secures")`, 6000));
  await host.eval(`__click("Release now")`);
  await confirmDialog(host, "Release news");
  check("news released and NOVA repriced", await host.waitFor(`__demo().newsReleases.length === 1 && __demo().prices["ins-nova"].price !== 50000`, 8000));
  const breaking = `document.body.innerText.toUpperCase().includes("NOVA MOTORS SECURES")`;
  check("projector shows the takeover", await projector.waitFor(`document.body.innerText.toUpperCase().includes("BREAKING NEWS") && ${breaking}`, 8000));
  check("alpha sees the breaking alert", await alpha.waitFor(breaking, 8000));
  await shot(projector, "04-projector-breaking");

  /* ── Freeze holds trading and the random-news countdown ───────────────── */
  await host.go("/host/events/demo-event/news");
  await host.eval(`__click("Random:")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__clickLabel("Random news on or off", "dialog")`);
  check("random news running", await host.waitFor(`__demo().randomNews.status === "RUNNING" && __demo().randomNews.nextReleaseAt !== null`, 8000));
  await host.eval(`__clickExact("Done", "dialog")`);
  await sleep(300);

  await host.eval(`__click("Freeze trading")`);
  await confirmDialog(host, "Freeze trading");
  check("trading frozen", await host.waitFor(`__demo().event.tradingFrozen === true`));
  check(
    "random news countdown held while frozen",
    await host.waitFor(`__demo().randomNews.nextReleaseAt === null && __demo().randomNews.heldRemainingMs > 0 && __demo().randomNews.status === "RUNNING"`, 6000),
  );
  check("freeze is audited in plain language", await host.eval(`__demo().audit.some(a => a.type === "NEWS_RANDOM_PAUSED" && a.summary.includes("trading is frozen"))`));
  await alpha.go("/event/FINSIM26/dashboard");
  check("alpha sees the frozen state with the clock still running", await alpha.waitFor(`document.body.innerText.includes("Trading is frozen by the host") && document.body.innerText.includes("clock keeps running")`, 8000));
  await shot(alpha, "05-alpha-frozen");
  const releasesWhileFrozen = await host.eval(`__demo().newsReleases.length`);

  await host.eval(`__click("Unfreeze trading")`);
  await confirmDialog(host, "Unfreeze trading");
  check("trading unfrozen", await host.waitFor(`__demo().event.tradingFrozen === false`));
  check("nothing was released while frozen", (await host.eval(`__demo().newsReleases.length`)) === releasesWhileFrozen);
  check("countdown resumes with the time it had left", await host.waitFor(`__demo().randomNews.nextReleaseAt !== null && __demo().randomNews.heldRemainingMs === null`, 6000));
  await host.go("/host/events/demo-event/news");
  await host.eval(`__click("Random:")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__clickLabel("Random news on or off", "dialog")`);
  await host.eval(`__clickExact("Done", "dialog")`);

  /* ── Projector controller: cue, take, clear ───────────────────────────── */
  await host.go("/host/events/demo-event/display");
  await host.waitFor(`document.body.innerText.includes("Program")`);
  // Cue tiles are the buttons carrying aria-pressed; pick one that is not already on air.
  const cuedOk = await host.eval(`(() => { const tiles = [...document.querySelectorAll("li button[aria-pressed]")]; const tile = tiles.find((b) => !b.disabled && !b.innerText.includes("On air")); if (!tile) return false; tile.click(); return true; })()`);
  check("a scene can be cued", cuedOk);
  await sleep(400);
  await host.eval(`__click("Take")`);
  const pinned = await host.waitFor(`__demo().event.projector.pinnedScene !== null`, 6000);
  check("Take puts the cued scene on air and holds it", pinned);
  const pinnedScene = await host.eval(`__demo().event.projector.pinnedScene`);
  const pinnedLabel = SCENE_LABEL[pinnedScene] ?? "";
  check("projector follows the host", await projector.waitFor(`__stageLabel() === ${JSON.stringify(`Projector: ${pinnedLabel}`)}`, 8000), `${pinnedScene}`);
  await host.eval(`__click("Resume auto-rotate")`);
  check("auto-rotate resumes", await host.waitFor(`__demo().event.projector.pinnedScene === null`, 6000));
  await shot(host, "06-host-projector-controller");

  /* ── Participant routes, then the same on a phone ─────────────────────── */
  for (const path of ["dashboard", "markets", "markets/NOVA", "portfolio", "trade", "transactions", "news", "leaderboard", "rules"]) {
    await alpha.go(`/event/FINSIM26/${path}`);
    await noAppError(alpha, `/event/FINSIM26/${path}`);
  }
  await shot(alpha, "07-alpha-dashboard");

  await alpha.resize(390, 844);
  for (const path of ["dashboard", "markets", "trade", "portfolio", "news", "leaderboard"]) {
    await alpha.go(`/event/FINSIM26/${path}`, 700);
    const overflow = await alpha.eval(`__overflow()`);
    check(`no horizontal overflow at 390px · ${path}`, overflow <= 1, `${overflow}px`);
  }
  await shot(alpha, "08-alpha-mobile");
  await alpha.resize(1440, 900);

  /* ── Host routes ──────────────────────────────────────────────────────── */
  for (const path of ["", "/news", "/trades", "/teams", "/teams/team-alpha", "/prices", "/leaderboard", "/display", "/audit", "/exports", "/setup/general", "/setup/instruments", "/setup/allocations", "/setup/rounds", "/setup/review"]) {
    await host.go(`/host/events/demo-event${path}`);
    await noAppError(host, `/host/events/demo-event${path}`);
  }
  await host.go("/host/events/demo-event/exports");
  // Click until the panel answers: right after a navigation the button can exist before its handler is attached.
  let reconciled = false;
  for (let attempt = 0; attempt < 8 && !reconciled; attempt++) {
    await host.eval(`__click("Run check")`);
    reconciled = await host.waitFor(`(() => { const t = document.body.innerText; return t.includes("Ledger balanced") && t.includes("Cash projections match"); })()`, 2000);
  }
  const reconText = await host.eval(`(() => { const t = document.body.innerText; const i = t.indexOf("Reconciliation"); return t.slice(i, i + 200).split(String.fromCharCode(10)).join(" "); })()`);
  check("ledger reconciliation passes", reconciled && !reconText.includes("FAIL"), reconText.slice(0, 90));
  await shot(host, "09-host-reconciliation");
} catch (error) {
  check("smoke run completed", false, String(error?.stack ?? error));
}

const consoleIssues = Object.values(results.errors).flat();
writeFileSync(`${OUT}/results.json`, JSON.stringify({ ...results, consoleIssues }, null, 2));
const passed = results.checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${results.checks.length} checks passed · ${consoleIssues.length} console errors/warnings`);
for (const issue of consoleIssues.slice(0, 10)) console.log(`  [console ${issue.at}] ${issue.message}`);
process.exit(passed === results.checks.length && consoleIssues.length === 0 ? 0 : 1);
